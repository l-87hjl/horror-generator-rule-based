/**
 * Orchestrator Service
 * Manages the complete workflow from generation to packaging
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const StoryGenerator = require('./storyGenerator');
const RevisionAuditor = require('../audit/revisionAuditor');
const StoryRefiner = require('./storyRefiner');
const OutputPackager = require('../utils/outputPackager');
const StateManager = require('./stateManager');

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

    try {
      // Step 1: Generate initial story
      console.log('📝 Step 1: Generating initial story...');
      const generationResult = await this.storyGenerator.generateStory(userInput, stateManager);
      sessionData.initialStory = generationResult.story;
      sessionData.errorLog.apiCalls.push({
        type: 'Initial Generation',
        model: generationResult.metadata.model,
        usage: generationResult.metadata.usage,
        timestamp: generationResult.metadata.timestamp
      });

      console.log(`✅ Initial story generated (${generationResult.story.split(/\s+/).length} words)\n`);

      // Step 2: Perform revision audit
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
      console.log('📦 Step 5: Creating output package...');
      const packageResult = await this.outputPackager.createPackage(sessionData);

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

      // Log the error
      sessionData.errorLog.unresolvedIssues.push({
        title: 'Workflow Error',
        description: error.message,
        severity: 'critical',
        timestamp: new Date().toISOString()
      });

      // Try to save what we have
      if (sessionData.initialStory) {
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

          const packageResult = await this.outputPackager.createPackage(sessionData);
          console.log(`⚠️ Partial output saved: ${packageResult.zipPath}`);
        } catch (packagingError) {
          console.error('Failed to save partial output:', packagingError.message);
        }
      }

      return {
        success: false,
        sessionId,
        error: error.message,
        sessionData
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

    if (!userInput.wordCount || userInput.wordCount < 5000 || userInput.wordCount > 20000) {
      errors.push('Word count must be between 5,000 and 20,000');
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
