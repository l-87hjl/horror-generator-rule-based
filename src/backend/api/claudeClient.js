/**
 * Claude API Client
 * Handles all interactions with Anthropic's Claude API
 */

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeClient {
  constructor(apiKey, config = {}) {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: apiKey,
      timeout: config.timeout || 120000, // 2 minutes default timeout (reduced from 5)
      maxRetries: config.maxRetries || 2  // Retry failed requests
    });

    this.config = {
      model: config.model || 'claude-sonnet-4-5-20250929',
      maxTokens: config.maxTokens || 16000,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 120000
    };

    console.log(`✅ Claude client initialized with ${this.config.timeout/1000}s timeout, ${this.config.maxTokens} max tokens`);
  }

  /**
   * Helper: Wrap API call with manual timeout enforcement
   * Uses Promise.race to ensure timeout is respected even if SDK timeout fails
   */
  async withTimeout(promise, operationName) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} exceeded ${this.config.timeout/1000}s timeout`));
      }, this.config.timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Generate story from prompt
   */
  async generateStory(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    console.log('🤖 Calling Claude API for story generation...');

    try {
      const apiCall = this.client.messages.create({
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature !== undefined ? options.temperature : this.config.temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const response = await this.withTimeout(apiCall, 'Story generation');

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Claude API response received (${duration}s)`);
      console.log(`   Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

      return {
        content: response.content[0].text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        },
        model: response.model,
        stopReason: response.stop_reason
      };
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`❌ Claude API error after ${duration}s: ${error.message}`);

      // Check for specific error types
      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        throw new Error(`Claude API timeout after ${duration}s - try reducing story length or check network connection`);
      } else if (error.status === 429) {
        throw new Error(`Claude API rate limit exceeded - please wait a moment and try again`);
      } else if (error.status === 500 || error.status === 503) {
        throw new Error(`Claude API service error (${error.status}) - please try again in a moment`);
      }

      throw new Error(`Claude API error during story generation: ${error.message}`);
    }
  }

  /**
   * Perform revision audit on generated story
   */
  async auditStory(story, revisionChecklist, options = {}) {
    const startTime = Date.now();
    console.log('🔍 Calling Claude API for audit...');

    const systemPrompt = this.buildAuditSystemPrompt(revisionChecklist);
    const userPrompt = this.buildAuditUserPrompt(story);

    try {
      const apiCall = this.client.messages.create({
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || 8000,
        temperature: 0.3, // Lower temperature for more consistent analysis
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const response = await this.withTimeout(apiCall, 'Audit');

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Audit response received (${duration}s)`);
      console.log(`   Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

      return {
        content: response.content[0].text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        },
        model: response.model
      };
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`❌ Audit API error after ${duration}s: ${error.message}`);

      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        throw new Error(`Audit timeout after ${duration}s - API call stalled`);
      }

      throw new Error(`Claude API error during story audit: ${error.message}`);
    }
  }

  /**
   * Refine story based on audit findings
   */
  async refineStory(originalStory, auditReport, options = {}) {
    const startTime = Date.now();
    console.log('🔧 Calling Claude API for refinement...');

    const systemPrompt = this.buildRefinementSystemPrompt();
    const userPrompt = this.buildRefinementUserPrompt(originalStory, auditReport);

    try {
      const apiCall = this.client.messages.create({
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || 16000,
        temperature: 0.5, // Moderate temperature for targeted fixes
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const response = await this.withTimeout(apiCall, 'Refinement');

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Refinement response received (${duration}s)`);
      console.log(`   Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

      return {
        content: response.content[0].text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        },
        model: response.model
      };
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`❌ Refinement API error after ${duration}s: ${error.message}`);

      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        throw new Error(`Refinement timeout after ${duration}s - API call stalled`);
      }

      throw new Error(`Claude API error during story refinement: ${error.message}`);
    }
  }

  /**
   * Build system prompt for story audit
   */
  buildAuditSystemPrompt(revisionChecklist) {
    return `You are a specialized literary critic focused on structural analysis of rule-based horror fiction.

Your task is to audit a generated horror story against a comprehensive revision checklist, identifying specific structural failures and providing detailed evidence.

CRITICAL FAILURE MODES TO DETECT:
1. Rule invariance violations (rules that change meaning or stop applying)
2. Object ontology failures (the "ticket problem" - objects solving problems arbitrarily)
3. Violation consequence resets (state returning to normal after violation)
4. Convenience resolutions (deus ex machina, arbitrary solutions)
5. AI confabulation (inventing solutions without setup)

For each checklist item, provide:
- Result: PASS, FAIL, or CONCERN
- Evidence: Specific text excerpts or line references
- Severity: CRITICAL, MAJOR, MODERATE, or MINOR
- Notes: Additional context or explanation

Be rigorous and specific. Use line references or direct quotes when identifying failures.

Format your response as structured markdown following this template:

# REVISION AUDIT REPORT

## Rule Logic Audit
### Rule Enumeration
- Result: [PASS/FAIL/CONCERN]
- Evidence: [specific examples]
- Severity: [if failed]
- Notes: [explanation]

[Continue for all checklist sections...]

## Summary
- Overall Score: [0-100]
- Critical Failures: [count]
- Major Failures: [count]
- Recommendation: [publish/minor_revisions/moderate_revisions/major_revisions/rewrite]

Focus on structural integrity, not stylistic preferences.`;
  }

  /**
   * Build user prompt for story audit
   */
  buildAuditUserPrompt(story) {
    return `Please audit the following horror story for structural integrity using the revision checklist framework.

STORY TO AUDIT:
${story}

Provide a detailed audit report identifying any structural failures, particularly:
- Rules that change or disappear
- Objects that solve problems without setup
- Violations that reset without cost
- Convenient or arbitrary resolutions
- Setup/payoff disconnections

Be specific with evidence and line references.`;
  }

  /**
   * Build system prompt for story refinement
   */
  buildRefinementSystemPrompt() {
    return `You are a specialized fiction editor focused on surgical revisions to rule-based horror stories.

Your task is to make MINIMAL, TARGETED fixes to address specific structural failures identified in an audit report.

PRINCIPLES:
1. Preserve as much original text as possible
2. Make surgical fixes, not wholesale rewrites
3. Address root causes, not symptoms
4. Maintain narrative voice and style
5. Fix structural issues without adding unnecessary content

CRITICAL CONSTRAINTS:
- DO NOT rewrite sections that are working
- DO NOT add new plot elements unless necessary to fix failures
- DO NOT change the story's core premise or direction
- DO focus on fixing: rule consistency, object setup, escalation logic, resolution integrity

For each change, document:
1. Original text (if modified)
2. Revised text
3. Justification (which audit issue this addresses)
4. Location (approximate line or section reference)

Provide the complete revised story, followed by a detailed change log.`;
  }

  /**
   * Build user prompt for story refinement
   */
  buildRefinementUserPrompt(originalStory, auditReport) {
    return `Please revise the following story to address the structural failures identified in the audit report.

ORIGINAL STORY:
${originalStory}

---

AUDIT REPORT:
${auditReport}

---

Provide:
1. The complete revised story
2. A detailed change log documenting each modification

Remember: Make minimal, surgical fixes. Preserve working elements. Address structural integrity issues only.`;
  }

  /**
   * Get model configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update model configuration
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
  }
}

module.exports = ClaudeClient;
