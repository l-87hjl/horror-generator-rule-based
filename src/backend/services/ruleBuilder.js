/**
 * Rule Builder Service
 * Translates YAML templates into structured rule objects with
 * consequences, dependencies, and violation tracking
 */

class RuleBuilder {
  constructor() {

    // Rule type configurations
    this.ruleTypeDefaults = {
      boundary: {
        violation_threshold: 1,
        reversible: false,
        default_consequences: {
          immediate: ['protection_void'],
          delayed: [],
          permanent: ['boundary_breached']
        }
      },
      temporal: {
        violation_threshold: 3,
        reversible: true,
        default_consequences: {
          immediate: ['temporal_slip'],
          delayed: ['reality_degradation'],
          permanent: []
        }
      },
      behavioral: {
        violation_threshold: 2,
        reversible: false,
        default_consequences: {
          immediate: ['attention_drawn'],
          delayed: ['marked_for_observation'],
          permanent: []
        }
      },
      object_interaction: {
        violation_threshold: 1,
        reversible: false,
        default_consequences: {
          immediate: ['object_state_changed'],
          delayed: [],
          permanent: ['interaction_irreversible']
        }
      },
      procedural: {
        violation_threshold: 2,
        reversible: true,
        default_consequences: {
          immediate: ['procedure_disrupted'],
          delayed: ['system_instability'],
          permanent: []
        }
      }
    };

    // Consequence definitions
    this.consequenceEffects = {
      // Protection/Safety
      'protection_void': {
        type: 'irreversible_flag',
        flag: 'protected',
        value: false,
        description: 'Narrator no longer protected by rules'
      },
      'boundary_breached': {
        type: 'irreversible_flag',
        flag: 'boundary_intact',
        value: false,
        description: 'Physical boundary no longer enforced'
      },

      // Entity capabilities
      'entity_can_reach_vehicle': {
        type: 'entity_capability',
        capability: 'can_enter_vehicle',
        value: true,
        description: 'Entity gains ability to access vehicle'
      },
      'entity_can_imitate_narrator': {
        type: 'entity_capability',
        capability: 'can_imitate_narrator',
        value: true,
        description: 'Entity can mimic narrator appearance/voice'
      },
      'entity_knows_name': {
        type: 'entity_capability',
        capability: 'knows_narrator_name',
        value: true,
        description: 'Entity has learned narrator identity'
      },
      'attention_drawn': {
        type: 'entity_capability',
        capability: 'aware_of_narrator',
        value: true,
        description: 'Entity now aware of narrator presence'
      },

      // Contamination/Marking
      'marked_for_collection': {
        type: 'contamination',
        level: 1,
        description: 'Narrator marked for entity attention'
      },
      'marked_for_observation': {
        type: 'contamination',
        level: 1,
        description: 'Narrator under observation'
      },
      'contamination_spread': {
        type: 'contamination',
        level: 2,
        description: 'Contamination spreads to narrator'
      },

      // Temporal/Reality
      'temporal_slip': {
        type: 'world_fact',
        key: 'temporal_stability',
        value: 'unstable',
        description: 'Time flow becomes unreliable'
      },
      'reality_degradation': {
        type: 'irreversible_flag',
        flag: 'reality_stable',
        value: false,
        description: 'Reality begins to break down'
      },

      // Procedural
      'procedure_disrupted': {
        type: 'world_fact',
        key: 'procedure_intact',
        value: false,
        description: 'Required procedure disrupted'
      },
      'system_instability': {
        type: 'irreversible_flag',
        flag: 'system_stable',
        value: false,
        description: 'Overall system becomes unstable'
      },

      // Object state
      'object_state_changed': {
        type: 'world_fact',
        key: 'object_pristine',
        value: false,
        description: 'Object state permanently altered'
      },
      'interaction_irreversible': {
        type: 'irreversible_flag',
        flag: 'can_undo_interaction',
        value: false,
        description: 'Object interaction cannot be undone'
      }
    };
  }

  /**
   * Build a complete structured rule object
   *
   * @param {object} params - Rule parameters
   * @returns {object} Structured rule object
   */
  buildRule(params) {
    const {
      rule_id,
      text,
      type,
      active = true,
      established_at_scene = null,
      notes = '',

      // Optional overrides
      violation_threshold = null,
      reversible = null,
      consequences = null,
      dependencies = null
    } = params;

    // Get defaults for rule type
    const typeDefaults = this.ruleTypeDefaults[type] || this.ruleTypeDefaults.behavioral;

    // Build structured rule
    return {
      rule_id,
      text,
      type,
      active,
      violated: false,
      violation_count: 0,
      established_at_scene,
      notes,

      violation_threshold: violation_threshold !== null
        ? violation_threshold
        : typeDefaults.violation_threshold,

      consequences: consequences || {
        immediate: [...typeDefaults.default_consequences.immediate],
        delayed: [...typeDefaults.default_consequences.delayed],
        permanent: [...typeDefaults.default_consequences.permanent]
      },

      reversibility: {
        reversible: reversible !== null ? reversible : typeDefaults.reversible,
        reversal_conditions: null
      },

      dependencies: dependencies || {
        requires_rules: [],
        enables_rules: [],
        conflicts_with: []
      }
    };
  }

  /**
   * Build a set of rules based on story parameters
   *
   * @param {number} ruleCount - Number of rules to create
   * @param {object} storyParams - Story parameters (theme, location, etc.)
   * @returns {array} Array of structured rule objects
   */
  buildRuleSet(ruleCount, storyParams = {}) {
    const rules = [];

    // Create rule slots with appropriate type distribution
    const typeDistribution = this.getTypeDistribution(ruleCount);

    for (let i = 1; i <= ruleCount; i++) {
      const ruleType = typeDistribution[i - 1] || 'behavioral';

      rules.push({
        rule_id: `rule_${i}`,
        text: null, // Will be filled during generation
        type: ruleType,
        active: false, // Will be activated when text is provided
        violated: false,
        violation_count: 0,
        established_at_scene: null,
        notes: '',

        violation_threshold: this.ruleTypeDefaults[ruleType].violation_threshold,

        consequences: {
          immediate: [...this.ruleTypeDefaults[ruleType].default_consequences.immediate],
          delayed: [...this.ruleTypeDefaults[ruleType].default_consequences.delayed],
          permanent: [...this.ruleTypeDefaults[ruleType].default_consequences.permanent]
        },

        reversibility: {
          reversible: this.ruleTypeDefaults[ruleType].reversible,
          reversal_conditions: null
        },

        dependencies: {
          requires_rules: [],
          enables_rules: [],
          conflicts_with: []
        }
      });
    }

    // Apply theme-specific customizations
    if (storyParams.thematicFocus) {
      this.applyThematicCustomizations(rules, storyParams.thematicFocus);
    }

    return rules;
  }

  /**
   * Get type distribution for rule set
   *
   * @param {number} ruleCount - Total number of rules
   * @returns {array} Array of rule types
   */
  getTypeDistribution(ruleCount) {
    // Ensure good mix of rule types
    const types = [];

    if (ruleCount >= 7) {
      // Standard 7-rule distribution
      types.push('boundary');      // 1
      types.push('boundary');      // 2
      types.push('temporal');      // 3
      types.push('behavioral');    // 4
      types.push('behavioral');    // 5
      types.push('object_interaction'); // 6
      types.push('procedural');    // 7

      // Additional rules
      for (let i = 8; i <= ruleCount; i++) {
        types.push(['behavioral', 'temporal', 'boundary'][i % 3]);
      }
    } else {
      // Smaller rule sets
      for (let i = 1; i <= ruleCount; i++) {
        if (i === 1) types.push('boundary');
        else if (i % 3 === 0) types.push('temporal');
        else types.push('behavioral');
      }
    }

    return types;
  }

  /**
   * Apply theme-specific customizations to rules
   *
   * @param {array} rules - Rule objects to customize
   * @param {string} theme - Theme identifier
   */
  applyThematicCustomizations(rules, theme) {
    const themeCustomizations = {
      service_and_servitude: {
        ruleTypes: ['behavioral', 'procedural'],
        consequences: {
          immediate: ['attention_drawn', 'procedure_disrupted'],
          permanent: ['marked_for_observation']
        }
      },

      contamination_and_corruption: {
        ruleTypes: ['boundary', 'object_interaction'],
        consequences: {
          immediate: ['contamination_spread'],
          delayed: ['reality_degradation'],
          permanent: ['boundary_breached']
        }
      },

      isolation_and_recursion: {
        ruleTypes: ['boundary', 'temporal'],
        consequences: {
          immediate: ['temporal_slip'],
          delayed: ['reality_degradation'],
          permanent: ['system_instability']
        }
      },

      witness_and_testimony: {
        ruleTypes: ['behavioral', 'temporal'],
        consequences: {
          immediate: ['attention_drawn', 'entity_knows_name'],
          permanent: ['marked_for_observation']
        }
      }
    };

    const customization = themeCustomizations[theme];
    if (!customization) return;

    // Apply theme-appropriate consequences to matching rule types
    rules.forEach(rule => {
      if (customization.ruleTypes.includes(rule.type)) {
        // Add theme-specific consequences
        if (customization.consequences.immediate) {
          rule.consequences.immediate.push(...customization.consequences.immediate);
        }
        if (customization.consequences.delayed) {
          rule.consequences.delayed = customization.consequences.delayed;
        }
        if (customization.consequences.permanent) {
          rule.consequences.permanent.push(...customization.consequences.permanent);
        }

        // Remove duplicates
        rule.consequences.immediate = [...new Set(rule.consequences.immediate)];
        rule.consequences.permanent = [...new Set(rule.consequences.permanent)];
      }
    });
  }

  /**
   * Set up rule dependencies (e.g., rule 7 enables terminal phase)
   *
   * @param {array} rules - Rule objects
   * @param {object} dependencies - Dependency configuration
   */
  setRuleDependencies(rules, dependencies) {
    dependencies.forEach(dep => {
      const sourceRule = rules.find(r => r.rule_id === dep.source);
      const targetRule = rules.find(r => r.rule_id === dep.target);

      if (sourceRule && targetRule) {
        if (dep.type === 'enables') {
          sourceRule.dependencies.enables_rules.push(dep.target);
          targetRule.dependencies.requires_rules.push(dep.source);
        } else if (dep.type === 'conflicts') {
          sourceRule.dependencies.conflicts_with.push(dep.target);
          targetRule.dependencies.conflicts_with.push(dep.source);
        }
      }
    });
  }

  /**
   * Get consequence effect definition
   *
   * @param {string} consequence - Consequence identifier
   * @returns {object} Consequence effect definition
   */
  getConsequenceEffect(consequence) {
    return this.consequenceEffects[consequence] || null;
  }

  /**
   * Get all available consequences
   *
   * @returns {object} All consequence definitions
   */
  getAllConsequences() {
    return this.consequenceEffects;
  }

  /**
   * Get default configuration for rule type
   *
   * @param {string} type - Rule type
   * @returns {object} Default configuration
   */
  getRuleTypeDefaults(type) {
    return this.ruleTypeDefaults[type] || this.ruleTypeDefaults.behavioral;
  }
}

module.exports = RuleBuilder;
