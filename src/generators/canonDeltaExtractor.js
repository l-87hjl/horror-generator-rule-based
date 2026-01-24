/**
 * Canon Delta Extractor Module
 * Extracts minimal state changes from generated chunks
 *
 * Purpose: Extract ONLY essential state tracking between chunks.
 * Defers all heavy processing (audit, refinement, validation) to post-processing.
 *
 * Extracts:
 * - rulesIntroduced: array of rule texts mentioned in chunk
 * - rulesViolated: array of rule IDs that were broken
 * - entityCapabilities: new behaviors manifested
 * - timelineCommitments: concrete time markers or deadlines established
 */

class CanonDeltaExtractor {
  constructor(claudeClient, options = {}) {
    this.claudeClient = claudeClient;
    this.model = options.model || 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens || 1500;
    this.timeout = options.timeout || 30000; // 30 second timeout
  }

  /**
   * Extract minimal delta from chunk text
   *
   * @param {string} chunkText - The generated chunk prose
   * @param {object} currentState - Current canonical state
   * @param {object} options - Additional options
   * @returns {Promise<object>} Minimal delta object
   */
  async extractDelta(chunkText, currentState = {}, options = {}) {
    const startTime = Date.now();
    const sceneNumber = options.sceneNumber || null;

    // Build compact extraction prompt (< 500 tokens)
    const prompt = this.buildExtractionPrompt(chunkText, currentState);

    try {
      const response = await this.callClaudeWithTimeout(prompt);
      const deltaText = response.content[0].text;

      // Parse the response into structured delta
      const delta = this.parseDeltaResponse(deltaText, sceneNumber);

      const duration = Date.now() - startTime;

      return {
        success: true,
        delta: delta,
        rawResponse: deltaText,
        usage: response.usage,
        duration: duration,
        sceneNumber: sceneNumber
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        delta: this.createEmptyDelta(sceneNumber),
        error: error.message,
        errorType: error.code || error.constructor.name,
        duration: duration,
        sceneNumber: sceneNumber
      };
    }
  }

  /**
   * Build compact extraction prompt (target < 500 tokens)
   *
   * @param {string} chunkText - Chunk prose
   * @param {object} currentState - Current state
   * @returns {string} Extraction prompt
   */
  buildExtractionPrompt(chunkText, currentState) {
    // Get active rules for context (compact format)
    const rules = currentState.canonical_state?.rules || [];
    const activeRules = rules
      .filter(r => r.active && r.text)
      .map(r => `${r.rule_id}: ${r.text?.substring(0, 50)}...`)
      .slice(0, 7) // Max 7 rules
      .join('\n');

    return `Extract state changes from this horror story chunk. Be precise and literal.

ACTIVE RULES:
${activeRules || 'None established yet'}

OUTPUT FORMAT (JSON):
{
  "rulesIntroduced": ["exact rule text if new rule stated"],
  "rulesViolated": ["rule_1", "rule_2"],
  "entityCapabilities": {"capability_name": true},
  "timelineCommitments": ["specific event with time marker"]
}

INSTRUCTIONS:
- Only include changes EXPLICITLY shown in prose
- rulesViolated: use rule_id (rule_1, rule_2, etc.) if character breaks a rule
- entityCapabilities: new entity abilities (e.g., knows_name, can_enter, has_seen)
- timelineCommitments: concrete time-bound events (e.g., "arrived at 10pm", "deadline is midnight")
- Return empty arrays/objects if no changes

CHUNK:
${chunkText.substring(0, 3000)}

JSON:`;
  }

  /**
   * Call Claude API with timeout
   *
   * @param {string} prompt - The prompt
   * @returns {Promise<object>} Claude response
   */
  async callClaudeWithTimeout(prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.claudeClient.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.0, // Deterministic extraction
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      clearTimeout(timeoutId);
      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Delta extraction timed out');
      }
      throw error;
    }
  }

  /**
   * Parse Claude's response into structured delta
   *
   * @param {string} responseText - Raw response text
   * @param {number} sceneNumber - Scene number
   * @returns {object} Parsed delta
   */
  parseDeltaResponse(responseText, sceneNumber) {
    const delta = this.createEmptyDelta(sceneNumber);

    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[DeltaExtractor] No JSON found in response');
        return delta;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and extract each field
      if (Array.isArray(parsed.rulesIntroduced)) {
        delta.rulesIntroduced = parsed.rulesIntroduced.filter(r => typeof r === 'string');
      }

      if (Array.isArray(parsed.rulesViolated)) {
        delta.rulesViolated = parsed.rulesViolated
          .filter(r => typeof r === 'string')
          .map(r => r.toLowerCase().replace(/\s+/g, '_'));
      }

      if (parsed.entityCapabilities && typeof parsed.entityCapabilities === 'object') {
        delta.entityCapabilities = {};
        for (const [key, value] of Object.entries(parsed.entityCapabilities)) {
          if (typeof value === 'boolean' || typeof value === 'string') {
            delta.entityCapabilities[key.toLowerCase().replace(/\s+/g, '_')] = value;
          }
        }
      }

      if (Array.isArray(parsed.timelineCommitments)) {
        delta.timelineCommitments = parsed.timelineCommitments.filter(t => typeof t === 'string');
      }

    } catch (parseError) {
      console.warn('[DeltaExtractor] Failed to parse JSON:', parseError.message);
      // Fall back to regex parsing
      this.regexFallbackParse(responseText, delta);
    }

    return delta;
  }

  /**
   * Fallback regex parsing if JSON parsing fails
   *
   * @param {string} text - Response text
   * @param {object} delta - Delta object to populate
   */
  regexFallbackParse(text, delta) {
    // Try to find rule violations
    const violationMatches = text.match(/rule_\d+/gi);
    if (violationMatches) {
      delta.rulesViolated = [...new Set(violationMatches.map(m => m.toLowerCase()))];
    }

    // Try to find capability mentions
    const capabilityPatterns = [
      /knows[_\s]+(narrator['s]*[_\s]*)?name/gi,
      /can[_\s]+enter/gi,
      /can[_\s]+see/gi,
      /aware[_\s]+of/gi,
      /has[_\s]+seen/gi
    ];

    for (const pattern of capabilityPatterns) {
      const match = text.match(pattern);
      if (match) {
        const capability = match[0].toLowerCase().replace(/\s+/g, '_');
        delta.entityCapabilities[capability] = true;
      }
    }

    // Try to find time markers
    const timePatterns = [
      /\d{1,2}:\d{2}\s*(am|pm)?/gi,
      /midnight/gi,
      /dawn/gi,
      /sunset/gi,
      /sunrise/gi
    ];

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Only add if it seems like a commitment (in context)
        const context = text.substring(
          Math.max(0, text.indexOf(match[0]) - 50),
          Math.min(text.length, text.indexOf(match[0]) + match[0].length + 50)
        );
        if (context.match(/must|deadline|by|before|after|at|until/i)) {
          delta.timelineCommitments.push(match[0]);
        }
      }
    }
  }

  /**
   * Create empty delta structure
   *
   * @param {number} sceneNumber - Scene number
   * @returns {object} Empty delta
   */
  createEmptyDelta(sceneNumber) {
    return {
      sceneNumber: sceneNumber,
      timestamp: new Date().toISOString(),
      rulesIntroduced: [],
      rulesViolated: [],
      entityCapabilities: {},
      timelineCommitments: [],
      changes: [] // For compatibility with existing stateManager.applyDelta
    };
  }

  /**
   * Convert extracted delta to stateManager-compatible format
   *
   * @param {object} extractedDelta - Delta from extractDelta()
   * @returns {object} StateManager-compatible delta
   */
  toStateManagerFormat(extractedDelta) {
    const delta = {
      scene_number: extractedDelta.sceneNumber,
      timestamp: extractedDelta.timestamp,
      changes: []
    };

    // Convert rule violations
    for (const ruleId of extractedDelta.rulesViolated) {
      delta.changes.push({
        type: 'rule_violation',
        rule_id: ruleId,
        scene_number: extractedDelta.sceneNumber
      });
    }

    // Convert entity capabilities
    for (const [capability, value] of Object.entries(extractedDelta.entityCapabilities)) {
      delta.changes.push({
        type: 'entity_capability',
        capability: capability,
        value: value
      });
    }

    // Convert timeline commitments
    for (const commitment of extractedDelta.timelineCommitments) {
      delta.changes.push({
        type: 'timeline_commitment',
        commitment: commitment
      });
    }

    return delta;
  }
}

module.exports = CanonDeltaExtractor;
