/**
 * Orchestrator Service
 * Manages the complete workflow from generation to packaging
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const StoryGenerator = require('./storyGenerator');
const RevisionAuditor = require('../audit/revisionAuditor');
const StoryRefiner = require('./storyRefiner');
const OutputPackager = require('../utils/outputPackager');
const StateManager = require('./stateManager');
const ConstraintEnforcer = require('../audit/constraintEnforcer');
const CheckpointManager = require('./checkpointManager');

class Orchestrator {
  constructor(apiKey, config = {}) {
    this.storyGenerator = new StoryGenerator(apiKey, config);
    this.revisionAuditor = new RevisionAuditor(
      this.storyGenerator.getClaudeClient(),
      this.storyGenerator.getTemplateLoader()
    );
    this.storyRefiner = new StoryRefiner(this.storyGenerator.getClaudeClient());
    this.outputPackager = new OutputPackager(config.outputDir);

    this.config = {
      autoRefine: config.autoRefine !== false,
      maxRevisionRounds: config.maxRevisionRounds || 3,
      ...config
    };
  }

  /**
   * Execute complete generation workflow
   */
  async executeWorkflow(userInput, options = {}) {
    const sessionId = this.generateSessionId();

    console.log(`\n=== Starting Story Generation Workflow ===`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Target Word Count: ${userInput.wordCount}`);
    console.log(`Location: ${userInput.location}`);
    console.log(`Theme: ${userInput.thematicFocus}\n`);

    const sessionData = {
      sessionId,
      userInput,
      status: 'in_progress', // Track workflow status
      currentStage: 'initialization', // Track current stage
      metadata: {
        startTime: new Date().toISOString(),
        apiUsage: []
      },
      errorLog: {
        unresolvedIssues: [],
        apiCalls: []
      }
    };

    // Initialize state tracking
    console.log('📊 Initializing state tracking...');
    const stateManager = new StateManager();
    const state = stateManager.initializeState(sessionId, userInput);
    sessionData.stateManager = stateManager;
    console.log(`✅ State initialized: ${stateManager.getSummary().total_rules} rule slots created\n`);

    // Initialize constraint enforcer (Phase 4)
    const constraintEnforcer = new ConstraintEnforcer(stateManager);
    sessionData.constraintEnforcer = constraintEnforcer;

    try {
      // Determine generation strategy (Phase 2)
      const useChunkedGeneration = userInput.wordCount > 12000;

      if (useChunkedGeneration) {
        sessionData.currentStage = 'chunked_generation';
        console.log('📝 Step 1: Generating story in chunks (Phase 2)...');
        console.log(`   Strategy: Chunked generation (~1500 words/chunk)`);
        console.log(`   Reason: Target word count (${userInput.wordCount}) exceeds single-call limit\n`);

        // Initialize CheckpointManager
        const checkpointManager = new CheckpointManager(
          this.storyGenerator,
          stateManager,
          this.storyGenerator.getClaudeClient()
        );

        // Generate story in chunks with independent file storage
        const chunkedResult = await checkpointManager.generateChunkedStory(
          userInput,
          userInput.wordCount,
          sessionId  // Pass sessionId for file organization
        );

        sessionData.initialStory = chunkedResult.story;
        sessionData.fullStoryPath = chunkedResult.fullStoryPath;
        sessionData.chunks = chunkedResult.chunks;
        sessionData.chunksDirectory = chunkedResult.chunksDirectory;
        sessionData.manifestPath = chunkedResult.manifestPath;
        sessionData.chunkMetadata = chunkedResult.metadata;

        // Log API calls for each chunk
        chunkedResult.chunks.forEach((chunk, index) => {
          sessionData.errorLog.apiCalls.push({
            type: `Chunk ${chunk.scene_number} Generation`,
            model: chunk.model,
            usage: chunk.usage,
            timestamp: chunk.timestamp
          });

          // Log delta extraction API call
          sessionData.errorLog.apiCalls.push({
            type: `Chunk ${chunk.scene_number} Delta Extraction`,
            model: 'claude-sonnet-4-20250514',
            usage: { input_tokens: 0, output_tokens: 0 }, // Estimated
            timestamp: chunk.timestamp
          });
        });

        console.log(`✅ Chunked story generated:`);
        console.log(`   Total chunks: ${chunkedResult.metadata.total_chunks}`);
        console.log(`   Total words: ${chunkedResult.metadata.total_words}`);
        console.log(`   Chunks directory: ${chunkedResult.chunksDirectory}\n`);

      } else {
        // Step 1: Generate initial story (single-call)
        sessionData.currentStage = 'story_generation';
        console.log('📝 Step 1: Generating initial story (single-call)...');
        console.log(`   Strategy: Single API call`);
        console.log(`   Reason: Target word count (${userInput.wordCount}) within single-call limit\n`);

        const generationResult = await this.storyGenerator.generateStory(userInput, stateManager);
        sessionData.initialStory = generationResult.story;
        sessionData.errorLog.apiCalls.push({
          type: 'Initial Generation',
          model: generationResult.metadata.model,
          usage: generationResult.metadata.usage,
          timestamp: generationResult.metadata.timestamp
        });

        console.log(`✅ Initial story generated (${generationResult.story.split(/\s+/).length} words)\n`);
      }

      // Step 1.5: Enforce hard constraints (Phase 4)
      sessionData.currentStage = 'constraint_enforcement';
      console.log('🔒 Step 1.5: Enforcing hard constraints...');
      const constraintCheck = constraintEnforcer.enforceConstraints(sessionData.initialStory);
      sessionData.constraintCheck = constraintCheck;

      if (!constraintCheck.passed) {
        console.warn(`⚠️  Constraint violations detected:`);
        console.warn(`   Total violations: ${constraintCheck.summary.totalViolations}`);
        console.warn(`   Critical: ${constraintCheck.summary.criticalViolations}`);
        console.warn(`   Major: ${constraintCheck.summary.majorViolations}`);
        console.warn(`   See output logs for details\n`);

        // Add to error log
        sessionData.errorLog.constraintViolations = {
          summary: constraintCheck.summary,
          details: constraintCheck.results
        };
      }

      // Step 2: Perform revision audit
      sessionData.currentStage = 'revision_audit';
      console.log('🔍 Step 2: Performing revision audit...');
      const auditResult = await this.revisionAuditor.auditStory(
        sessionData.initialStory,
        userInput
      );
      sessionData.auditReport = auditResult;
      sessionData.errorLog.apiCalls.push({
        type: 'Revision Audit',
        model: auditResult.metadata.model,
        usage: auditResult.metadata.usage,
        timestamp: auditResult.metadata.timestamp
      });

      console.log(`✅ Audit complete - Score: ${auditResult.scores.overallScore}/100`);
      console.log(`   Grade: ${auditResult.scores.grade}`);
      console.log(`   Critical Failures: ${auditResult.scores.criticalFailures}`);
      console.log(`   Major Failures: ${auditResult.scores.majorFailures}\n`);

      // Step 3: Refine if needed
      if (this.config.autoRefine && this.revisionAuditor.needsRefinement(auditResult.scores)) {
        sessionData.currentStage = 'refinement';
        console.log('🔧 Step 3: Refinement needed - applying fixes...');

        const refinementResult = await this.storyRefiner.refineStory(
          sessionData.initialStory,
          auditResult.rawReport,
          { maxRounds: this.config.maxRevisionRounds }
        );

        sessionData.revisedStory = refinementResult.refinedStory;
        sessionData.changeLog = refinementResult.changeLog;

        // Log refinement API calls
        for (const logEntry of refinementResult.changeLog) {
          sessionData.errorLog.apiCalls.push({
            type: `Refinement Round ${logEntry.round}`,
            model: 'claude-sonnet-4-5-20250929',
            usage: logEntry.usage,
            timestamp: logEntry.timestamp
          });
        }

        console.log(`✅ Refinement complete - ${refinementResult.rounds} rounds`);
        console.log(`   Total changes: ${refinementResult.metadata.totalChanges}\n`);
      } else {
        console.log('✅ Step 3: No refinement needed or disabled\n');
        sessionData.revisedStory = null;
        sessionData.changeLog = [];
      }

      // Step 4: Save state file
      sessionData.currentStage = 'state_saving';
      console.log('💾 Step 4: Saving state file...');
      const stateFilePath = path.join(
        this.outputPackager.getOutputDir(),
        sessionId,
        'session_state.json'
      );
      await sessionData.stateManager.saveState(stateFilePath);
      sessionData.stateFilePath = stateFilePath;
      console.log(`✅ State saved\n`);

      // Step 5: Package output
      sessionData.currentStage = 'packaging';
      console.log('📦 Step 5: Creating output package...');
      const packageResult = await this.outputPackager.createPackage(sessionData);

      sessionData.status = 'completed';
      sessionData.currentStage = 'complete';
      sessionData.metadata.endTime = new Date().toISOString();
      sessionData.metadata.duration = this.calculateDuration(
        sessionData.metadata.startTime,
        sessionData.metadata.endTime
      );

      console.log(`✅ Package created: ${packageResult.zipPath}\n`);

      console.log('=== Workflow Complete ===\n');

      return {
        success: true,
        sessionId,
        outputPackage: packageResult,
        summary: {
          wordCount: (sessionData.revisedStory || sessionData.initialStory).split(/\s+/).length,
          qualityScore: auditResult.scores.overallScore,
          grade: auditResult.scores.grade,
          revisionsApplied: sessionData.changeLog.length,
          duration: sessionData.metadata.duration
        },
        files: packageResult.files
      };

    } catch (error) {
      console.error('❌ Workflow failed:', error.message);

      // Mark as failed and record error details
      sessionData.status = 'failed';
      sessionData.metadata.endTime = new Date().toISOString();
      sessionData.metadata.failureStage = sessionData.currentStage;

      // Log the error with context
      sessionData.errorLog.unresolvedIssues.push({
        title: 'Workflow Error',
        description: error.message,
        severity: 'critical',
        stage: sessionData.currentStage,
        stackTrace: error.stack,
        timestamp: new Date().toISOString()
      });

      // Determine what artifacts are available
      const availableArtifacts = [];
      if (sessionData.initialStory) availableArtifacts.push('initial_story');
      if (sessionData.auditReport) availableArtifacts.push('audit_report');
      if (sessionData.revisedStory) availableArtifacts.push('revised_story');
      if (sessionData.changeLog && sessionData.changeLog.length > 0) availableArtifacts.push('change_log');
      if (sessionData.stateManager) availableArtifacts.push('state_file');
      if (sessionData.checkpoints && sessionData.checkpoints.length > 0) availableArtifacts.push('checkpoints');
      if (sessionData.chunks && sessionData.chunks.length > 0) availableArtifacts.push('chunks');

      console.log(`\n⚠️  PARTIAL GENERATION RECOVERY`);
      console.log(`   Failed at stage: ${sessionData.currentStage}`);
      console.log(`   Available artifacts: ${availableArtifacts.join(', ')}`);

      // Try to save what we have
      if (availableArtifacts.length > 0) {
        try {
          // Save state if available
          if (sessionData.stateManager) {
            const stateFilePath = path.join(
              this.outputPackager.getOutputDir(),
              sessionId,
              'session_state.json'
            );
            await sessionData.stateManager.saveState(stateFilePath);
            sessionData.stateFilePath = stateFilePath;
          }

          // Package partial artifacts
          const packageResult = await this.outputPackager.createPackage(sessionData);
          console.log(`   ✅ Partial output saved: ${packageResult.zipPath}\n`);

          return {
            success: false,
            sessionId,
            error: error.message,
            failureStage: sessionData.currentStage,
            availableArtifacts,
            outputPackage: packageResult,
            partialRecovery: true
          };
        } catch (packagingError) {
          console.error(`   ❌ Failed to save partial output: ${packagingError.message}\n`);
          return {
            success: false,
            sessionId,
            error: error.message,
            failureStage: sessionData.currentStage,
            packagingError: packagingError.message,
            partialRecovery: false
          };
        }
      }

      return {
        success: false,
        sessionId,
        error: error.message,
        failureStage: sessionData.currentStage,
        availableArtifacts: [],
        partialRecovery: false
      };
    }
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const uuid = uuidv4().slice(0, 8);
    return `session-${timestamp}-${uuid}`;
  }

  /**
   * Calculate duration in human-readable format
   */
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;

    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  /**
   * Get available options for form fields
   */
  async getAvailableOptions() {
    const templateLoader = this.storyGenerator.getTemplateLoader();

    return {
      locations: await templateLoader.listOptions('locations'),
      themes: await templateLoader.listOptions('themes'),
      entryConditions: await templateLoader.listOptions('entry_conditions'),
      discoveryMethods: await templateLoader.listOptions('discovery_methods'),
      completenessPatterns: await templateLoader.listOptions('completeness_patterns'),
      violationResponses: await templateLoader.listOptions('violation_responses'),
      exitConditions: await templateLoader.listOptions('exit_conditions')
    };
  }

  /**
   * Validate user input before workflow
   */
  validateInput(userInput) {
    const errors = [];

    // Phase 2: Increased limit with chunked generation support
    if (!userInput.wordCount || userInput.wordCount < 5000 || userInput.wordCount > 50000) {
      errors.push('Word count must be between 5,000 and 50,000');
    }

    if (!userInput.location) {
      errors.push('Location is required');
    }

    if (!userInput.entryCondition) {
      errors.push('Entry condition is required');
    }

    if (!userInput.discoveryMethod) {
      errors.push('Discovery method is required');
    }

    if (!userInput.completenessPattern) {
      errors.push('Completeness pattern is required');
    }

    if (!userInput.violationResponse) {
      errors.push('Violation response is required');
    }

    if (!userInput.endingType) {
      errors.push('Ending type is required');
    }

    if (!userInput.thematicFocus) {
      errors.push('Thematic focus is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = Orchestrator;
