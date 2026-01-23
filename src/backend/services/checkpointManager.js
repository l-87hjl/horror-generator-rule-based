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

    console.log(`\n=== Starting Chunked Generation ===`);
    console.log(`Target: ${targetWordCount} words`);
    console.log(`Chunk size: ${this.CHUNK_SIZE} words\n`);

    while (currentWordCount < targetWordCount) {
      const remainingWords = targetWordCount - currentWordCount;
      const chunkTargetWords = Math.min(this.CHUNK_SIZE, remainingWords);

      console.log(`\n--- Generating Chunk ${sceneNumber} ---`);
      console.log(`Target: ${chunkTargetWords} words`);
      console.log(`Progress: ${currentWordCount}/${targetWordCount} words`);

      try {
        // Step 1: Generate chunk
        const chunk = await this.generateChunk({
          userParams,
          sceneNumber,
          targetWords: chunkTargetWords,
          previousProse,
          isFirstChunk: sceneNumber === 1,
          isFinalChunk: remainingWords <= this.CHUNK_SIZE
        });

        chunks.push(chunk);
        currentWordCount += chunk.wordCount;
        previousProse = chunk.prose;

        console.log(`✅ Chunk generated: ${chunk.wordCount} words`);

        // Step 2: Extract state delta
        console.log(`Extracting state delta...`);
        const deltaText = await this.extractStateDelta(chunk.prose, sceneNumber);

        // Step 3: Parse and apply delta
        const delta = this.parseDelta(deltaText, sceneNumber);
        console.log(`Parsed delta: ${delta.changes.length} changes`);

        this.stateManager.applyDelta(sceneNumber, delta);
        console.log(`✅ State updated`);

        // Step 4: Save checkpoint
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
        console.log(`✅ Checkpoint ${sceneNumber} saved`);

        sceneNumber++;

        // Check if we've reached target
        if (currentWordCount >= targetWordCount) {
          console.log(`\n✅ Target word count reached: ${currentWordCount} words`);
          break;
        }

      } catch (error) {
        console.error(`❌ Error generating chunk ${sceneNumber}:`, error.message);
        throw error;
      }
    }

    // Combine all chunks into final story
    const fullStory = chunks.map(c => c.prose).join('\n\n---\n\n');

    console.log(`\n=== Chunked Generation Complete ===`);
    console.log(`Total chunks: ${chunks.length}`);
    console.log(`Total words: ${currentWordCount}`);
    console.log(`Checkpoints: ${checkpoints.length}\n`);

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

    // Build chunk-specific prompt
    const chunkPrompt = this.buildChunkPrompt({
      userParams,
      sceneNumber,
      targetWords,
      previousProse,
      isFirstChunk,
      isFinalChunk
    });

    // Get current state for injection
    const currentState = this.stateManager.getState();

    // Generate chunk using story generator
    const result = await this.storyGenerator.generateStoryChunk(
      chunkPrompt,
      currentState,
      sceneNumber
    );

    return {
      scene_number: sceneNumber,
      prose: result.prose,
      wordCount: this.countWords(result.prose),
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

    try {
      const response = await this.claudeClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.0, // Deterministic extraction
        messages: [{
          role: 'user',
          content: extractionPrompt
        }]
      });

      const deltaText = response.content[0].text;
      return deltaText;

    } catch (error) {
      console.error('❌ Error extracting state delta:', error.message);
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
