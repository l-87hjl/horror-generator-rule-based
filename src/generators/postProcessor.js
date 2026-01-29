/**
 * Post-Processor Module
 * Runs all heavy processing AFTER all chunks complete
 *
 * Purpose: Perform audit, refinement, and validation only after generation
 * is complete, allowing inspection of raw chunks before processing.
 *
 * Steps:
 * 1. Load all chunks from chunks/ directory
 * 2. Concatenate in order -> create 00_combined_draft.txt
 * 3. Load final session_state.json
 * 4. Run audit (existing code)
 * 5. Run refinement IF requested (existing code)
 * 6. Run hard constraint validation
 * 7. Package outputs (existing code)
 */

const fs = require('fs').promises;
const path = require('path');
const ChunkPersistence = require('./chunkPersistence');

class PostProcessor {
  constructor(options = {}) {
    this.chunkPersistence = new ChunkPersistence(options);
    this.baseDir = options.baseDir || path.join(process.cwd(), 'generated');

    // External dependencies (injected)
    this.revisionAuditor = options.revisionAuditor || null;
    this.storyRefiner = options.storyRefiner || null;
    this.constraintEnforcer = options.constraintEnforcer || null;
    this.outputPackager = options.outputPackager || null;

    // Processing options
    this.autoRefine = options.autoRefine !== false;
    this.maxRevisionRounds = options.maxRevisionRounds || 3;
  }

  /**
   * Assemble and process all chunks for a session
   *
   * @param {string} sessionId - Session identifier
   * @param {object} options - Processing options
   * @returns {Promise<object>} Processing result
   */
  async assembleAndProcess(sessionId, options = {}) {
    const startTime = Date.now();
    const sessionDir = path.join(this.baseDir, sessionId);

    const result = {
      sessionId: sessionId,
      success: true,
      stages: {},
      errors: [],
      outputs: {},
      timestamp: new Date().toISOString()
    };

    try {
      // Stage 1: Load all chunks
      console.log('\n[PostProcessor] Stage 1: Loading chunks...');
      result.stages.loadChunks = await this.loadChunksStage(sessionId);

      if (!result.stages.loadChunks.success) {
        throw new Error('Failed to load chunks: ' + result.stages.loadChunks.error);
      }

      // Stage 2: Concatenate into combined draft
      console.log('[PostProcessor] Stage 2: Creating combined draft...');
      result.stages.combine = await this.combineChunksStage(sessionId, result.stages.loadChunks.chunks);

      if (!result.stages.combine.success) {
        throw new Error('Failed to combine chunks: ' + result.stages.combine.error);
      }

      result.outputs.combinedDraft = result.stages.combine.filepath;

      // Stage 3: Load session state
      console.log('[PostProcessor] Stage 3: Loading session state...');
      result.stages.loadState = await this.loadStateStage(sessionId);

      // State loading is optional - continue even if it fails
      if (result.stages.loadState.success) {
        result.outputs.sessionState = result.stages.loadState.filepath;
      } else {
        console.warn('[PostProcessor] Warning: Could not load session state');
      }

      // Stage 4: Run audit (if auditor available)
      if (this.revisionAuditor && options.runAudit !== false) {
        console.log('[PostProcessor] Stage 4: Running audit...');
        result.stages.audit = await this.auditStage(
          result.stages.combine.story,
          options.userParams || {}
        );

        if (result.stages.audit.success) {
          result.outputs.auditReport = result.stages.audit.report;
        }
      } else {
        console.log('[PostProcessor] Stage 4: Audit skipped (no auditor or disabled)');
        result.stages.audit = { skipped: true };
      }

      // Stage 5: Run refinement (if refiner available and needed)
      const shouldRefine = this.autoRefine &&
        this.storyRefiner &&
        result.stages.audit?.success &&
        result.stages.audit?.needsRefinement;

      if (shouldRefine && options.runRefinement !== false) {
        console.log('[PostProcessor] Stage 5: Running refinement...');
        result.stages.refinement = await this.refinementStage(
          result.stages.combine.story,
          result.stages.audit.rawReport
        );

        if (result.stages.refinement.success) {
          result.outputs.refinedStory = result.stages.refinement.story;
        }
      } else {
        console.log('[PostProcessor] Stage 5: Refinement skipped');
        result.stages.refinement = { skipped: true };
      }

      // Stage 6: Run hard constraint validation (if enforcer available)
      if (this.constraintEnforcer && options.runConstraints !== false) {
        console.log('[PostProcessor] Stage 6: Running constraint validation...');
        const storyToValidate = result.stages.refinement?.story || result.stages.combine.story;
        result.stages.constraints = await this.constraintStage(storyToValidate);

        if (result.stages.constraints.success) {
          result.outputs.constraintReport = result.stages.constraints.report;
        }
      } else {
        console.log('[PostProcessor] Stage 6: Constraint validation skipped');
        result.stages.constraints = { skipped: true };
      }

      // Stage 7: Save final story
      console.log('[PostProcessor] Stage 7: Saving final story...');
      const finalStory = result.stages.refinement?.story || result.stages.combine.story;
      result.stages.saveFinal = await this.saveFinalStoryStage(sessionId, finalStory);

      if (result.stages.saveFinal.success) {
        result.outputs.finalStory = result.stages.saveFinal.filepath;
      }

      // Stage 8: Package outputs (if packager available)
      if (this.outputPackager && options.createPackage !== false) {
        console.log('[PostProcessor] Stage 8: Creating output package...');
        result.stages.package = await this.packageStage(sessionId, result);

        if (result.stages.package.success) {
          result.outputs.package = result.stages.package.zipPath;
        }
      } else {
        console.log('[PostProcessor] Stage 8: Packaging skipped');
        result.stages.package = { skipped: true };
      }

      result.duration = Date.now() - startTime;
      console.log(`[PostProcessor] Complete! Duration: ${result.duration}ms\n`);

    } catch (error) {
      result.success = false;
      result.errors.push({
        stage: 'fatal',
        message: error.message,
        stack: error.stack
      });
      result.duration = Date.now() - startTime;
      console.error('[PostProcessor] Fatal error:', error.message);
    }

    // Save processing report
    await this.saveProcessingReport(sessionId, result);

    return result;
  }

  /**
   * Stage 1: Load all chunks
   */
  async loadChunksStage(sessionId) {
    try {
      const result = await this.chunkPersistence.loadAllChunks(sessionId);

      return {
        success: result.success,
        chunks: result.chunks || [],
        totalChunks: result.totalChunks || 0,
        totalWords: result.totalWords || 0,
        error: result.error
      };

    } catch (error) {
      return {
        success: false,
        chunks: [],
        error: error.message
      };
    }
  }

  /**
   * Stage 2: Combine chunks into single story
   */
  async combineChunksStage(sessionId, chunks) {
    const sessionDir = path.join(this.baseDir, sessionId);
    const filepath = path.join(sessionDir, '00_combined_draft.txt');

    try {
      // Combine with scene breaks
      const story = chunks.map(c => c.text).join('\n\n---\n\n');

      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(filepath, story, 'utf-8');

      return {
        success: true,
        story: story,
        filepath: filepath,
        wordCount: this.countWords(story)
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 3: Load session state
   */
  async loadStateStage(sessionId) {
    const sessionDir = path.join(this.baseDir, sessionId);
    const filepath = path.join(sessionDir, 'session_state.json');

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const state = JSON.parse(content);

      return {
        success: true,
        state: state,
        filepath: filepath
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 4: Run audit
   */
  async auditStage(story, userParams) {
    if (!this.revisionAuditor) {
      return { success: false, error: 'No auditor configured' };
    }

    try {
      const auditResult = await this.revisionAuditor.auditStory(story, userParams);

      return {
        success: true,
        report: auditResult,
        rawReport: auditResult.rawReport,
        scores: auditResult.scores,
        needsRefinement: auditResult.scores.needsRevision
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 5: Run refinement
   */
  async refinementStage(story, auditReport) {
    if (!this.storyRefiner) {
      return { success: false, error: 'No refiner configured' };
    }

    try {
      const refinementResult = await this.storyRefiner.refineStory(
        story,
        auditReport,
        { maxRounds: this.maxRevisionRounds }
      );

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
   * Stage 6: Run constraint validation
   */
  async constraintStage(story) {
    if (!this.constraintEnforcer) {
      return { success: false, error: 'No constraint enforcer configured' };
    }

    try {
      const constraintResult = this.constraintEnforcer.enforceConstraints(story);

      return {
        success: true,
        passed: constraintResult.passed,
        report: constraintResult,
        violations: constraintResult.summary
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 7: Save final story
   */
  async saveFinalStoryStage(sessionId, story) {
    const sessionDir = path.join(this.baseDir, sessionId);
    const filepath = path.join(sessionDir, 'final_story.txt');

    try {
      await fs.writeFile(filepath, story, 'utf-8');

      return {
        success: true,
        filepath: filepath,
        wordCount: this.countWords(story)
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stage 8: Create output package
   */
  async packageStage(sessionId, processingResult) {
    if (!this.outputPackager) {
      return { success: false, error: 'No packager configured' };
    }

    try {
      // Build session data for packager
      const sessionData = {
        sessionId: sessionId,
        status: processingResult.success ? 'completed' : 'partial',
        initialStory: processingResult.stages.combine?.story,
        revisedStory: processingResult.stages.refinement?.story,
        auditReport: processingResult.stages.audit?.report,
        changeLog: processingResult.stages.refinement?.changeLog || [],
        constraintCheck: processingResult.stages.constraints?.report,
        chunks: processingResult.stages.loadChunks?.chunks,
        metadata: {
          startTime: processingResult.timestamp,
          endTime: new Date().toISOString(),
          duration: processingResult.duration
        },
        errorLog: {
          unresolvedIssues: processingResult.errors
        }
      };

      const packageResult = await this.outputPackager.createPackage(sessionData);

      return {
        success: true,
        zipPath: packageResult.zipPath,
        files: packageResult.files
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save processing report
   */
  async saveProcessingReport(sessionId, result) {
    const sessionDir = path.join(this.baseDir, sessionId);
    const filepath = path.join(sessionDir, 'processing_report.json');

    try {
      // Create a serializable version (remove large story content)
      const report = {
        ...result,
        stages: Object.fromEntries(
          Object.entries(result.stages).map(([key, stage]) => [
            key,
            {
              ...stage,
              story: stage.story ? `[${this.countWords(stage.story)} words]` : undefined,
              chunks: stage.chunks ? `[${stage.chunks.length} chunks]` : undefined
            }
          ])
        )
      };

      await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');

    } catch (error) {
      console.error('[PostProcessor] Failed to save processing report:', error.message);
    }
  }

  /**
   * Count words in text
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Get raw chunks without processing
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<object>} Chunks result
   */
  async getRawChunks(sessionId) {
    return this.chunkPersistence.loadAllChunks(sessionId);
  }

  /**
   * Combine chunks only (no processing)
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<object>} Combination result
   */
  async combineOnly(sessionId) {
    const loadResult = await this.loadChunksStage(sessionId);

    if (!loadResult.success) {
      return {
        success: false,
        error: loadResult.error
      };
    }

    return this.combineChunksStage(sessionId, loadResult.chunks);
  }
}

module.exports = PostProcessor;
