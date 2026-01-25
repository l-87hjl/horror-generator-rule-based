/**
 * Cost Estimator Module
 * Estimates token usage, cost, and time for generation
 *
 * Purpose: Provide accurate estimates before generation starts,
 * with warnings for configurations that may exceed safe execution windows.
 */

// Claude model pricing (as of early 2025)
const PRICING = {
  'claude-sonnet-4-5-20250929': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  'claude-sonnet-4-20250514': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  'claude-3-opus': {
    inputPerMillion: 15.00,
    outputPerMillion: 75.00
  },
  'claude-3-sonnet': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  'claude-3-haiku': {
    inputPerMillion: 0.25,
    outputPerMillion: 1.25
  },
  'default': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  }
};

// Time estimates (based on empirical testing)
const TIME_ESTIMATES = {
  // Seconds per 1000 words of output
  generationPerKWord: 45,
  // Fixed overhead per chunk
  chunkOverhead: 5,
  // Audit time (seconds)
  auditTime: 30,
  // Refinement per round (seconds)
  refinementPerRound: 60,
  // Packaging (seconds)
  packagingTime: 10
};

// Safe execution window (Render/Heroku timeout)
const SAFE_EXECUTION_WINDOW = 14 * 60; // 14 minutes in seconds

class CostEstimator {
  constructor(options = {}) {
    this.model = options.model || 'claude-sonnet-4-5-20250929';
    this.chunkSize = options.chunkSize || 2000;
    this.tokensPerWord = options.tokensPerWord || 1.3;
  }

  /**
   * Estimate generation cost and time
   *
   * @param {number} wordCount - Target word count
   * @param {number} ruleCount - Number of rules
   * @param {object} options - Additional options
   * @returns {object} Estimation result
   */
  estimateGenerationCost(wordCount, ruleCount = 7, options = {}) {
    const runAudit = options.runAudit !== false;
    const runRefinement = options.runRefinement !== false;
    const maxRefinementRounds = options.maxRefinementRounds || 2;

    // Calculate chunk count
    const numChunks = Math.ceil(wordCount / this.chunkSize);
    const useChunkedGeneration = numChunks > 1;

    // Calculate tokens
    const tokens = this.calculateTokens(wordCount, ruleCount, {
      numChunks,
      runAudit,
      runRefinement,
      maxRefinementRounds
    });

    // Calculate cost
    const cost = this.calculateCost(tokens);

    // Calculate time
    const time = this.calculateTime(wordCount, {
      numChunks,
      runAudit,
      runRefinement,
      maxRefinementRounds
    });

    // Safety warnings
    const warnings = this.generateWarnings(time, tokens, wordCount);

    return {
      // Token estimates
      estimatedInputTokens: tokens.input,
      estimatedOutputTokens: tokens.output,
      totalTokens: tokens.total,

      // Cost estimate
      estimatedCostUSD: cost.total,
      costBreakdown: cost.breakdown,

      // Time estimate
      estimatedTimeSeconds: time.total,
      estimatedTimeMinutes: Math.ceil(time.total / 60),
      estimatedTimeFormatted: this.formatTime(time.total),
      timeBreakdown: time.breakdown,

      // Safety checks
      willExceedSafeWindow: time.total > SAFE_EXECUTION_WINDOW,
      safeWindowMinutes: Math.floor(SAFE_EXECUTION_WINDOW / 60),
      warnings,

      // Generation info
      useChunkedGeneration,
      numChunks,
      chunkSize: this.chunkSize,
      model: this.model
    };
  }

  /**
   * Calculate token estimates
   */
  calculateTokens(wordCount, ruleCount, options) {
    const { numChunks, runAudit, runRefinement, maxRefinementRounds } = options;

    // Base prompt tokens (templates, rules, system prompt)
    const basePromptTokens = 1500 + (ruleCount * 100);

    // Output tokens (story text)
    const storyOutputTokens = Math.round(wordCount * this.tokensPerWord);

    // Per-chunk overhead (context, state injection)
    const perChunkContextTokens = 500;
    const totalChunkInputTokens = numChunks * (basePromptTokens + perChunkContextTokens);

    // State context grows per chunk (previous prose summary)
    const contextGrowthTokens = numChunks > 1
      ? Math.round((numChunks * (numChunks - 1) / 2) * 200)
      : 0;

    // Audit tokens
    const auditInputTokens = runAudit ? storyOutputTokens + 2000 : 0;
    const auditOutputTokens = runAudit ? 3000 : 0;

    // Refinement tokens (per round)
    const refinementInputPerRound = storyOutputTokens + 2000;
    const refinementOutputPerRound = Math.round(storyOutputTokens * 0.3); // Partial rewrite
    const refinementInputTokens = runRefinement
      ? refinementInputPerRound * maxRefinementRounds
      : 0;
    const refinementOutputTokens = runRefinement
      ? refinementOutputPerRound * maxRefinementRounds
      : 0;

    // Total
    const totalInputTokens = totalChunkInputTokens + contextGrowthTokens +
      auditInputTokens + refinementInputTokens;
    const totalOutputTokens = storyOutputTokens + auditOutputTokens + refinementOutputTokens;

    return {
      input: totalInputTokens,
      output: totalOutputTokens,
      total: totalInputTokens + totalOutputTokens,
      breakdown: {
        generation: {
          input: totalChunkInputTokens + contextGrowthTokens,
          output: storyOutputTokens
        },
        audit: {
          input: auditInputTokens,
          output: auditOutputTokens
        },
        refinement: {
          input: refinementInputTokens,
          output: refinementOutputTokens
        }
      }
    };
  }

  /**
   * Calculate cost from tokens
   */
  calculateCost(tokens) {
    const pricing = PRICING[this.model] || PRICING.default;

    const inputCost = (tokens.input / 1000000) * pricing.inputPerMillion;
    const outputCost = (tokens.output / 1000000) * pricing.outputPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      total: Math.round(totalCost * 100) / 100,
      input: Math.round(inputCost * 100) / 100,
      output: Math.round(outputCost * 100) / 100,
      breakdown: {
        generation: {
          input: Math.round((tokens.breakdown.generation.input / 1000000) * pricing.inputPerMillion * 100) / 100,
          output: Math.round((tokens.breakdown.generation.output / 1000000) * pricing.outputPerMillion * 100) / 100
        },
        audit: {
          input: Math.round((tokens.breakdown.audit.input / 1000000) * pricing.inputPerMillion * 100) / 100,
          output: Math.round((tokens.breakdown.audit.output / 1000000) * pricing.outputPerMillion * 100) / 100
        },
        refinement: {
          input: Math.round((tokens.breakdown.refinement.input / 1000000) * pricing.inputPerMillion * 100) / 100,
          output: Math.round((tokens.breakdown.refinement.output / 1000000) * pricing.outputPerMillion * 100) / 100
        }
      }
    };
  }

  /**
   * Calculate time estimates
   */
  calculateTime(wordCount, options) {
    const { numChunks, runAudit, runRefinement, maxRefinementRounds } = options;

    // Generation time
    const generationTime = (wordCount / 1000) * TIME_ESTIMATES.generationPerKWord;
    const chunkOverhead = numChunks * TIME_ESTIMATES.chunkOverhead;

    // Audit time
    const auditTime = runAudit ? TIME_ESTIMATES.auditTime : 0;

    // Refinement time
    const refinementTime = runRefinement
      ? TIME_ESTIMATES.refinementPerRound * maxRefinementRounds
      : 0;

    // Packaging time
    const packagingTime = TIME_ESTIMATES.packagingTime;

    // Total
    const totalTime = generationTime + chunkOverhead + auditTime + refinementTime + packagingTime;

    return {
      total: Math.round(totalTime),
      breakdown: {
        generation: Math.round(generationTime + chunkOverhead),
        audit: auditTime,
        refinement: refinementTime,
        packaging: packagingTime
      }
    };
  }

  /**
   * Generate warnings for unsafe configurations
   */
  generateWarnings(time, tokens, wordCount) {
    const warnings = [];

    // Time warnings
    if (time.total > SAFE_EXECUTION_WINDOW) {
      const overageMinutes = Math.ceil((time.total - SAFE_EXECUTION_WINDOW) / 60);
      warnings.push({
        type: 'timeout_risk',
        severity: 'high',
        message: `Estimated time (${this.formatTime(time.total)}) exceeds safe window (14 min) by ${overageMinutes} minutes. SSE streaming recommended.`
      });
    } else if (time.total > SAFE_EXECUTION_WINDOW * 0.8) {
      warnings.push({
        type: 'timeout_risk',
        severity: 'medium',
        message: `Estimated time (${this.formatTime(time.total)}) is close to safe window limit. Monitor progress carefully.`
      });
    }

    // Token warnings
    if (tokens.total > 500000) {
      warnings.push({
        type: 'high_token_usage',
        severity: 'medium',
        message: `High token usage (${Math.round(tokens.total / 1000)}K tokens). Consider reducing word count or disabling refinement.`
      });
    }

    // Word count warnings
    if (wordCount > 30000) {
      warnings.push({
        type: 'long_story',
        severity: 'info',
        message: `Long story (${wordCount} words) will be generated in ${Math.ceil(wordCount / 2000)} chunks. Each chunk saved independently for recovery.`
      });
    }

    return warnings;
  }

  /**
   * Format time in human-readable format
   */
  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  }

  /**
   * Get a summary string for display
   */
  getSummary(estimate) {
    const parts = [
      `~${Math.round(estimate.totalTokens / 1000)}K tokens`,
      `~$${estimate.estimatedCostUSD.toFixed(2)}`,
      `~${estimate.estimatedTimeFormatted}`
    ];

    if (estimate.useChunkedGeneration) {
      parts.push(`${estimate.numChunks} chunks`);
    }

    return parts.join(' | ');
  }
}

module.exports = CostEstimator;
