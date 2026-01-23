/**
 * Token and Cost Estimator
 * Client-side calculation of expected token usage and API costs
 *
 * Update quarterly based on actual usage statistics
 */

const TokenEstimator = {
  // Token estimation constants (update quarterly)
  TOKENS_PER_WORD: 1.3,  // English average for Claude tokenizer

  // Model pricing ($ per million tokens) - as of Q1 2026
  MODEL_PRICING: {
    'claude-sonnet-4-5-20250929': {
      input: 3.00,   // $ per million input tokens
      output: 15.00  // $ per million output tokens
    }
  },

  // Prompt overhead estimates (tokens)
  PROMPT_OVERHEAD: {
    system_prompt: 2500,           // Base system prompt
    templates: 1500,               // Rule templates and schemas
    user_params: 500,              // User selection parameters
    state_constraints: 800,        // Phase 5: State injection (when applicable)
    revision_audit: 2000,          // Audit system prompt
    refinement_base: 1500,         // Refinement prompt base
    chunked_overhead_per_chunk: 300, // Phase 2: Additional overhead per chunk
    delta_extraction_per_chunk: 500  // Phase 2: Delta extraction overhead
  },

  /**
   * Estimate token usage and cost for given parameters
   *
   * @param {object} userParams - User input parameters
   * @returns {object} Estimation result with tokens and cost
   */
  estimate(userParams) {
    const wordCount = userParams.wordCount || 10000;
    const ruleCount = userParams.ruleCount || 7;

    // Determine if chunked generation will be used (Phase 2)
    const useChunkedGeneration = wordCount > 12000;
    const chunkCount = useChunkedGeneration ? Math.ceil(wordCount / 1500) : 1;

    // === INPUT TOKENS (what we send to Claude) ===

    let inputTokens =
      this.PROMPT_OVERHEAD.system_prompt +
      this.PROMPT_OVERHEAD.templates +
      this.PROMPT_OVERHEAD.user_params;

    // Add state constraint overhead (Phase 5)
    // State constraints grow with rule count
    const stateOverhead = this.PROMPT_OVERHEAD.state_constraints * (ruleCount / 7);
    inputTokens += stateOverhead;

    // Phase 2: Chunked generation overhead
    if (useChunkedGeneration) {
      // Each chunk has overhead
      inputTokens += this.PROMPT_OVERHEAD.chunked_overhead_per_chunk * chunkCount;

      // Delta extraction requires sending prose back to Claude
      const deltaExtractionInputPerChunk = (1500 * this.TOKENS_PER_WORD) +
                                           this.PROMPT_OVERHEAD.delta_extraction_per_chunk;
      inputTokens += deltaExtractionInputPerChunk * chunkCount;
    }

    // Revision audit (always happens)
    inputTokens += this.PROMPT_OVERHEAD.revision_audit;

    // Story is sent to auditor
    inputTokens += (wordCount * this.TOKENS_PER_WORD);

    // Refinement (if enabled)
    if (userParams.autoRefine !== false) { // Default is true
      inputTokens += this.PROMPT_OVERHEAD.refinement_base;
      // Refined story is sent for processing
      inputTokens += (wordCount * this.TOKENS_PER_WORD * 0.3); // Partial story context
    }

    // === OUTPUT TOKENS (what we receive from Claude) ===

    let outputTokens = wordCount * this.TOKENS_PER_WORD;

    // Phase 2: Delta extraction output
    if (useChunkedGeneration) {
      // Each delta extraction produces ~300 tokens
      outputTokens += (300 * chunkCount);
    }

    // Audit report output (~1500 tokens)
    outputTokens += 1500;

    // Refinement output (if enabled)
    if (userParams.autoRefine !== false) {
      // Refinement typically modifies 10-30% of story
      outputTokens += (wordCount * this.TOKENS_PER_WORD * 0.2);
    }

    // === COST CALCULATION ===

    const model = 'claude-sonnet-4-5-20250929';
    const pricing = this.MODEL_PRICING[model];

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // === RETURN ESTIMATE ===

    return {
      inputTokens: Math.round(inputTokens),
      outputTokens: Math.round(outputTokens),
      totalTokens: Math.round(inputTokens + outputTokens),
      estimatedCost: totalCost,
      breakdown: {
        inputCost: inputCost,
        outputCost: outputCost
      },
      metadata: {
        useChunkedGeneration,
        chunkCount,
        confidenceLevel: '±20%',  // Estimation accuracy
        lastUpdated: '2026-01-23'  // Update this quarterly
      }
    };
  },

  /**
   * Format cost for display
   *
   * @param {number} cost - Cost in dollars
   * @returns {string} Formatted cost string
   */
  formatCost(cost) {
    if (cost < 0.01) {
      return `$${(cost * 1000).toFixed(2)}¢`;
    } else if (cost < 1.00) {
      return `$${cost.toFixed(3)}`;
    } else {
      return `$${cost.toFixed(2)}`;
    }
  },

  /**
   * Format token count for display
   *
   * @param {number} tokens - Token count
   * @returns {string} Formatted token string with commas
   */
  formatTokens(tokens) {
    return tokens.toLocaleString();
  }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TokenEstimator;
}
