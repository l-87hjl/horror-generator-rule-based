/**
 * Checkpoint Manager Service
 * Manages chunked story generation with independent file storage
 * Enables unlimited story length by breaking generation into ~1500 word chunks
 *
 * v2.1.0: Integrated with new debugging and persistence modules
 */

const fs = require('fs').promises;
const path = require('path');
const ChunkPersistence = require('../../generators/chunkPersistence');
const DebugLogger = require('../../utils/debugLogger');
const CanonDeltaExtractor = require('../../generators/canonDeltaExtractor');
const StateUpdater = require('../../generators/stateUpdater');

class CheckpointManager {
  constructor(storyGenerator, stateManager, claudeClient) {
    this.storyGenerator = storyGenerator;
    this.stateManager = stateManager;
    this.claudeClient = claudeClient;

    // Checkpoint configuration
    this.CHUNK_SIZE = 1500; // Target words per chunk
    this.MAX_RETRIES = 3;
    this.CHECKPOINT_VERSION = '2.1.0'; // Updated for new debugging modules

    // Initialize new modules (will be set per-session)
    this.chunkPersistence = null;
    this.debugLogger = null;
    this.deltaExtractor = null;
    this.stateUpdater = null;
  }

  /**
   * Generate a complete story in chunks with independent file storage
   *
   * @param {object} userParams - User story parameters
   * @param {number} targetWordCount - Total desired story length
   * @param {string} sessionId - Session ID for file organization
   * @returns {object} Complete story data with chunk metadata
   */
  async generateChunkedStory(userParams, targetWordCount, sessionId) {
    // Initialize per-session modules
    this.chunkPersistence = new ChunkPersistence();
    this.debugLogger = new DebugLogger(sessionId);
    this.deltaExtractor = new CanonDeltaExtractor(this.claudeClient);
    this.stateUpdater = new StateUpdater(this.stateManager);

    // Initialize debug logger
    await this.debugLogger.initialize();

    await this.debugLogger.start('Starting chunked generation', {
      sessionId: sessionId,
      targetWordCount: targetWordCount,
      chunkSize: this.CHUNK_SIZE,
      version: this.CHECKPOINT_VERSION
    });

    console.log(`\n[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Starting Chunked Generation (v${this.CHECKPOINT_VERSION})`);
    console.log(`[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Session ID: ${sessionId}`);
    console.log(`[CHECKPOINT] Target word count: ${targetWordCount}`);
    console.log(`[CHECKPOINT] Chunk size: ${this.CHUNK_SIZE} words`);
    console.log(`[CHECKPOINT] Debug logging: ENABLED`);
    console.log(`[CHECKPOINT] User params:`, JSON.stringify(userParams, null, 2));
    console.log(`[CHECKPOINT] ============================================\n`);

    // Create chunks directory
    const chunksDir = path.join(process.cwd(), 'generated', sessionId, 'chunks');
    console.log(`[CHECKPOINT] Creating chunks directory: ${chunksDir}`);
    await fs.mkdir(chunksDir, { recursive: true });
    console.log(`[CHECKPOINT] ✅ Chunks directory created\n`);

    const chunks = [];
    let currentWordCount = 0;
    let sceneNumber = 1;
    let previousProse = '';
    let partialOutputSaved = false;

    try {
      while (currentWordCount < targetWordCount) {
        const remainingWords = targetWordCount - currentWordCount;
        const chunkTargetWords = Math.min(this.CHUNK_SIZE, remainingWords);

        console.log(`\n[CHECKPOINT] ============================================`);
        console.log(`[CHECKPOINT] === Starting Scene ${sceneNumber} ===`);
        console.log(`[CHECKPOINT] ============================================`);
        console.log(`[CHECKPOINT] Target words for this chunk: ${chunkTargetWords}`);
        console.log(`[CHECKPOINT] Progress: ${currentWordCount}/${targetWordCount} words (${((currentWordCount/targetWordCount)*100).toFixed(1)}%)`);
        console.log(`[CHECKPOINT] Remaining words: ${remainingWords}`);
        console.log(`[CHECKPOINT] Is first chunk: ${sceneNumber === 1}`);
        console.log(`[CHECKPOINT] Is final chunk: ${remainingWords <= this.CHUNK_SIZE}`);

        // Log chunk beginning
        await this.debugLogger.chunkBegin(sceneNumber, {
          targetWords: chunkTargetWords,
          totalProgress: currentWordCount,
          targetTotal: targetWordCount,
          isFirstChunk: sceneNumber === 1,
          isFinalChunk: remainingWords <= this.CHUNK_SIZE
        });

        try {
          // STEP 1: Generate chunk
          console.log(`\n[CHECKPOINT] STEP 1: Generating chunk ${sceneNumber}...`);
          const chunkStartTime = Date.now();

          const chunk = await this.generateChunk({
            userParams,
            sceneNumber,
            targetWords: chunkTargetWords,
            previousProse,
            isFirstChunk: sceneNumber === 1,
            isFinalChunk: remainingWords <= this.CHUNK_SIZE
          });

          const chunkDuration = ((Date.now() - chunkStartTime) / 1000).toFixed(1);
          console.log(`[CHECKPOINT] ✅ Chunk ${sceneNumber} generated in ${chunkDuration}s`);
          console.log(`[CHECKPOINT]    Word count: ${chunk.wordCount} words`);
          console.log(`[CHECKPOINT]    Prose preview: "${chunk.prose.substring(0, 100)}..."`);

          // STEP 2: Save chunk immediately with atomic write (CRITICAL)
          console.log(`\n[CHECKPOINT] STEP 2: Saving chunk ${sceneNumber} with atomic write...`);

          const saveResult = await this.chunkPersistence.saveChunkImmediately(
            sessionId,
            sceneNumber,
            chunk.prose,
            chunk.wordCount
          );

          if (!saveResult.success) {
            throw new Error(`Failed to save chunk: ${saveResult.error}`);
          }

          console.log(`[CHECKPOINT] ✅ Chunk ${sceneNumber} saved atomically to: ${saveResult.filepath}`);

          // Store chunk metadata
          const chunkMetadata = {
            sceneNumber: sceneNumber,
            prose: chunk.prose,
            filePath: saveResult.filepath,
            filename: saveResult.filename,
            wordCount: chunk.wordCount,
            savedAt: new Date().toISOString()
          };

          chunks.push(chunkMetadata);
          currentWordCount += chunk.wordCount;
          previousProse = chunk.prose;

          console.log(`[CHECKPOINT]    Chunks saved so far: ${chunks.length}`);
          console.log(`[CHECKPOINT]    Total words so far: ${currentWordCount}`);

          // STEP 3: Minimal delta extraction (non-blocking on failure)
          console.log(`\n[CHECKPOINT] STEP 3: Minimal delta extraction...`);
          let deltaApplied = false;

          try {
            const deltaStartTime = Date.now();

            // Use new minimal delta extractor
            const extractResult = await this.deltaExtractor.extractDelta(
              chunk.prose,
              this.stateManager.getState(),
              { sceneNumber: sceneNumber }
            );

            if (extractResult.success) {
              // Convert to state manager format and apply
              const stateDelta = this.deltaExtractor.toStateManagerFormat(extractResult.delta);
              const updateResult = this.stateUpdater.updateCanonicalState(stateDelta);

              deltaApplied = true;
              const deltaDuration = ((Date.now() - deltaStartTime) / 1000).toFixed(1);

              console.log(`[CHECKPOINT] ✅ Delta extracted and applied (${deltaDuration}s)`);
              console.log(`[CHECKPOINT]    Applied changes: ${updateResult.appliedChanges.length}`);
              console.log(`[CHECKPOINT]    Skipped changes: ${updateResult.skippedChanges.length}`);

              await this.debugLogger.stateUpdate('Delta applied', {
                chunk: sceneNumber,
                appliedChanges: updateResult.appliedChanges.length,
                skippedChanges: updateResult.skippedChanges.length,
                duration: deltaDuration
              });
            } else {
              console.warn(`[CHECKPOINT] ⚠️  Delta extraction failed: ${extractResult.error}`);
            }

          } catch (stateError) {
            console.warn(`[CHECKPOINT] ⚠️  State extraction failed (non-critical):`, stateError.message);
            console.warn(`[CHECKPOINT]    Continuing without state tracking for this chunk`);

            await this.debugLogger.warn('generation', 'Delta extraction failed (non-critical)', {
              chunk: sceneNumber,
              error: stateError.message
            });
          }

          // Log chunk complete
          await this.debugLogger.chunkComplete(sceneNumber, chunk.wordCount, {
            totalWords: currentWordCount,
            processingTime: parseFloat(chunkDuration),
            deltaApplied: deltaApplied
          });

          // Save chunk manifest after each chunk (for recovery)
          await this.chunkPersistence.saveChunkManifest(sessionId, chunks, {
            activeRules: this.stateManager.getActiveRules().length,
            violatedRules: this.stateManager.getViolatedRules().length,
            entityCapabilities: Object.keys(this.stateManager.getEntityCapabilities()).length
          });

          sceneNumber++;

          // Check if we've reached target
          if (currentWordCount >= targetWordCount) {
            console.log(`\n[CHECKPOINT] ============================================`);
            console.log(`[CHECKPOINT] ✅ Target word count reached!`);
            console.log(`[CHECKPOINT]    Target: ${targetWordCount} words`);
            console.log(`[CHECKPOINT]    Actual: ${currentWordCount} words`);
            console.log(`[CHECKPOINT] ============================================`);
            break;
          }

          console.log(`\n[CHECKPOINT] Scene ${sceneNumber - 1} complete. Continuing to next scene...`);

        } catch (error) {
          console.error(`\n[CHECKPOINT] ============================================`);
          console.error(`[CHECKPOINT] ❌❌❌ ERROR in Scene ${sceneNumber} ❌❌❌`);
          console.error(`[CHECKPOINT] ============================================`);
          console.error(`[CHECKPOINT] Error message: ${error.message}`);
          console.error(`[CHECKPOINT] Error type: ${error.constructor.name}`);
          console.error(`[CHECKPOINT] Current progress: ${currentWordCount}/${targetWordCount} words`);
          console.error(`[CHECKPOINT] Chunks saved: ${chunks.length}`);
          console.error(`[CHECKPOINT] Chunks directory: ${chunksDir}`);
          console.error(`[CHECKPOINT] Full error stack:`);
          console.error(error.stack);
          console.error(`[CHECKPOINT] ============================================`);

          // Log error to debug log
          await this.debugLogger.error('Chunk generation failed', {
            stage: 'chunk_generation',
            chunk: sceneNumber,
            currentWordCount: currentWordCount,
            targetWordCount: targetWordCount,
            chunksCompleted: chunks.length,
            errorMessage: error.message,
            errorType: error.constructor.name
          });

          // Save partial output for recovery
          await this.savePartialOutput(sessionId, {
            chunksCompleted: chunks.length,
            wordCountAchieved: currentWordCount,
            failurePoint: 'chunk_generation',
            failedChunk: sceneNumber,
            errorMessage: error.message,
            chunks: chunks
          });

          partialOutputSaved = true;

          // Rethrow to propagate error
          throw error;
        }
      }

    } catch (outerError) {
      // Finalize debug logger even on error
      await this.debugLogger.finalize();

      // If we haven't saved partial output yet, do it now
      if (!partialOutputSaved && chunks.length > 0) {
        await this.savePartialOutput(sessionId, {
          chunksCompleted: chunks.length,
          wordCountAchieved: currentWordCount,
          failurePoint: 'generation_loop',
          errorMessage: outerError.message,
          chunks: chunks
        });
      }

      throw outerError;
    }

    // Log successful completion
    await this.debugLogger.complete('All chunks generated successfully', {
      totalChunks: chunks.length,
      totalWords: currentWordCount,
      targetWords: targetWordCount
    });

    // Combine all chunks into final story
    console.log(`\n[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Combining chunks into full story...`);
    console.log(`[CHECKPOINT]    Total chunks: ${chunks.length}`);

    const fullStory = chunks.map(c => c.prose).join('\n\n---\n\n');

    console.log(`[CHECKPOINT]    Full story length: ${fullStory.length} chars`);
    console.log(`[CHECKPOINT]    Full story word count: ${this.countWords(fullStory)}`);

    // Save combined story
    const fullStoryPath = path.join(process.cwd(), 'generated', sessionId, 'full_story.md');
    console.log(`[CHECKPOINT] Saving combined story to: ${fullStoryPath}`);
    await fs.writeFile(fullStoryPath, fullStory, 'utf-8');
    console.log(`[CHECKPOINT] ✅ Full story saved`);

    // Create chunk manifest (final version)
    const manifest = {
      version: this.CHECKPOINT_VERSION,
      session_id: sessionId,
      status: 'complete',
      total_chunks: chunks.length,
      total_words: currentWordCount,
      target_words: targetWordCount,
      timestamp: new Date().toISOString(),
      chunks: chunks.map(c => ({
        scene: c.sceneNumber,
        filename: c.filename,
        word_count: c.wordCount,
        timestamp: c.savedAt || c.timestamp
      })),
      state_summary: this.stateUpdater ? this.stateUpdater.getStateSummary() : null
    };

    const manifestPath = path.join(process.cwd(), 'generated', sessionId, 'chunk_manifest.json');
    console.log(`[CHECKPOINT] Saving chunk manifest to: ${manifestPath}`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`[CHECKPOINT] ✅ Chunk manifest saved`);

    // Finalize debug logger
    await this.debugLogger.finalize();

    console.log(`\n[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] ✅✅✅ Chunked Generation Complete ✅✅✅`);
    console.log(`[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Session ID: ${sessionId}`);
    console.log(`[CHECKPOINT] Total chunks generated: ${chunks.length}`);
    console.log(`[CHECKPOINT] Total words: ${currentWordCount}`);
    console.log(`[CHECKPOINT] Target words: ${targetWordCount}`);
    console.log(`[CHECKPOINT] Chunks directory: ${chunksDir}`);
    console.log(`[CHECKPOINT] Full story: ${fullStoryPath}`);
    console.log(`[CHECKPOINT] Manifest: ${manifestPath}`);
    console.log(`[CHECKPOINT] Debug logs: ${this.debugLogger.getLogPaths().txt}`);
    console.log(`[CHECKPOINT] Architecture version: ${this.CHECKPOINT_VERSION}`);
    console.log(`[CHECKPOINT] ============================================\n`);

    return {
      story: fullStory,
      fullStoryPath: fullStoryPath,
      chunks: chunks,
      chunksDirectory: chunksDir,
      manifestPath: manifestPath,
      sessionId: sessionId,
      debugLogs: this.debugLogger.getLogPaths(),
      metadata: {
        total_chunks: chunks.length,
        total_words: currentWordCount,
        target_words: targetWordCount,
        checkpoint_version: this.CHECKPOINT_VERSION
      }
    };
  }

  /**
   * Save partial output for recovery after failure
   *
   * @param {string} sessionId - Session identifier
   * @param {object} partialData - Partial output data
   * @returns {Promise<object>} Save result
   */
  async savePartialOutput(sessionId, partialData) {
    const sessionDir = path.join(process.cwd(), 'generated', sessionId);

    try {
      await fs.mkdir(sessionDir, { recursive: true });

      const errorReport = {
        status: 'partial',
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        chunksCompleted: partialData.chunksCompleted,
        wordCountAchieved: partialData.wordCountAchieved,
        failurePoint: partialData.failurePoint,
        failedChunk: partialData.failedChunk,
        errorMessage: partialData.errorMessage,
        recovery: {
          message: `Generated ${partialData.chunksCompleted} chunks before failure`,
          downloadUrl: `/api/session/${sessionId}/partial`,
          debugLogsUrl: `/api/session/${sessionId}/debug-logs`
        }
      };

      const errorReportPath = path.join(sessionDir, 'error_report.json');
      await fs.writeFile(errorReportPath, JSON.stringify(errorReport, null, 2), 'utf-8');

      console.log(`[CHECKPOINT] ✅ Partial output saved: ${errorReportPath}`);
      console.log(`[CHECKPOINT]    Chunks completed: ${partialData.chunksCompleted}`);
      console.log(`[CHECKPOINT]    Words achieved: ${partialData.wordCountAchieved}`);

      return {
        success: true,
        errorReportPath: errorReportPath
      };

    } catch (saveError) {
      console.error(`[CHECKPOINT] ❌ Failed to save partial output: ${saveError.message}`);
      return {
        success: false,
        error: saveError.message
      };
    }
  }

  /**
   * Generate a single chunk of the story
   *
   * @param {object} params - Chunk generation parameters
   * @returns {object} Generated chunk with prose and metadata
   */
  async generateChunk(params) {
    const {
      userParams,
      sceneNumber,
      targetWords,
      previousProse,
      isFirstChunk,
      isFinalChunk
    } = params;

    console.log(`[CHECKPOINT]    → Building chunk prompt for scene ${sceneNumber}...`);
    console.log(`[CHECKPOINT]       Target words: ${targetWords}`);
    console.log(`[CHECKPOINT]       Is first: ${isFirstChunk}, Is final: ${isFinalChunk}`);
    console.log(`[CHECKPOINT]       Previous prose length: ${previousProse ? previousProse.length : 0} chars`);

    // Build chunk-specific prompt
    const chunkPrompt = this.buildChunkPrompt({
      userParams,
      sceneNumber,
      targetWords,
      previousProse,
      isFirstChunk,
      isFinalChunk
    });

    console.log(`[CHECKPOINT]    → Getting current state from state manager...`);
    // Get current state for injection
    const currentState = this.stateManager.getState();
    console.log(`[CHECKPOINT]       State has canonical_state: ${!!currentState.canonical_state}`);
    console.log(`[CHECKPOINT]       State keys:`, Object.keys(currentState));

    console.log(`[CHECKPOINT]    → Calling storyGenerator.generateStoryChunk()...`);
    const genStartTime = Date.now();

    // Generate chunk using story generator
    const result = await this.storyGenerator.generateStoryChunk(
      chunkPrompt,
      currentState,
      sceneNumber
    );

    const genDuration = ((Date.now() - genStartTime) / 1000).toFixed(1);
    console.log(`[CHECKPOINT]    → Story chunk generated in ${genDuration}s`);
    console.log(`[CHECKPOINT]       Result has prose: ${!!result.prose}`);
    console.log(`[CHECKPOINT]       Prose length: ${result.prose ? result.prose.length : 0} chars`);

    const wordCount = this.countWords(result.prose);
    console.log(`[CHECKPOINT]       Counted words: ${wordCount}`);

    return {
      scene_number: sceneNumber,
      prose: result.prose,
      wordCount: wordCount,
      isFirstChunk,
      isFinalChunk
    };
  }

  /**
   * Build prompt for chunk generation
   *
   * @param {object} params - Chunk parameters
   * @returns {object} Chunk prompt object
   */
  buildChunkPrompt(params) {
    const {
      userParams,
      sceneNumber,
      targetWords,
      previousProse,
      isFirstChunk,
      isFinalChunk
    } = params;

    const prompt = {
      ...userParams,
      sceneNumber,
      targetWords,
      isChunkedGeneration: true,
      isFirstChunk,
      isFinalChunk
    };

    if (!isFirstChunk) {
      // Add continuation context
      prompt.previousProse = previousProse;
      prompt.continuationInstructions = this.buildContinuationInstructions(sceneNumber);
    }

    if (isFinalChunk) {
      prompt.finalChunkInstructions = 'This is the final chunk. Bring the story to its conclusion.';
    }

    return prompt;
  }

  /**
   * Build continuation instructions for non-first chunks
   *
   * @param {number} sceneNumber - Current scene number
   * @returns {string} Continuation instructions
   */
  buildContinuationInstructions(sceneNumber) {
    return `
You are continuing a story that has been generated in chunks.
This is chunk ${sceneNumber}.

CRITICAL REQUIREMENTS:
1. Continue seamlessly from where the previous chunk ended
2. Maintain absolute consistency with established state
3. Do NOT recap or summarize previous events
4. Do NOT restart the narrative
5. Pick up exactly where the previous chunk left off

The current state (rules, violations, entity capabilities, flags) represents
the CANONICAL truth. You MUST respect all state constraints.
    `.trim();
  }

  /**
   * Extract state delta from generated prose using Claude API
   *
   * @param {string} prose - Generated prose chunk
   * @param {number} sceneNumber - Scene number
   * @returns {string} Raw delta text from Claude
   */
  async extractStateDelta(prose, sceneNumber) {
    console.log(`[CHECKPOINT]    → Building state delta extraction prompt...`);
    console.log(`[CHECKPOINT]       Prose length: ${prose.length} chars`);
    console.log(`[CHECKPOINT]       Prose word count: ${this.countWords(prose)}`);

    const extractionPrompt = `
You are analyzing a chunk of a rule-based horror story to extract state changes.

Your task is to identify ALL changes to the story's state that occurred in this prose.

OUTPUT FORMAT (use this exact structure):

RULE_VIOLATIONS:
- rule_1: violated (if a rule was broken)
- rule_3: violated (if a rule was broken)

ENTITY_CAPABILITIES:
- knows_narrator_name: true (if entity gained this capability)
- can_enter_vehicle: true (if entity gained this capability)

IRREVERSIBLE_FLAGS:
- protected: false (if protection was voided)
- boundary_intact: false (if boundary was breached)

WORLD_FACTS:
- current_time: "10:30 PM" (if time was established)
- location_status: "abandoned" (if location state changed)

TIMELINE_COMMITMENTS:
- "Narrator stepped out of vehicle at 10:15 PM" (concrete event)
- "Entity spoke narrator's name for the first time" (concrete event)

INSTRUCTIONS:
- Only include changes that ACTUALLY occurred in this prose
- Do not infer or assume changes not explicitly shown
- Use exact formatting above
- If a section has no changes, write "None"
- Be precise and literal

PROSE TO ANALYZE:

${prose}

EXTRACTED STATE CHANGES:
    `.trim();

    console.log(`[CHECKPOINT]       Extraction prompt length: ${extractionPrompt.length} chars`);

    try {
      console.log(`[CHECKPOINT]    → Calling Claude API for delta extraction...`);
      console.log(`[CHECKPOINT]       Model: claude-sonnet-4-20250514`);
      console.log(`[CHECKPOINT]       Max tokens: 2000`);
      console.log(`[CHECKPOINT]       Temperature: 0.0`);

      const apiStartTime = Date.now();

      const response = await this.claudeClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.0, // Deterministic extraction
        messages: [{
          role: 'user',
          content: extractionPrompt
        }]
      });

      const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(1);
      console.log(`[CHECKPOINT]    → Delta extraction API call completed in ${apiDuration}s`);
      console.log(`[CHECKPOINT]       Response status: ${response.stop_reason}`);
      console.log(`[CHECKPOINT]       Input tokens: ${response.usage.input_tokens}`);
      console.log(`[CHECKPOINT]       Output tokens: ${response.usage.output_tokens}`);

      const deltaText = response.content[0].text;
      console.log(`[CHECKPOINT]       Delta text length: ${deltaText.length} chars`);
      console.log(`[CHECKPOINT]       Delta text preview (first 200 chars):`);
      console.log(`[CHECKPOINT]       "${deltaText.substring(0, 200)}..."`);

      return deltaText;

    } catch (error) {
      console.error(`[CHECKPOINT] ❌❌❌ Error extracting state delta ❌❌❌`);
      console.error(`[CHECKPOINT] Error message: ${error.message}`);
      console.error(`[CHECKPOINT] Error type: ${error.constructor.name}`);
      console.error(`[CHECKPOINT] Error code: ${error.code}`);
      if (error.response) {
        console.error(`[CHECKPOINT] API response status: ${error.response.status}`);
        console.error(`[CHECKPOINT] API response data:`, error.response.data);
      }
      console.error(`[CHECKPOINT] Full error stack:`);
      console.error(error.stack);
      throw error;
    }
  }

  /**
   * Parse delta text into structured changes
   *
   * @param {string} deltaText - Raw delta text from Claude
   * @param {number} sceneNumber - Scene number
   * @returns {object} Parsed delta with structured changes
   */
  parseDelta(deltaText, sceneNumber) {
    const delta = {
      scene_number: sceneNumber,
      changes: [],
      timestamp: new Date().toISOString()
    };

    // Parse RULE_VIOLATIONS
    const ruleViolationsMatch = deltaText.match(/RULE_VIOLATIONS:([\s\S]*?)(?=\n[A-Z_]+:|$)/);
    if (ruleViolationsMatch) {
      const rulesSection = ruleViolationsMatch[1];
      const ruleLines = rulesSection.match(/- (rule_\d+): violated/g);
      if (ruleLines) {
        ruleLines.forEach(line => {
          const ruleId = line.match(/rule_\d+/)[0];
          delta.changes.push({
            type: 'rule_violation',
            rule_id: ruleId,
            scene_number: sceneNumber
          });
        });
      }
    }

    // Parse ENTITY_CAPABILITIES
    const capabilitiesMatch = deltaText.match(/ENTITY_CAPABILITIES:([\s\S]*?)(?=\n[A-Z_]+:|$)/);
    if (capabilitiesMatch) {
      const capSection = capabilitiesMatch[1];
      const capLines = capSection.match(/- ([a-z_]+): (true|false)/g);
      if (capLines) {
        capLines.forEach(line => {
          const match = line.match(/- ([a-z_]+): (true|false)/);
          if (match) {
            delta.changes.push({
              type: 'entity_capability',
              capability: match[1],
              value: match[2] === 'true'
            });
          }
        });
      }
    }

    // Parse IRREVERSIBLE_FLAGS
    const flagsMatch = deltaText.match(/IRREVERSIBLE_FLAGS:([\s\S]*?)(?=\n[A-Z_]+:|$)/);
    if (flagsMatch) {
      const flagsSection = flagsMatch[1];
      const flagLines = flagsSection.match(/- ([a-z_]+): (true|false)/g);
      if (flagLines) {
        flagLines.forEach(line => {
          const match = line.match(/- ([a-z_]+): (true|false)/);
          if (match) {
            delta.changes.push({
              type: 'irreversible_flag',
              flag: match[1],
              value: match[2] === 'true'
            });
          }
        });
      }
    }

    // Parse WORLD_FACTS
    const factsMatch = deltaText.match(/WORLD_FACTS:([\s\S]*?)(?=\n[A-Z_]+:|$)/);
    if (factsMatch) {
      const factsSection = factsMatch[1];
      const factLines = factsSection.match(/- ([a-z_]+): "([^"]+)"/g);
      if (factLines) {
        factLines.forEach(line => {
          const match = line.match(/- ([a-z_]+): "([^"]+)"/);
          if (match) {
            delta.changes.push({
              type: 'world_fact',
              key: match[1],
              value: match[2]
            });
          }
        });
      }
    }

    // Parse TIMELINE_COMMITMENTS
    const timelineMatch = deltaText.match(/TIMELINE_COMMITMENTS:([\s\S]*?)(?=\n[A-Z_]+:|$)/);
    if (timelineMatch) {
      const timelineSection = timelineMatch[1];
      const timelineLines = timelineSection.match(/- "([^"]+)"/g);
      if (timelineLines) {
        timelineLines.forEach(line => {
          const match = line.match(/- "([^"]+)"/);
          if (match) {
            delta.changes.push({
              type: 'timeline_commitment',
              commitment: match[1]
            });
          }
        });
      }
    }

    return delta;
  }

  /**
   * Count words in text
   *
   * @param {string} text - Text to count
   * @returns {number} Word count
   */
  countWords(text) {
    return text.trim().split(/\s+/).length;
  }

  /**
   * Save checkpoint to file
   *
   * @param {object} checkpoint - Checkpoint data
   * @param {string} filepath - Output path
   */
  async saveCheckpoint(checkpoint, filepath) {
    const fs = require('fs').promises;
    await fs.writeFile(filepath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Load checkpoint from file
   *
   * @param {string} filepath - Checkpoint file path
   * @returns {object} Checkpoint data
   */
  async loadCheckpoint(filepath) {
    const fs = require('fs').promises;
    const data = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(data);
  }
}

module.exports = CheckpointManager;
