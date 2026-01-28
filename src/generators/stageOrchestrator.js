/**
 * Stage Orchestrator
 * Breaks generation into non-blocking stages with progress callbacks
 *
 * Purpose: Prevent timeout failures by:
 * 1. Breaking work into stages < 5 minutes each
 * 2. Emitting progress events for heartbeat
 * 3. Saving output at each stage for recovery
 * 4. Supporting resume from any stage
 */

const fs = require('fs').promises;
const path = require('path');
const ChunkPersistence = require('./chunkPersistence');
const DebugLogger = require('../utils/debugLogger');
const CanonDeltaExtractor = require('./canonDeltaExtractor');
const StateUpdater = require('./stateUpdater');
const PostProcessor = require('./postProcessor');

// Stage definitions
const STAGES = {
  INIT: 'init',
  DRAFT_GENERATION: 'draft_generation',
  ASSEMBLY: 'assembly',
  AUDIT: 'audit',
  REFINEMENT: 'refinement',
  PACKAGING: 'packaging',
  COMPLETE: 'complete'
};

class StageOrchestrator {
  constructor(options = {}) {
    // Core services (injected)
    this.storyGenerator = options.storyGenerator;
    this.stateManager = options.stateManager;
    this.claudeClient = options.claudeClient;
    this.revisionAuditor = options.revisionAuditor;
    this.storyRefiner = options.storyRefiner;
    this.constraintEnforcer = options.constraintEnforcer;
    this.outputPackager = options.outputPackager;

    // Configuration
    this.baseDir = options.baseDir || path.join(process.cwd(), 'generated');
    this.safeChunkSize = options.chunkSize || 2000; // Safe chunk size in words
    this.heartbeatInterval = options.heartbeatInterval || 10000; // 10 seconds
    this.maxStageTime = options.maxStageTime || 300000; // 5 minutes per stage

    // Progress callback
    this.onProgress = options.onProgress || (() => {});

    // Per-session state
    this.sessionId = null;
    this.debugLogger = null;
    this.chunkPersistence = null;
    this.heartbeatTimer = null;
    this.currentStage = null;
    this.stageStartTime = null;
  }

  /**
   * Generate story in stages with progress streaming
   *
   * @param {string} sessionId - Session identifier
   * @param {object} config - Generation configuration
   * @returns {Promise<object>} Generation result
   */
  async generateInStages(sessionId, config) {
    this.sessionId = sessionId;
    this.currentStage = STAGES.INIT;

    // Initialize per-session modules
    this.debugLogger = new DebugLogger(sessionId, { baseDir: this.baseDir });
    this.chunkPersistence = new ChunkPersistence({ baseDir: this.baseDir });

    await this.debugLogger.initialize();

    const result = {
      sessionId,
      success: true,
      stages: {},
      currentStage: STAGES.INIT,
      totalWords: 0,
      totalChunks: 0,
      story: null,
      downloadUrl: null,
      errors: []
    };

    // Start heartbeat
    this.startHeartbeat(result);

    try {
      // Emit initial progress
      this.emitProgress('start', {
        sessionId,
        targetWords: config.wordCount,
        estimatedChunks: Math.ceil(config.wordCount / this.safeChunkSize),
        stages: Object.values(STAGES)
      });

      await this.debugLogger.start('Stage orchestration started', {
        targetWords: config.wordCount,
        chunkSize: this.safeChunkSize,
        stages: Object.values(STAGES)
      });

      // ===== STAGE 1: Draft Generation =====
      this.currentStage = STAGES.DRAFT_GENERATION;
      result.currentStage = STAGES.DRAFT_GENERATION;
      this.stageStartTime = Date.now();

      this.emitProgress('stage_start', {
        stage: STAGES.DRAFT_GENERATION,
        message: 'Starting draft generation...'
      });

      result.stages.draftGeneration = await this.stage1_DraftGeneration(config);

      if (!result.stages.draftGeneration.success) {
        throw new Error(`Draft generation failed: ${result.stages.draftGeneration.error}`);
      }

      result.totalWords = result.stages.draftGeneration.totalWords;
      result.totalChunks = result.stages.draftGeneration.totalChunks;

      this.emitProgress('stage_complete', {
        stage: STAGES.DRAFT_GENERATION,
        totalWords: result.totalWords,
        totalChunks: result.totalChunks,
        duration: Date.now() - this.stageStartTime
      });

      // ===== STAGE 2: Assembly (with partial recovery) =====
      this.currentStage = STAGES.ASSEMBLY;
      result.currentStage = STAGES.ASSEMBLY;
      this.stageStartTime = Date.now();

      this.emitProgress('stage_start', {
        stage: STAGES.ASSEMBLY,
        message: 'Assembling chunks into full story...'
      });

      try {
        result.stages.assembly = await this.stage2_Assembly();

        if (!result.stages.assembly.success) {
          console.warn('⚠️ Assembly failed, attempting partial recovery...');
          // Try to get raw chunks even if assembly failed
          result.stages.assembly = await this.stage2_PartialRecovery();
        }
      } catch (assemblyError) {
        console.error('Assembly error:', assemblyError.message);
        // Attempt partial recovery on error
        try {
          result.stages.assembly = await this.stage2_PartialRecovery();
          console.log('✅ Partial recovery successful');
        } catch (recoveryError) {
          console.error('Partial recovery also failed:', recoveryError.message);
          result.stages.assembly = {
            success: false,
            error: assemblyError.message,
            partialRecovery: false
          };
        }
      }

      // Even if assembly partially failed, try to continue with what we have
      if (result.stages.assembly.success || result.stages.assembly.partialRecovery) {
        result.story = result.stages.assembly.story || '';
      } else {
        // Last resort: concatenate any chunks we saved
        result.story = result.stages.assembly.rawChunks?.join('\n\n---\n\n') || '';
      }

      this.emitProgress('stage_complete', {
        stage: STAGES.ASSEMBLY,
        wordCount: result.stages.assembly.wordCount || this.countWords(result.story),
        partial: !result.stages.assembly.success,
        duration: Date.now() - this.stageStartTime
      });

      // ===== STAGE 3: Audit (Optional) =====
      if (config.runAudit !== false && this.revisionAuditor) {
        this.currentStage = STAGES.AUDIT;
        result.currentStage = STAGES.AUDIT;
        this.stageStartTime = Date.now();

        this.emitProgress('stage_start', {
          stage: STAGES.AUDIT,
          message: 'Running structural audit...'
        });

        result.stages.audit = await this.stage3_Audit(result.story, config);

        this.emitProgress('stage_complete', {
          stage: STAGES.AUDIT,
          score: result.stages.audit.score,
          needsRefinement: result.stages.audit.needsRefinement,
          duration: Date.now() - this.stageStartTime
        });
      } else {
        result.stages.audit = { skipped: true };
      }

      // ===== STAGE 4: Refinement (Optional) =====
      const shouldRefine = config.runRefinement !== false &&
        this.storyRefiner &&
        result.stages.audit?.needsRefinement;

      if (shouldRefine) {
        this.currentStage = STAGES.REFINEMENT;
        result.currentStage = STAGES.REFINEMENT;
        this.stageStartTime = Date.now();

        this.emitProgress('stage_start', {
          stage: STAGES.REFINEMENT,
          message: 'Applying refinements...'
        });

        result.stages.refinement = await this.stage4_Refinement(
          result.story,
          result.stages.audit.rawReport
        );

        if (result.stages.refinement.success) {
          result.story = result.stages.refinement.story;
        }

        this.emitProgress('stage_complete', {
          stage: STAGES.REFINEMENT,
          rounds: result.stages.refinement.rounds,
          duration: Date.now() - this.stageStartTime
        });
      } else {
        result.stages.refinement = { skipped: true };
      }

      // ===== STAGE 5: Packaging =====
      this.currentStage = STAGES.PACKAGING;
      result.currentStage = STAGES.PACKAGING;
      this.stageStartTime = Date.now();

      this.emitProgress('stage_start', {
        stage: STAGES.PACKAGING,
        message: 'Creating output package...'
      });

      result.stages.packaging = await this.stage5_Packaging(result);

      if (result.stages.packaging.success) {
        result.downloadUrl = result.stages.packaging.downloadUrl;
      }

      this.emitProgress('stage_complete', {
        stage: STAGES.PACKAGING,
        downloadUrl: result.downloadUrl,
        duration: Date.now() - this.stageStartTime
      });

      // ===== COMPLETE =====
      this.currentStage = STAGES.COMPLETE;
      result.currentStage = STAGES.COMPLETE;

      await this.debugLogger.complete('All stages completed successfully', {
        totalWords: result.totalWords,
        totalChunks: result.totalChunks,
        stages: Object.keys(result.stages)
      });

      this.emitProgress('complete', {
        sessionId,
        totalWords: result.totalWords,
        totalChunks: result.totalChunks,
        downloadUrl: result.downloadUrl
      });

    } catch (error) {
      result.success = false;
      result.errors.push({
        stage: this.currentStage,
        message: error.message,
        timestamp: new Date().toISOString()
      });

      await this.debugLogger.error(`Stage failed: ${this.currentStage}`, {
        stage: this.currentStage,
        error: error.message
      });

      // Save error report
      await this.saveErrorReport(result, error);

      this.emitProgress('error', {
        stage: this.currentStage,
        error: error.message,
        partialResult: {
          chunksCompleted: result.totalChunks,
          wordsGenerated: result.totalWords
        }
      });

    } finally {
      this.stopHeartbeat();
      await this.debugLogger.finalize();
    }

    return result;
  }

  /**
   * Stage 1: Draft Generation (chunked)
   */
  async stage1_DraftGeneration(config) {
    const targetWordCount = config.wordCount;
    const chunks = [];
    let currentWordCount = 0;
    let sceneNumber = 1;
    let previousProse = '';

    // Initialize delta extractor and state updater
    const deltaExtractor = new CanonDeltaExtractor(this.claudeClient);
    const stateUpdater = new StateUpdater(this.stateManager);

    while (currentWordCount < targetWordCount) {
      const remainingWords = targetWordCount - currentWordCount;
      const chunkTargetWords = Math.min(this.safeChunkSize, remainingWords);

      // Emit chunk progress
      this.emitProgress('chunk_start', {
        chunkNumber: sceneNumber,
        targetWords: chunkTargetWords,
        totalProgress: currentWordCount,
        targetTotal: targetWordCount,
        percentComplete: Math.round((currentWordCount / targetWordCount) * 100)
      });

      await this.debugLogger.chunkBegin(sceneNumber, {
        targetWords: chunkTargetWords,
        totalProgress: currentWordCount
      });

      // Generate chunk
      const chunkStartTime = Date.now();

      // Build chunk prompt in the format expected by storyGenerator.generateStoryChunk
      const chunkPrompt = {
        ...config.userParams,  // Include user parameters (location, theme, etc.)
        isFirstChunk: sceneNumber === 1,
        isFinalChunk: remainingWords <= this.safeChunkSize,
        targetWords: chunkTargetWords,
        previousProse,
        continuationInstructions: sceneNumber > 1 ? 'Continue the story naturally from where you left off.' : null,
        finalChunkInstructions: remainingWords <= this.safeChunkSize ? 'Bring the story to a satisfying conclusion.' : null
      };

      // Get current state for context
      const currentState = this.stateManager?.getState?.() || null;

      const chunk = await this.storyGenerator.generateStoryChunk(
        chunkPrompt,
        currentState,
        sceneNumber
      );

      const chunkDuration = Date.now() - chunkStartTime;

      // Save chunk immediately (atomic write)
      const saveResult = await this.chunkPersistence.saveChunkImmediately(
        this.sessionId,
        sceneNumber,
        chunk.prose,
        chunk.wordCount
      );

      if (!saveResult.success) {
        throw new Error(`Failed to save chunk ${sceneNumber}: ${saveResult.error}`);
      }

      // Minimal delta extraction (non-blocking on failure)
      try {
        const extractResult = await deltaExtractor.extractDelta(
          chunk.prose,
          this.stateManager.getState(),
          { sceneNumber }
        );

        if (extractResult.success) {
          const stateDelta = deltaExtractor.toStateManagerFormat(extractResult.delta);
          stateUpdater.updateCanonicalState(stateDelta);
        }
      } catch (deltaError) {
        await this.debugLogger.warn('generation', 'Delta extraction failed', {
          chunk: sceneNumber,
          error: deltaError.message
        });
      }

      // Track chunk
      chunks.push({
        sceneNumber,
        wordCount: chunk.wordCount,
        filepath: saveResult.filepath,
        filename: saveResult.filename,
        savedAt: new Date().toISOString()
      });

      currentWordCount += chunk.wordCount;
      previousProse = chunk.prose;

      // Emit chunk complete
      this.emitProgress('chunk_complete', {
        chunkNumber: sceneNumber,
        chunkWordCount: chunk.wordCount,
        totalWords: currentWordCount,
        targetTotal: targetWordCount,
        percentComplete: Math.round((currentWordCount / targetWordCount) * 100),
        duration: chunkDuration
      });

      await this.debugLogger.chunkComplete(sceneNumber, chunk.wordCount, {
        totalWords: currentWordCount,
        processingTime: chunkDuration / 1000
      });

      // Save manifest after each chunk (for recovery)
      await this.chunkPersistence.saveChunkManifest(this.sessionId, chunks, {
        activeRules: this.stateManager.getActiveRules?.()?.length || 0,
        violatedRules: this.stateManager.getViolatedRules?.()?.length || 0
      });

      sceneNumber++;
    }

    return {
      success: true,
      totalChunks: chunks.length,
      totalWords: currentWordCount,
      chunks
    };
  }

  /**
   * Stage 2: Assembly (combine chunks)
   */
  async stage2_Assembly() {
    const result = await this.chunkPersistence.combineChunks(this.sessionId);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      story: result.story,
      wordCount: result.totalWords,
      filepath: result.filepath
    };
  }

  /**
   * Stage 2 Partial Recovery: Load raw chunks and concatenate
   * Used when normal assembly fails
   */
  async stage2_PartialRecovery() {
    console.log('🔄 Attempting partial recovery from raw chunks...');

    try {
      const chunksResult = await this.chunkPersistence.loadAllChunks(this.sessionId);

      if (!chunksResult.success || !chunksResult.chunks || chunksResult.chunks.length === 0) {
        return {
          success: false,
          partialRecovery: false,
          error: 'No chunks found for recovery'
        };
      }

      // Sort chunks by scene number
      const sortedChunks = chunksResult.chunks.sort((a, b) => {
        const numA = parseInt(a.filename?.match(/chunk_(\d+)/)?.[1] || '0');
        const numB = parseInt(b.filename?.match(/chunk_(\d+)/)?.[1] || '0');
        return numA - numB;
      });

      // Concatenate chunks with separators
      const rawChunks = sortedChunks.map(c => c.text || '');
      const story = rawChunks.join('\n\n');
      const wordCount = this.countWords(story);

      console.log(`✅ Partial recovery: ${sortedChunks.length} chunks, ${wordCount} words`);

      return {
        success: true,
        partialRecovery: true,
        story,
        wordCount,
        rawChunks,
        chunksRecovered: sortedChunks.length
      };
    } catch (error) {
      console.error('Partial recovery failed:', error.message);
      return {
        success: false,
        partialRecovery: false,
        error: error.message
      };
    }
  }

  /**
   * Count words in text
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
  }

  /**
   * Stage 3: Audit
   */
  async stage3_Audit(story, config) {
    if (!this.revisionAuditor) {
      return { success: false, error: 'No auditor configured' };
    }

    try {
      const auditResult = await this.revisionAuditor.auditStory(story, config.userParams || config);

      return {
        success: true,
        score: auditResult.scores?.overallScore || 0,
        grade: auditResult.scores?.grade || 'unknown',
        needsRefinement: auditResult.scores?.needsRevision || false,
        rawReport: auditResult.rawReport,
        report: auditResult
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 4: Refinement
   */
  async stage4_Refinement(story, auditReport) {
    if (!this.storyRefiner) {
      return { success: false, error: 'No refiner configured' };
    }

    try {
      const refinementResult = await this.storyRefiner.refineStory(story, auditReport, {
        maxRounds: 2 // Limit rounds to stay under time
      });

      return {
        success: true,
        story: refinementResult.refinedStory,
        rounds: refinementResult.rounds,
        changeLog: refinementResult.changeLog
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 5: Packaging
   */
  async stage5_Packaging(result) {
    // Save final story
    const sessionDir = path.join(this.baseDir, this.sessionId);
    const storyPath = path.join(sessionDir, 'final_story.txt');

    try {
      await fs.writeFile(storyPath, result.story, 'utf-8');

      // Save state
      if (this.stateManager) {
        const statePath = path.join(sessionDir, 'session_state.json');
        await this.stateManager.saveState(statePath);
      }

      // Create package if packager available
      if (this.outputPackager) {
        const packageResult = await this.outputPackager.createPackage({
          sessionId: this.sessionId,
          status: 'completed',
          initialStory: result.story,
          revisedStory: result.stages.refinement?.story,
          auditReport: result.stages.audit?.report,
          changeLog: result.stages.refinement?.changeLog || [],
          metadata: {
            totalWords: result.totalWords,
            totalChunks: result.totalChunks
          }
        });

        return {
          success: true,
          downloadUrl: `/api/download/${this.sessionId}`,
          zipPath: packageResult.zipPath
        };
      }

      return {
        success: true,
        downloadUrl: `/api/download/${this.sessionId}`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Emit progress event
   */
  emitProgress(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      currentStage: this.currentStage,
      ...data
    };

    this.onProgress(event);
  }

  /**
   * Start heartbeat timer
   */
  startHeartbeat(result) {
    this.heartbeatTimer = setInterval(() => {
      this.emitProgress('heartbeat', {
        alive: true,
        currentStage: this.currentStage,
        totalWords: result.totalWords,
        totalChunks: result.totalChunks,
        stageElapsed: this.stageStartTime ? Date.now() - this.stageStartTime : 0
      });
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Save error report for recovery
   */
  async saveErrorReport(result, error) {
    const sessionDir = path.join(this.baseDir, this.sessionId);

    try {
      await fs.mkdir(sessionDir, { recursive: true });

      const errorReport = {
        status: 'failed',
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        failedStage: this.currentStage,
        error: {
          message: error.message,
          stack: error.stack
        },
        partialResult: {
          chunksCompleted: result.totalChunks,
          wordsGenerated: result.totalWords,
          stagesCompleted: Object.keys(result.stages).filter(
            s => result.stages[s]?.success
          )
        },
        recovery: {
          message: `Failed at stage: ${this.currentStage}`,
          downloadUrl: `/api/session/${this.sessionId}/partial`,
          debugLogsUrl: `/api/session/${this.sessionId}/debug-logs`
        }
      };

      const errorPath = path.join(sessionDir, 'error_report.json');
      await fs.writeFile(errorPath, JSON.stringify(errorReport, null, 2), 'utf-8');

    } catch (saveError) {
      console.error('Failed to save error report:', saveError);
    }
  }
}

module.exports = StageOrchestrator;
module.exports.STAGES = STAGES;
