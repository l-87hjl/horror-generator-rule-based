/**
 * Story Generator Service
 * Orchestrates the complete story generation workflow
 */

const ClaudeClient = require('../api/claudeClient');
const TemplateLoader = require('../utils/templateLoader');
const RuleBuilder = require('./ruleBuilder');
const path = require('path');

class StoryGenerator {
  constructor(apiKey, config = {}) {
    this.claudeClient = new ClaudeClient(apiKey, config);
    this.templateLoader = new TemplateLoader();
    this.ruleBuilder = new RuleBuilder();
  }

  /**
   * Generate complete story with all parameters
   *
   * @param {object} parameters - Generation parameters
   * @param {object} stateManager - StateManager instance (optional, Phase 3)
   */
  async generateStory(parameters, stateManager = null) {
    // Validate parameters
    this.validateParameters(parameters);

    // Phase 3: Initialize structured rules if stateManager provided
    if (stateManager) {
      this.initializeStructuredRules(parameters, stateManager);
    }

    // Load necessary templates
    const templates = await this.loadTemplates(parameters);

    // Build generation prompts (Phase 5: Pass stateManager for state injection)
    const { systemPrompt, userPrompt } = await this.buildGenerationPrompts(parameters, templates, stateManager);

    // Generate story
    console.log('Generating story...');
    const generationResult = await this.claudeClient.generateStory(systemPrompt, userPrompt);

    return {
      story: generationResult.content,
      metadata: {
        parameters,
        templates,
        usage: generationResult.usage,
        model: generationResult.model,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Initialize structured rules using RuleBuilder (Phase 3)
   *
   * @param {object} parameters - Generation parameters
   * @param {object} stateManager - StateManager instance
   */
  initializeStructuredRules(parameters, stateManager) {
    const ruleCount = parameters.ruleCount || 7;

    console.log(`🔧 Building structured rules (${ruleCount} rules)...`);

    // Build structured rule set with theme-specific customizations
    const structuredRules = this.ruleBuilder.buildRuleSet(ruleCount, {
      thematicFocus: parameters.thematicFocus,
      location: parameters.location,
      violationResponse: parameters.violationResponse
    });

    // Set up rule dependencies (example: last rule enables terminal phase)
    if (ruleCount >= 7) {
      // Example: Rule 7 violation enables a terminal consequence
      const rule7 = structuredRules[6]; // rule_7
      rule7.consequences.permanent.push('system_instability', 'boundary_breached');
      rule7.violation_threshold = 1; // Single violation triggers end
    }

    // Replace basic rules with structured rules
    stateManager.setStructuredRules(structuredRules);

    console.log(`✅ Structured rules initialized:`);
    console.log(`   Total rules: ${structuredRules.length}`);

    const typeCount = {};
    structuredRules.forEach(rule => {
      typeCount[rule.type] = (typeCount[rule.type] || 0) + 1;
    });

    console.log(`   Type distribution:`, typeCount);
  }

  /**
   * Validate generation parameters
   */
  validateParameters(params) {
    const required = ['wordCount', 'location', 'entryCondition', 'discoveryMethod',
                     'completenessPattern', 'thematicFocus', 'escalationStyle', 'endingType'];

    for (const field of required) {
      if (!params[field]) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }

    // Validate ranges
    if (params.wordCount < 5000 || params.wordCount > 20000) {
      throw new Error('Word count must be between 5000 and 20000');
    }

    if (params.ruleCount && (params.ruleCount < 3 || params.ruleCount > 12)) {
      throw new Error('Rule count must be between 3 and 12');
    }
  }

  /**
   * Load all necessary templates based on parameters
   */
  async loadTemplates(parameters) {
    const templates = {
      entryCondition: await this.templateLoader.getInflectionPoint('entry', parameters.entryCondition),
      discoveryMethod: await this.templateLoader.getInflectionPoint('discovery', parameters.discoveryMethod),
      completenessPattern: await this.templateLoader.getInflectionPoint('completeness', parameters.completenessPattern),
      violationResponse: await this.templateLoader.getInflectionPoint('violation', parameters.violationResponse),
      exitCondition: await this.templateLoader.getInflectionPoint('exit', parameters.endingType),
      location: await this.templateLoader.getLocation(parameters.location),
      theme: await this.templateLoader.getTheme(parameters.thematicFocus),
      ruleGrammar: await this.templateLoader.loadRuleGrammar()
    };

    // Load interaction patterns if specified
    if (parameters.interactionPatterns && parameters.interactionPatterns.length > 0) {
      templates.interactions = [];
      for (const pattern of parameters.interactionPatterns) {
        const interaction = await this.templateLoader.getInflectionPoint('interaction', pattern);
        templates.interactions.push(interaction);
      }
    }

    return templates;
  }

  /**
   * Build state constraints section for system prompt (Phase 5)
   * Injects specific state constraints to prevent violations during generation
   *
   * @param {object} state - Session state from StateManager
   * @returns {string} Formatted state constraints section
   */
  buildStateConstraintsSection(state) {
    if (!state || !state.canonical_state) {
      return ''; // No state yet (first generation)
    }

    const canonicalState = state.canonical_state;
    const constraints = [];

    constraints.push('# MANDATORY STATE CONSTRAINTS - DO NOT VIOLATE');
    constraints.push('');
    constraints.push('The following represent the CURRENT STATE of the story world.');
    constraints.push('You MUST respect all constraints below. Violations will be rejected.');
    constraints.push('');

    // Active rules section
    const activeRules = canonicalState.rules.filter(r => r.text && r.active);
    if (activeRules.length > 0) {
      constraints.push('## Active Rules in Story:');
      constraints.push('');
      activeRules.forEach(rule => {
        const status = rule.violated ? '❌ VIOLATED' : '✅ Active';
        constraints.push(`- ${rule.text} [${status}]`);
        if (rule.violated) {
          constraints.push(`  * Violation Count: ${rule.violation_count}/${rule.violation_threshold}`);
          constraints.push(`  * YOU MAY NOT show this rule as unbroken or compliance as intact`);
        }
      });
      constraints.push('');
    }

    // Consequences already applied
    const violations = canonicalState.rules.filter(r => r.violated);
    if (violations.length > 0) {
      constraints.push('## Rule Consequences Already Applied:');
      constraints.push('');
      constraints.push('These effects are PERMANENT and CANNOT be reversed:');
      constraints.push('');
      violations.forEach(rule => {
        if (rule.consequences.immediate && rule.consequences.immediate.length > 0) {
          rule.consequences.immediate.forEach(consequence => {
            constraints.push(`- ${consequence} (from ${rule.rule_id} violation)`);
          });
        }
        if (rule.consequences.permanent && rule.consequences.permanent.length > 0) {
          rule.consequences.permanent.forEach(consequence => {
            constraints.push(`- ${consequence} (from ${rule.rule_id} violation)`);
          });
        }
      });
      constraints.push('');
    }

    // Entity capabilities
    const capabilities = Object.keys(canonicalState.entity_capabilities);
    if (capabilities.length > 0) {
      constraints.push('## Entity Current Capabilities:');
      constraints.push('');
      constraints.push('The entity has GAINED these abilities and MUST demonstrate them:');
      constraints.push('');
      Object.entries(canonicalState.entity_capabilities).forEach(([capability, value]) => {
        const status = value ? '✅ CAN' : '❌ CANNOT';
        const capabilityDisplay = capability.replace(/_/g, ' ');
        constraints.push(`- ${status} ${capabilityDisplay}`);
      });
      constraints.push('');
      constraints.push('YOU MAY NOT show the entity lacking abilities it has gained.');
      constraints.push('');
    }

    // Irreversible flags
    const flagsSet = Object.entries(canonicalState.irreversible_flags).filter(
      ([key, value]) => {
        if (key === 'violations') return false; // Skip violations array
        return value === true || value === false || (typeof value === 'number' && value > 0);
      }
    );

    if (flagsSet.length > 0) {
      constraints.push('## Irreversible Events/States:');
      constraints.push('');
      flagsSet.forEach(([flag, value]) => {
        const flagDisplay = flag.replace(/_/g, ' ');
        if (typeof value === 'boolean') {
          constraints.push(`- ${flagDisplay}: ${value ? 'TRUE' : 'FALSE'} (cannot be reversed)`);
        } else {
          constraints.push(`- ${flagDisplay}: ${value}`);
        }
      });
      constraints.push('');
    }

    // Timeline commitments
    if (canonicalState.world_facts.timeline_commitments &&
        canonicalState.world_facts.timeline_commitments.length > 0) {
      constraints.push('## Timeline Commitments:');
      constraints.push('');
      constraints.push('These events have ALREADY occurred and cannot be contradicted:');
      constraints.push('');
      canonicalState.world_facts.timeline_commitments.forEach(tc => {
        const commitment = typeof tc === 'string' ? tc : tc.commitment;
        constraints.push(`- ${commitment}`);
      });
      constraints.push('');
    }

    // Explicit prohibitions based on state
    constraints.push('## EXPLICIT PROHIBITIONS Based on Current State:');
    constraints.push('');
    constraints.push('YOU MAY NOT:');

    if (violations.length > 0) {
      constraints.push(`- Show violated rules (${violations.map(r => r.rule_id).join(', ')}) as unbroken`);
      constraints.push('- Reset any violation status or count');
    }

    if (capabilities.length > 0) {
      constraints.push('- Remove or ignore entity capabilities already gained');
      constraints.push('- Show entity without abilities it has acquired');
    }

    if (flagsSet.length > 0) {
      constraints.push('- Reverse any irreversible flags or states');
    }

    if (canonicalState.world_facts.timeline_commitments &&
        canonicalState.world_facts.timeline_commitments.length > 0) {
      constraints.push('- Contradict established timeline commitments');
    }

    constraints.push('- Introduce new entity behaviors without state support');
    constraints.push('- Restore normalcy or safety that has been compromised');
    constraints.push('');

    constraints.push('Remember: The state above is CANON. Deviations will be detected and rejected.');

    return constraints.join('\n');
  }

  /**
   * Build system and user prompts for story generation
   *
   * @param {object} parameters - Generation parameters
   * @param {object} templates - Loaded templates
   * @param {object} stateManager - StateManager instance (optional, Phase 5)
   */
  async buildGenerationPrompts(parameters, templates, stateManager = null) {
    // Get current state for constraint injection (Phase 5)
    const sessionState = stateManager ? stateManager.getState() : null;

    const systemPrompt = this.buildSystemPrompt(templates, sessionState);
    const userPrompt = this.buildUserPrompt(parameters, templates);

    return { systemPrompt, userPrompt };
  }

  /**
   * Build comprehensive system prompt
   *
   * @param {object} templates - Loaded templates
   * @param {object} sessionState - Current session state (optional, Phase 5)
   */
  buildSystemPrompt(templates, sessionState = null) {
    let prompt = `You are a specialized horror fiction writer creating rule-based horror stories with rigorous structural discipline.

# CORE PRINCIPLES

Your story must embody these non-negotiable principles:

## Rule Logic
- Rules behave as LAWS, not suggestions
- Rules remain INVARIANT from introduction to resolution
- Rule meaning does NOT change mid-story
- Rules that are established REMAIN BINDING throughout

## Object Ontology
- Important objects have SINGLE, STABLE roles
- Objects are either SYMBOLIC or OPERATIVE, never arbitrarily both
- Object powers must be ESTABLISHED before they solve problems
- NO "ticket problem" - objects cannot arbitrarily undo consequences

## Escalation Integrity
- Violations must ESCALATE, TRANSFORM, or CONTAMINATE
- State NEVER resets after violation
- Consequences COMPOUND, they don't replace previous consequences
- NO return to normalcy without permanent cost

## Ritual Integrity
Your story requires:
1. WARNING/MISALIGNMENT (procedural wrongness before binding)
2. MEANINGFUL CHARACTER CHOICE (narrator acts with agency)
3. PERSISTENT COST (something permanently altered after resolution)

## Resolution Discipline
- Endings resolve through COST/TRANSFORMATION, not convenience
- NO deus ex machina or escape hatches
- NO arbitrary solutions without setup
- Something must be PERMANENTLY lost or changed

# FORBIDDEN MOVES

You must NEVER:
- Allow rules to change meaning or stop mattering
- Let objects solve problems they weren't established to solve
- Reset state after rule violations
- Restore normalcy without cost
- Use ambiguity to hide incoherent logic
- Provide convenient resolutions
- Create arbitrary solutions without setup`;

    // Phase 5: Inject state constraints if available
    if (sessionState) {
      const stateConstraints = this.buildStateConstraintsSection(sessionState);
      if (stateConstraints) {
        prompt += `\n\n---\n\n${stateConstraints}\n\n---`;
      }
    }

    prompt += `\n\n# NARRATIVE REQUIREMENTS

- Target word count must be met (±10%)
- Rules must be enumerable by reader
- Escalation must be trackable
- Theme must be enacted through structure, not just described
- Every significant object's role must be clear
- Narrator's choices must matter to outcome

Write structurally sound rule-based horror, not free-form creative fiction. The system is the story.`;

    return prompt;
  }

  /**
   * Build detailed user prompt with all parameters
   */
  buildUserPrompt(parameters, templates) {
    const {
      wordCount,
      ruleCount = 7,
      location,
      entryCondition,
      discoveryMethod,
      completenessPattern,
      violationResponse,
      endingType,
      thematicFocus,
      escalationStyle,
      customLocation,
      ambiguityLevel = 'moderate'
    } = parameters;

    let prompt = `Generate a rule-based horror story with the following specifications:

# STORY PARAMETERS

**Target Length**: ${wordCount} words (±10% acceptable)
**Rule Count**: ${ruleCount} primary rules

# LOCATION
${customLocation ? `Custom Location: ${customLocation}` : `Location Type: ${location}`}
${templates.location ? `
Setting Characteristics:
- Category: ${templates.location.category}
- Isolation Level: ${templates.location.isolation_level}
- Infrastructure: ${templates.location.infrastructure}
- Natural Rhythms: ${templates.location.natural_rhythms ? templates.location.natural_rhythms.join(', ') : 'N/A'}
` : ''}

# INFLECTION POINTS

## Entry Condition: ${entryCondition}
${this.formatTemplateSection(templates.entryCondition)}

## Rule Discovery Method: ${discoveryMethod}
${this.formatTemplateSection(templates.discoveryMethod)}

## Rule Completeness Pattern: ${completenessPattern}
${this.formatTemplateSection(templates.completenessPattern)}

## Violation Response Model: ${violationResponse}
${this.formatTemplateSection(templates.violationResponse)}

## Exit Condition: ${endingType}
${this.formatTemplateSection(templates.exitCondition)}

# THEMATIC FOCUS: ${thematicFocus}
${this.formatTemplateSection(templates.theme)}

# ADDITIONAL REQUIREMENTS

**Escalation Style**: ${escalationStyle}
**Ambiguity Level**: ${ambiguityLevel}
${ambiguityLevel !== 'minimal' ? '(Remember: Ambiguity must CONCEAL structure, not REPLACE it)' : ''}

${templates.interactions && templates.interactions.length > 0 ? `
**Rule Interaction Patterns**:
${templates.interactions.map((int, i) => `${i + 1}. ${int.description}`).join('\n')}
` : ''}

# RULE GRAMMAR GUIDELINES

Follow these patterns when constructing your rule system:
${this.formatRuleGrammarGuidance(templates.ruleGrammar)}

# CRITICAL REMINDERS

1. Establish ALL rules clearly - reader must be able to enumerate them
2. Set up object powers BEFORE they're needed
3. Every violation must have LASTING consequences
4. NO state resets, NO arbitrary solutions
5. Theme must be enacted through rules, not just described
6. Ending must involve permanent cost or transformation

# OUTPUT FORMAT

Provide ONLY the story text. No preamble, no meta-commentary, no section labels (unless they're part of the story itself, like "Employee Handbook" or "Rules for Night Shift").

Begin the story now.`;

    return prompt;
  }

  /**
   * Format template section for inclusion in prompt
   */
  formatTemplateSection(template) {
    if (!template) return '';

    let output = '';

    if (template.description) {
      output += `Description: ${template.description}\n`;
    }

    if (template.characteristics) {
      output += `Characteristics:\n${template.characteristics.map(c => `- ${c}`).join('\n')}\n`;
    }

    if (template.narrative_requirements) {
      output += `Requirements:\n${template.narrative_requirements.map(r => `- ${r}`).join('\n')}\n`;
    }

    if (template.mechanical_requirements) {
      output += `Mechanical Requirements:\n${template.mechanical_requirements.map(r => `- ${r}`).join('\n')}\n`;
    }

    if (template.implementation_requirements) {
      output += `Implementation:\n${template.implementation_requirements.map(r => `- ${r}`).join('\n')}\n`;
    }

    if (template.rule_system_mappings) {
      output += `Rule System Integration:\n${template.rule_system_mappings.map(r => `- ${r}`).join('\n')}\n`;
    }

    return output;
  }

  /**
   * Format rule grammar guidance
   */
  formatRuleGrammarGuidance(ruleGrammar) {
    if (!ruleGrammar || !ruleGrammar.rule_construction_patterns) return '';

    const patterns = ruleGrammar.rule_construction_patterns;
    let output = '';

    // Include a few key patterns
    const keyPatterns = ['conditional_rule', 'prohibition_rule', 'obligation_rule', 'boundary_rule'];

    for (const patternKey of keyPatterns) {
      const pattern = patterns[patternKey];
      if (pattern) {
        output += `\n**${pattern.description}**\n`;
        output += `Structure: ${pattern.structure}\n`;
        if (pattern.examples && pattern.examples.length > 0) {
          output += `Example: "${pattern.examples[0]}"\n`;
        }
      }
    }

    return output;
  }

  /**
   * Generate a single story chunk (Phase 2: Checkpoint Protocol)
   *
   * @param {object} chunkPrompt - Chunk generation parameters
   * @param {object} currentState - Current state from StateManager
   * @param {number} sceneNumber - Current scene number
   * @returns {object} Generated chunk with prose and metadata
   */
  async generateStoryChunk(chunkPrompt, currentState, sceneNumber) {
    const {
      isFirstChunk,
      isFinalChunk,
      targetWords,
      previousProse,
      continuationInstructions,
      finalChunkInstructions
    } = chunkPrompt;

    console.log(`\n🎬 Generating Scene ${sceneNumber}...`);
    console.log(`   Target: ${targetWords} words`);
    console.log(`   Type: ${isFirstChunk ? 'FIRST' : isFinalChunk ? 'FINAL' : 'CONTINUATION'}`);

    // Load templates if this is the first chunk
    let templates = {};
    if (isFirstChunk) {
      templates = await this.loadTemplates(chunkPrompt);
    }

    // Build chunk-specific system prompt
    const systemPrompt = this.buildChunkSystemPrompt(
      templates,
      currentState,
      isFirstChunk,
      isFinalChunk,
      continuationInstructions
    );

    // Build chunk-specific user prompt
    const userPrompt = this.buildChunkUserPrompt(
      chunkPrompt,
      templates,
      targetWords,
      sceneNumber,
      isFirstChunk,
      isFinalChunk,
      previousProse,
      finalChunkInstructions
    );

    // Calculate max_tokens based on target word count
    // Formula: targetWords * 1.3 (tokens per word) * 1.2 (buffer) = ~1.56x
    const maxTokens = Math.ceil(targetWords * 1.6);
    console.log(`   Max tokens: ${maxTokens}`);

    // Generate chunk with calculated max_tokens
    const generationResult = await this.claudeClient.generateStory(systemPrompt, userPrompt, {
      maxTokens
    });

    return {
      prose: generationResult.content,
      wordCount: this.countWords(generationResult.content),
      usage: generationResult.usage,
      model: generationResult.model,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build system prompt for chunk generation
   *
   * @param {object} templates - Loaded templates (first chunk only)
   * @param {object} currentState - Current session state
   * @param {boolean} isFirstChunk - Is this the first chunk?
   * @param {boolean} isFinalChunk - Is this the final chunk?
   * @param {string} continuationInstructions - Continuation instructions
   * @returns {string} System prompt
   */
  buildChunkSystemPrompt(templates, currentState, isFirstChunk, isFinalChunk, continuationInstructions) {
    let prompt = '';

    if (isFirstChunk) {
      // Use full system prompt for first chunk
      prompt = this.buildSystemPrompt(templates, currentState);
    } else {
      // Abbreviated system prompt for continuation chunks
      prompt = `You are a specialized horror fiction writer continuing a rule-based horror story with rigorous structural discipline.

# CORE PRINCIPLES

Your continuation must embody these non-negotiable principles:

## Rule Logic
- Rules behave as LAWS, not suggestions
- Rules remain INVARIANT throughout the story
- Rule violations have LASTING consequences

## Escalation Integrity
- Violations must ESCALATE, TRANSFORM, or CONTAMINATE
- State NEVER resets after violation
- Consequences COMPOUND, they don't replace previous consequences

## CONTINUATION REQUIREMENTS
${continuationInstructions}

# FORBIDDEN MOVES

You must NEVER:
- Reset state after rule violations
- Contradict established facts
- Ignore previously established entity capabilities
- Restore normalcy without cost
- Recap or summarize previous events`;

      // Add state constraints
      if (currentState) {
        const stateConstraints = this.buildStateConstraintsSection(currentState);
        if (stateConstraints) {
          prompt += `\n\n---\n\n${stateConstraints}\n\n---`;
        }
      }

      prompt += `\n\nContinue the story seamlessly from where it left off. Do NOT recap. Pick up exactly where the previous chunk ended.`;
    }

    if (isFinalChunk) {
      prompt += `\n\n# FINAL CHUNK INSTRUCTIONS

This is the FINAL chunk of the story. You must:
- Bring the narrative to a complete resolution
- Apply the established exit condition
- Show permanent cost or transformation
- Provide a definitive ending (no cliffhangers)
- Respect all established state constraints`;
    }

    return prompt;
  }

  /**
   * Build user prompt for chunk generation
   *
   * @param {object} chunkPrompt - Chunk parameters
   * @param {object} templates - Loaded templates
   * @param {number} targetWords - Target word count
   * @param {number} sceneNumber - Scene number
   * @param {boolean} isFirstChunk - Is first chunk?
   * @param {boolean} isFinalChunk - Is final chunk?
   * @param {string} previousProse - Previous chunk prose
   * @param {string} finalChunkInstructions - Final chunk instructions
   * @returns {string} User prompt
   */
  buildChunkUserPrompt(chunkPrompt, templates, targetWords, sceneNumber, isFirstChunk, isFinalChunk, previousProse, finalChunkInstructions) {
    if (isFirstChunk) {
      // Build first chunk prompt with chunk-specific word count
      // Override wordCount with targetWords for chunked generation
      const firstChunkParams = {
        ...chunkPrompt,
        wordCount: targetWords  // Use chunk target, not full story target
      };

      // Get base prompt and add chunk-specific instructions
      let basePrompt = this.buildUserPrompt(firstChunkParams, templates);

      // Add strong word count enforcement and chunked generation instructions
      const chunkInstructions = `
# CRITICAL: CHUNK GENERATION MODE

**THIS IS CHUNK 1 of a MULTI-CHUNK STORY**

## MANDATORY WORD COUNT
**YOU MUST WRITE EXACTLY ${targetWords} WORDS** (±5% tolerance: ${Math.floor(targetWords * 0.95)}-${Math.ceil(targetWords * 1.05)} words)

## CHUNKED GENERATION RULES
- Write ONLY ${targetWords} words in this chunk
- DO NOT conclude the story - more chunks will follow
- Stop at a natural narrative break point (scene change, tension peak, chapter end)
- Leave narrative threads open for continuation
- Establish rules and setting, but DO NOT resolve the main conflict yet

Generate exactly ${targetWords} words of the story opening now.`;

      return basePrompt + chunkInstructions;
    }

    // Extract story context if available
    const storyContext = chunkPrompt.storyContext;

    // Build story context constraints section
    let contextConstraints = '';
    if (storyContext) {
      contextConstraints = `
# HARD CONSTRAINTS FROM PREVIOUS CHUNKS (DO NOT VIOLATE)

## Setting (IMMUTABLE)
- Location: ${storyContext.setting?.location || 'as established'}
- Time: ${storyContext.setting?.timeOfDay || 'as established'}
- Atmosphere: ${storyContext.setting?.atmosphere || 'horror'}

## Protagonist (IMMUTABLE)
- Name: ${storyContext.protagonist?.name || 'as established'}
- Role: ${storyContext.protagonist?.role || 'as established'}
- Current knowledge: ${storyContext.protagonist?.knowledge || 'as established'}

## Rules Established (MUST REMAIN INVARIANT)
${storyContext.rules?.length > 0
  ? storyContext.rules.map((r, i) => `${i + 1}. ${r.text}${r.consequence ? ` → Consequence: ${r.consequence}` : ''}`).join('\n')
  : '(Use rules from previous prose)'}

## Entities Introduced (CAPABILITIES ARE FIXED)
${storyContext.entities?.length > 0
  ? storyContext.entities.map(e => `- ${e.name}: Can ${e.capabilities?.join(', ') || 'as established'}`).join('\n')
  : '(Use entities from previous prose)'}

## Current State Flags
${storyContext.stateFlags ? Object.entries(storyContext.stateFlags).filter(([k, v]) => v).map(([k, v]) => `- ${k}: YES`).join('\n') : '(Continue from established state)'}

**CRITICAL: You MUST NOT contradict any of the above. These are HARD CONSTRAINTS.**

`;
    }

    // Continuation chunk prompt with strong word count enforcement
    let prompt = `Continue the rule-based horror story.

# MANDATORY WORD COUNT

**YOU MUST WRITE EXACTLY ${targetWords} WORDS** (±5% tolerance: ${Math.floor(targetWords * 0.95)}-${Math.ceil(targetWords * 1.05)} words)

This is NON-NEGOTIABLE. Generate the full ${targetWords} words before stopping.
${contextConstraints}
# CHUNK PARAMETERS

**Scene Number**: ${sceneNumber}
**Chunk Type**: ${isFinalChunk ? 'FINAL CHUNK - bring story to conclusion' : 'CONTINUATION - story continues after this chunk'}

# PREVIOUS PROSE ENDING

The story currently ends with:

---
${this.getLastParagraphs(previousProse, 3)}
---

# CONTINUATION INSTRUCTIONS

- Pick up EXACTLY where the previous chunk left off
- Write ${targetWords} words of new prose
- Do NOT recap or summarize what happened before
- Do NOT restart the narrative
- Maintain seamless flow and continuity
- Continue developing tension and escalation
- RESPECT ALL HARD CONSTRAINTS from previous chunks
${isFinalChunk ? '' : '- DO NOT conclude the story - more chunks will follow'}

${isFinalChunk ? `\n# FINAL CHUNK INSTRUCTIONS\n${finalChunkInstructions}\nBring the story to a satisfying conclusion within this chunk.\n` : ''}

# OUTPUT FORMAT

Write EXACTLY ${targetWords} words of continuation prose.
No preamble, no meta-commentary, no word count verification.
Start writing the continuation now.`;

    return prompt;
  }

  /**
   * Get last N paragraphs from prose
   *
   * @param {string} prose - Full prose text
   * @param {number} count - Number of paragraphs
   * @returns {string} Last N paragraphs
   */
  getLastParagraphs(prose, count = 3) {
    if (!prose) return '';

    const paragraphs = prose.split('\n\n').filter(p => p.trim().length > 0);
    const lastParagraphs = paragraphs.slice(-count);
    return lastParagraphs.join('\n\n');
  }

  /**
   * Count words in text
   *
   * @param {string} text - Text to count
   * @returns {number} Word count
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
  }

  /**
   * Get template loader instance
   */
  getTemplateLoader() {
    return this.templateLoader;
  }

  /**
   * Get Claude client instance
   */
  getClaudeClient() {
    return this.claudeClient;
  }
}

module.exports = StoryGenerator;
