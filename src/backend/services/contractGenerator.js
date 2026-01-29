/**
 * Contract Generator Service
 * Stage 1 of the 3-stage workflow
 *
 * Generates a story_contract.json from user input
 * This contract locks identity, scope, and rules before any prose is generated
 */

const { v4: uuidv4 } = require('uuid');

class ContractGenerator {
  constructor(claudeClient, templateLoader) {
    this.claudeClient = claudeClient;
    this.templateLoader = templateLoader;
  }

  /**
   * Generate a story contract from user input
   * @param {Object} userInput - User's form selections
   * @returns {Object} - The story contract
   */
  async generateContract(userInput) {
    console.log('📜 Generating story contract...');

    // Handle location based on locationMode
    let locationDetails = null;
    let locationName = null;
    const locationMode = userInput.locationMode || 'engine_selects';

    if (locationMode === 'specific' && userInput.location) {
      // User selected a specific location from the list
      locationDetails = await this.templateLoader.getLocation(userInput.location);
      locationName = locationDetails?.name || userInput.location;
    } else if (locationMode === 'custom' && userInput.customLocation) {
      // User typed in a custom location
      locationName = userInput.customLocation;
    } else if (locationMode === 'novel') {
      // AI should select an unconventional location (not typically associated with horror)
      locationName = 'AI_SELECT_NOVEL_LOCATION';
    } else {
      // engine_selects: AI can select from list or create new
      locationName = 'AI_SELECT_LOCATION';
    }

    // Load inflection point details
    // Note: getInflectionPoint uses short type names: 'entry', 'discovery', 'completeness', 'violation', 'exit'
    const entryCondition = userInput.entryCondition
      ? await this.templateLoader.getInflectionPoint('entry', userInput.entryCondition)
      : null;

    const discoveryMethod = userInput.discoveryMethod
      ? await this.templateLoader.getInflectionPoint('discovery', userInput.discoveryMethod)
      : null;

    const completenessPattern = userInput.completenessPattern
      ? await this.templateLoader.getInflectionPoint('completeness', userInput.completenessPattern)
      : null;

    const violationResponse = userInput.violationResponse
      ? await this.templateLoader.getInflectionPoint('violation', userInput.violationResponse)
      : null;

    const exitCondition = userInput.endingType
      ? await this.templateLoader.getInflectionPoint('exit', userInput.endingType)
      : null;

    // Generate rules using Claude
    const rules = await this.generateRules(userInput, locationDetails);

    // Handle thematic focus based on thematicMode
    const thematicMode = userInput.thematicMode || 'engine_selects';
    let primaryTheme = userInput.thematicFocus;
    if (thematicMode === 'engine_selects' || !primaryTheme) {
      primaryTheme = 'AI_SELECT_THEME';
    }

    // Handle escalation style based on escalationMode
    const escalationMode = userInput.escalationMode || 'mixed';
    let escalationStyle = userInput.escalationStyle;
    if (escalationMode === 'mixed') {
      escalationStyle = 'AI_SELECT_MIXED';
    } else if (escalationMode === 'single') {
      escalationStyle = 'AI_SELECT_SINGLE';
    } else if (!escalationStyle) {
      escalationStyle = 'psychological';
    }

    // Build the contract
    const contract = {
      version: '1.0',
      created_at: new Date().toISOString(),
      session_id: `session-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${uuidv4().slice(0, 8)}`,

      // Section 1: Identity Anchors
      identity_anchors: {
        setting: {
          location_id: userInput.location || locationMode,
          location_name: locationName || 'Unknown Location',
          location_mode: locationMode,
          time_period: 'contemporary',
          atmosphere_keywords: locationDetails?.atmosphere || ['isolated', 'oppressive', 'wrong'],
          physical_boundaries: locationDetails?.boundaries || 'The location itself'
        },
        protagonist: {
          name: null, // Unnamed narrator by default
          role: this.inferProtagonistRole(userInput, locationDetails),
          knowledge_level: this.inferKnowledgeLevel(discoveryMethod),
          starting_state: 'Arriving at location, unaware of the rules',
          primary_motivation: this.inferMotivation(entryCondition)
        },
        point_of_view: {
          pov_type: 'first_person',
          tense: 'past',
          narrator_reliability: 'reliable'
        }
      },

      // Section 2: Rule System
      rule_system: {
        rule_count: userInput.ruleCount || 5,
        rule_discovery_method: userInput.discoveryMethod || 'gradual_revelation',
        rule_completeness: userInput.completenessPattern || 'complete_but_seemingly_arbitrary',
        violation_response_type: userInput.violationResponse || 'escalating_consequences',
        rules: rules
      },

      // Section 3: Scope Constraints
      scope_constraints: {
        forbidden_expansions: [
          'new_protagonists',
          'new_locations',
          'new_mythologies',
          'genre_shift',
          'timeline_jumps'
        ],
        maximum_scope: {
          max_timespan: this.inferTimespan(userInput.wordCount),
          max_characters: this.inferCharacterCount(userInput.wordCount),
          max_subplots: 0
        },
        termination_rules: this.inferTerminationRules(exitCondition, violationResponse)
      },

      // Section 4: Ending Contract
      ending_contract: {
        ending_type: userInput.endingType || 'conditional_exit',
        acceptable_outcomes: this.inferAcceptableOutcomes(exitCondition, violationResponse),
        required_permanence: [
          "protagonist's knowledge/innocence",
          "protagonist's relationship to the rules"
        ]
      },

      // Section 5: Thematic Contract
      thematic_contract: {
        primary_theme: primaryTheme,
        thematic_mode: thematicMode,
        theme_enactment: this.inferThemeEnactment(primaryTheme),
        escalation_style: escalationStyle,
        escalation_mode: escalationMode,
        ambiguity_level: userInput.ambiguityLevel || 'moderate'
      },

      // Section 6: Generation Parameters
      generation_parameters: {
        target_word_count: userInput.wordCount,
        chunk_size: 2000,
        chunk_count_estimate: Math.ceil(userInput.wordCount / 2000),
        skip_audit: userInput.skipAudit || false,
        skip_refinement: userInput.skipRefinement || false
      },

      // Contract validation result
      contract_audit: {
        is_valid: true,
        validation_errors: [],
        warnings: []
      }
    };

    // Validate the contract
    const validation = this.validateContract(contract);
    contract.contract_audit = validation;

    console.log(`✅ Contract generated: ${contract.session_id}`);
    console.log(`   Rules: ${contract.rule_system.rules.length}`);
    console.log(`   Target words: ${contract.generation_parameters.target_word_count}`);
    console.log(`   Estimated chunks: ${contract.generation_parameters.chunk_count_estimate}`);

    return contract;
  }

  /**
   * Generate rules using Claude API
   */
  async generateRules(userInput, locationDetails) {
    const ruleCount = userInput.ruleCount || 5;

    // Determine location description for rule generation
    let locationForPrompt = locationDetails?.name || userInput.customLocation || 'An isolated location';
    let locationDescription = locationDetails?.description || 'A place where strange rules apply';

    const locationMode = userInput.locationMode || 'engine_selects';
    if (locationMode === 'engine_selects') {
      locationForPrompt = 'An isolated, liminal location of your choosing (e.g., highway rest stop, night shift workplace, abandoned building)';
      locationDescription = 'Select an appropriate location that enhances the horror atmosphere';
    } else if (locationMode === 'novel') {
      locationForPrompt = 'An unconventional location not typically associated with horror (e.g., a cheerful daycare, a busy shopping mall, a sunny beach resort)';
      locationDescription = 'Select a location that creates horror through contrast with its normally positive associations';
    }

    // Determine thematic focus for rule generation
    let thematicForPrompt = userInput.thematicFocus || 'dread of incomprehensible systems';
    const thematicMode = userInput.thematicMode || 'engine_selects';
    if (thematicMode === 'engine_selects' || !userInput.thematicFocus) {
      thematicForPrompt = 'Select an appropriate thematic focus (dread of incomprehensible systems, complicity, identity erosion, institutional horror, contamination, or cosmic insignificance)';
    }

    const prompt = `Generate exactly ${ruleCount} rules for a rule-based horror story.

Location: ${locationForPrompt}
Location description: ${locationDescription}
Thematic focus: ${thematicForPrompt}
Violation response type: ${userInput.violationResponse || 'escalating consequences'}

Rules must:
1. Be specific and unambiguous (can be followed literally)
2. Have clear trigger conditions
3. Have specific consequences when violated
4. Create tension through the need to remember and follow them
5. Interact with each other in interesting ways

Generate the rules as a JSON array with this structure:
[
  {
    "rule_number": 1,
    "rule_text": "The exact text of the rule as it would appear in the story",
    "rule_type": "prohibition|obligation|conditional|boundary|sequence|timing",
    "trigger_condition": "What activates/applies this rule",
    "consequence_on_violation": "Specific consequence when broken",
    "is_hidden": false,
    "related_rules": []
  }
]

Return ONLY the JSON array, no other text.`;

    try {
      const response = await this.claudeClient.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;

      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const rules = JSON.parse(jsonMatch[0]);
        return rules.slice(0, ruleCount); // Ensure we don't exceed requested count
      }
    } catch (error) {
      console.warn('⚠️ Rule generation via API failed, using fallback:', error.message);
    }

    // Fallback: Generate simple rules
    return this.generateFallbackRules(ruleCount, locationDetails);
  }

  /**
   * Generate fallback rules without API
   */
  generateFallbackRules(count, locationDetails) {
    const templates = [
      {
        rule_text: "Never look directly at {entity} after midnight",
        rule_type: "prohibition",
        trigger_condition: "Time passes midnight",
        consequence_on_violation: "The {entity} becomes aware of you"
      },
      {
        rule_text: "Always acknowledge {entity} when entering a room",
        rule_type: "obligation",
        trigger_condition: "Entering any room",
        consequence_on_violation: "Your presence becomes unwelcome"
      },
      {
        rule_text: "If you hear {sound}, remain completely still",
        rule_type: "conditional",
        trigger_condition: "Hearing the specified sound",
        consequence_on_violation: "Movement attracts attention"
      },
      {
        rule_text: "Never cross the {boundary} after sunset",
        rule_type: "boundary",
        trigger_condition: "Approaching the boundary at night",
        consequence_on_violation: "Something follows you back"
      },
      {
        rule_text: "Complete {action_A} before {action_B}",
        rule_type: "sequence",
        trigger_condition: "Needing to perform these actions",
        consequence_on_violation: "The second action fails catastrophically"
      },
      {
        rule_text: "Count to {number} whenever {event} occurs",
        rule_type: "timing",
        trigger_condition: "The specified event happening",
        consequence_on_violation: "You lose track of something important"
      },
      {
        rule_text: "Never speak {word} aloud within these walls",
        rule_type: "prohibition",
        trigger_condition: "Being inside the location",
        consequence_on_violation: "The walls remember"
      }
    ];

    const rules = [];
    for (let i = 0; i < count && i < templates.length; i++) {
      rules.push({
        rule_number: i + 1,
        rule_text: templates[i].rule_text
          .replace('{entity}', 'them')
          .replace('{sound}', 'scratching')
          .replace('{boundary}', 'the marked line')
          .replace('{action_A}', 'the first ritual')
          .replace('{action_B}', 'the second ritual')
          .replace('{number}', '7')
          .replace('{event}', 'the lights flicker')
          .replace('{word}', 'their name'),
        rule_type: templates[i].rule_type,
        trigger_condition: templates[i].trigger_condition,
        consequence_on_violation: templates[i].consequence_on_violation,
        is_hidden: i >= Math.floor(count * 0.7), // Last 30% are hidden
        related_rules: []
      });
    }

    return rules;
  }

  /**
   * Infer protagonist role from context
   */
  inferProtagonistRole(userInput, locationDetails) {
    const roleMap = {
      'employment': 'New employee starting their first shift',
      'inheritance': 'Inheritor of the property, arriving to claim it',
      'accident': 'Stranded traveler seeking shelter',
      'research': 'Researcher investigating the location',
      'invitation': 'Invited guest, unsure why they were summoned',
      'proxy': 'Standing in for someone who couldn\'t come',
      'desperation': 'Someone with no other options'
    };

    return roleMap[userInput.entryCondition] ||
           locationDetails?.default_role ||
           'Someone who has arrived at this place';
  }

  /**
   * Infer knowledge level from discovery method
   */
  inferKnowledgeLevel(discoveryMethod) {
    const knowledgeMap = {
      'immediate_revelation': 'informed',
      'gradual_discovery': 'naive',
      'oral_tradition': 'naive',
      'written_documentation': 'informed',
      'experiential_learning': 'naive',
      'inherited_knowledge': 'informed',
      'explicit_list': 'informed',
      'explicit_list_unspecified': 'informed',
      'explicit_list_laminated': 'informed'
    };

    return knowledgeMap[discoveryMethod?.id] || 'naive';
  }

  /**
   * Infer motivation from entry condition
   */
  inferMotivation(entryCondition) {
    const motivationMap = {
      'employment': 'Financial necessity, need for the job',
      'inheritance': 'Curiosity about family history, potential gain',
      'accident': 'Survival, finding help',
      'research': 'Academic pursuit, uncovering truth',
      'invitation': 'Social obligation, curiosity',
      'proxy': 'Duty to the person they\'re replacing',
      'desperation': 'Escape from worse circumstances'
    };

    return motivationMap[entryCondition?.id] || 'Understanding what is happening';
  }

  /**
   * Infer timespan from word count
   */
  inferTimespan(wordCount) {
    if (wordCount <= 10000) return 'one night';
    if (wordCount <= 20000) return '24 hours';
    if (wordCount <= 35000) return '48 hours';
    return 'one week';
  }

  /**
   * Infer character count from word count
   */
  inferCharacterCount(wordCount) {
    if (wordCount <= 10000) return 3;
    if (wordCount <= 20000) return 5;
    if (wordCount <= 35000) return 7;
    return 10;
  }

  /**
   * Infer termination rules
   */
  inferTerminationRules(exitCondition, violationResponse) {
    const rules = [];

    if (exitCondition) {
      rules.push(`Story ends when ${exitCondition.description || 'exit condition is met'}`);
    }

    if (violationResponse?.id === 'transformation') {
      rules.push('Story ends when transformation is complete');
    }

    if (rules.length === 0) {
      rules.push('Story ends when protagonist escapes, is transformed, or is destroyed');
    }

    return rules;
  }

  /**
   * Infer acceptable outcomes
   */
  inferAcceptableOutcomes(exitCondition, violationResponse) {
    const outcomes = ['survival_with_cost', 'compliance_with_transformation'];

    if (exitCondition?.id === 'conditional_exit') {
      outcomes.push('conditional_exit_achieved', 'conditional_exit_failed');
    }

    if (violationResponse?.id === 'escalating_consequences') {
      outcomes.push('escape_with_contamination');
    }

    if (violationResponse?.id === 'transformation') {
      outcomes.push('entrapment');
    }

    return outcomes;
  }

  /**
   * Infer theme enactment
   */
  inferThemeEnactment(theme) {
    // Handle AI selection cases
    if (theme === 'AI_SELECT_THEME') {
      return 'AI will select and enact appropriate thematic elements based on the story context';
    }

    const enactmentMap = {
      'dread_of_incomprehensible_systems': 'Rules embody systems that cannot be fully understood, forcing compliance without comprehension',
      'complicity_and_participation': 'Following rules makes the protagonist complicit in the horror',
      'erosion_of_identity': 'Each rule followed or broken changes who the protagonist is',
      'institutional_horror': 'The rules represent an oppressive system that cannot be escaped',
      'contamination': 'Knowledge of the rules itself is a form of infection',
      'cosmic_insignificance': 'The rules reveal the protagonist\'s place in something vast and indifferent'
    };

    return enactmentMap[theme] || 'Rules create tension between safety and understanding';
  }

  /**
   * Validate the contract
   */
  validateContract(contract) {
    const errors = [];
    const warnings = [];

    // Check required sections
    if (!contract.identity_anchors?.setting?.location_id) {
      errors.push('Missing location');
    }

    if (!contract.rule_system?.rules || contract.rule_system.rules.length === 0) {
      errors.push('No rules defined');
    }

    if (!contract.generation_parameters?.target_word_count) {
      errors.push('Missing target word count');
    }

    // Cross-section checks
    const ruleCount = contract.rule_system?.rules?.length || 0;
    const wordCount = contract.generation_parameters?.target_word_count || 0;

    if (ruleCount > wordCount / 1500) {
      warnings.push(`High rule density: ${ruleCount} rules for ${wordCount} words may not allow proper development`);
    }

    if (ruleCount < 3) {
      warnings.push('Fewer than 3 rules may not create sufficient tension');
    }

    if (wordCount > 30000 && ruleCount < 5) {
      warnings.push('Long story with few rules may feel repetitive');
    }

    return {
      is_valid: errors.length === 0,
      validation_errors: errors,
      warnings: warnings
    };
  }

  /**
   * Audit a contract (quick validation)
   */
  async auditContract(contract) {
    console.log('🔍 Auditing contract...');

    const validation = this.validateContract(contract);

    if (!validation.is_valid) {
      console.log(`❌ Contract invalid: ${validation.validation_errors.join(', ')}`);
    } else if (validation.warnings.length > 0) {
      console.log(`⚠️ Contract valid with warnings: ${validation.warnings.join(', ')}`);
    } else {
      console.log('✅ Contract valid');
    }

    return {
      ...validation,
      audit_timestamp: new Date().toISOString()
    };
  }
}

module.exports = ContractGenerator;
