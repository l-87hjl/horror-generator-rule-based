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

    // Build generation prompts
    const { systemPrompt, userPrompt } = await this.buildGenerationPrompts(parameters, templates);

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
   * Build system and user prompts for story generation
   */
  async buildGenerationPrompts(parameters, templates) {
    const systemPrompt = this.buildSystemPrompt(templates);
    const userPrompt = this.buildUserPrompt(parameters, templates);

    return { systemPrompt, userPrompt };
  }

  /**
   * Build comprehensive system prompt
   */
  buildSystemPrompt(templates) {
    return `You are a specialized horror fiction writer creating rule-based horror stories with rigorous structural discipline.

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
- Create arbitrary solutions without setup

# NARRATIVE REQUIREMENTS

- Target word count must be met (±10%)
- Rules must be enumerable by reader
- Escalation must be trackable
- Theme must be enacted through structure, not just described
- Every significant object's role must be clear
- Narrator's choices must matter to outcome

Write structurally sound rule-based horror, not free-form creative fiction. The system is the story.`;
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
