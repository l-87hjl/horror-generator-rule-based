/**
 * Checkpoint Manager Service
 * Manages chunked story generation with state delta extraction
 * Enables unlimited story length by breaking generation into ~1500 word chunks
 */

class CheckpointManager {
  constructor(storyGenerator, stateManager, claudeClient) {
    this.storyGenerator = storyGenerator;
    this.stateManager = stateManager;
    this.claudeClient = claudeClient;

    // Checkpoint configuration
    this.CHUNK_SIZE = 1500; // Target words per chunk
    this.MAX_RETRIES = 3;
    this.CHECKPOINT_VERSION = '1.0.0';
  }

  /**
   * Generate a complete story in chunks with state tracking
   *
   * @param {object} userParams - User story parameters
   * @param {number} targetWordCount - Total desired story length
   * @returns {object} Complete story data with checkpoints
   */
  async generateChunkedStory(userParams, targetWordCount) {
    const chunks = [];
    const checkpoints = [];
    let currentWordCount = 0;
    let sceneNumber = 1;
    let previousProse = '';

    console.log(`\n[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Starting Chunked Generation`);
    console.log(`[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Target word count: ${targetWordCount}`);
    console.log(`[CHECKPOINT] Chunk size: ${this.CHUNK_SIZE} words`);
    console.log(`[CHECKPOINT] User params:`, JSON.stringify(userParams, null, 2));
    console.log(`[CHECKPOINT] ============================================\n`);

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

      try {
        // Step 1: Generate chunk
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

        chunks.push(chunk);
        currentWordCount += chunk.wordCount;
        previousProse = chunk.prose;

        // Step 2: Extract state delta
        console.log(`\n[CHECKPOINT] STEP 2: Extracting state delta for scene ${sceneNumber}...`);
        const deltaStartTime = Date.now();

        const deltaText = await this.extractStateDelta(chunk.prose, sceneNumber);

        const deltaDuration = ((Date.now() - deltaStartTime) / 1000).toFixed(1);
        console.log(`[CHECKPOINT] ✅ Delta extracted in ${deltaDuration}s`);
        console.log(`[CHECKPOINT]    Raw delta text length: ${deltaText.length} chars`);
        console.log(`[CHECKPOINT]    Delta preview: "${deltaText.substring(0, 150)}..."`);

        // Step 3: Parse and apply delta
        console.log(`\n[CHECKPOINT] STEP 3: Parsing delta...`);
        const delta = this.parseDelta(deltaText, sceneNumber);
        console.log(`[CHECKPOINT] ✅ Parsed delta: ${delta.changes.length} changes`);
        console.log(`[CHECKPOINT]    Changes:`, JSON.stringify(delta.changes, null, 2));

        console.log(`\n[CHECKPOINT] STEP 4: Applying delta to state manager...`);
        const stateBeforeApply = JSON.stringify(this.stateManager.getState());
        this.stateManager.applyDelta(sceneNumber, delta);
        const stateAfterApply = JSON.stringify(this.stateManager.getState());
        console.log(`[CHECKPOINT] ✅ State updated`);
        console.log(`[CHECKPOINT]    State changed: ${stateBeforeApply !== stateAfterApply}`);

        // Step 4: Save checkpoint
        console.log(`\n[CHECKPOINT] STEP 5: Creating checkpoint ${sceneNumber}...`);
        const checkpoint = {
          scene_number: sceneNumber,
          chunk_word_count: chunk.wordCount,
          total_word_count: currentWordCount,
          state_delta: delta,
          state_snapshot: this.stateManager.getState().canonical_state,
          timestamp: new Date().toISOString(),
          version: this.CHECKPOINT_VERSION
        };

        checkpoints.push(checkpoint);
        console.log(`[CHECKPOINT] ✅ Checkpoint ${sceneNumber} saved to memory`);
        console.log(`[CHECKPOINT]    Total checkpoints: ${checkpoints.length}`);

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
        console.error(`[CHECKPOINT] Chunks completed: ${chunks.length}`);
        console.error(`[CHECKPOINT] Full error stack:`);
        console.error(error.stack);
        console.error(`[CHECKPOINT] ============================================`);
        throw error;
      }
    }

    // Combine all chunks into final story
    console.log(`\n[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Combining chunks into final story...`);
    console.log(`[CHECKPOINT]    Total chunks: ${chunks.length}`);

    const fullStory = chunks.map(c => c.prose).join('\n\n---\n\n');

    console.log(`[CHECKPOINT]    Full story length: ${fullStory.length} chars`);
    console.log(`[CHECKPOINT]    Full story word count: ${this.countWords(fullStory)}`);

    console.log(`\n[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] ✅✅✅ Chunked Generation Complete ✅✅✅`);
    console.log(`[CHECKPOINT] ============================================`);
    console.log(`[CHECKPOINT] Total chunks generated: ${chunks.length}`);
    console.log(`[CHECKPOINT] Total words: ${currentWordCount}`);
    console.log(`[CHECKPOINT] Target words: ${targetWordCount}`);
    console.log(`[CHECKPOINT] Checkpoints created: ${checkpoints.length}`);
    console.log(`[CHECKPOINT] Checkpoint version: ${this.CHECKPOINT_VERSION}`);
    console.log(`[CHECKPOINT] ============================================\n`);

    return {
      story: fullStory,
      chunks,
      checkpoints,
      metadata: {
        total_chunks: chunks.length,
        total_words: currentWordCount,
        target_words: targetWordCount,
        checkpoint_version: this.CHECKPOINT_VERSION
      }
    };
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
