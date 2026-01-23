/**
 * State Manager Service
 * Maintains canonical story state independent of generated prose
 *
 * Purpose: Provide "source of truth" for story state that persists across
 * generation steps and can be queried/validated programmatically.
 */

const fs = require('fs').promises;
const path = require('path');

class StateManager {
  constructor(sessionId = null) {
    this.sessionId = sessionId;
    this.state = null;
  }

  /**
   * Initialize state structure from user parameters
   *
   * @param {string} sessionId - Unique session identifier
   * @param {object} userParams - User-provided generation parameters
   * @returns {object} Initialized state structure
   */
  initializeState(sessionId, userParams = {}) {
    this.sessionId = sessionId;

    // Create initial state structure
    this.state = {
      session_id: sessionId,
      canonical_state: {
        rules: this.initializeRules(userParams.ruleCount || 7),
        entity_capabilities: {},
        world_facts: {
          location: userParams.location || null,
          custom_location: userParams.customLocation || null,
          time_anchor: null,
          timeline_commitments: []
        },
        irreversible_flags: {
          bound_to_system: false,
          contamination_level: 0,
          violations: []
        },
        thematic_focus: userParams.thematicFocus || null,
        entry_condition: userParams.entryCondition || null,
        discovery_method: userParams.discoveryMethod || null
      },
      narrative_delta_log: [],
      metadata: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_parameters: userParams
      }
    };

    // Log initialization
    this.logDelta(0, ['State tracking initialized', `Rule slots created: ${userParams.ruleCount || 7}`]);

    return this.state;
  }

  /**
   * Initialize empty rule slots (basic structure)
   * For structured rules, use setStructuredRules() instead
   *
   * @param {number} ruleCount - Number of rule slots to create
   * @returns {array} Array of empty rule objects
   */
  initializeRules(ruleCount) {
    const rules = [];
    for (let i = 1; i <= ruleCount; i++) {
      rules.push({
        rule_id: `rule_${i}`,
        text: null,
        type: null, // boundary|temporal|behavioral|object_interaction|procedural
        active: false,
        violated: false,
        violation_count: 0,
        established_at_scene: null,
        notes: '',

        // Structured rule fields (Phase 3)
        violation_threshold: 1,
        consequences: {
          immediate: [],
          delayed: [],
          permanent: []
        },
        reversibility: {
          reversible: false,
          reversal_conditions: null
        },
        dependencies: {
          requires_rules: [],
          enables_rules: [],
          conflicts_with: []
        }
      });
    }
    return rules;
  }

  /**
   * Replace rules array with structured rules from RuleBuilder
   *
   * @param {array} structuredRules - Array of structured rule objects
   */
  setStructuredRules(structuredRules) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    this.state.canonical_state.rules = structuredRules;
    this.updateTimestamp();
  }

  /**
   * Add or update a rule
   *
   * @param {object} ruleObject - Rule data
   * @returns {object} Added/updated rule
   */
  addRule(ruleObject) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    const {
      rule_id,
      text,
      type,
      active = true,
      established_at_scene = null,
      notes = ''
    } = ruleObject;

    // Find existing rule slot or create new
    let rule = this.state.canonical_state.rules.find(r => r.rule_id === rule_id);

    if (rule) {
      // Update existing rule
      rule.text = text;
      rule.type = type;
      rule.active = active;
      rule.established_at_scene = established_at_scene;
      rule.notes = notes;
    } else {
      // Add new rule
      rule = {
        rule_id,
        text,
        type,
        active,
        violated: false,
        violation_count: 0,
        established_at_scene,
        notes
      };
      this.state.canonical_state.rules.push(rule);
    }

    this.updateTimestamp();
    return rule;
  }

  /**
   * Update rule status
   *
   * @param {string} ruleId - Rule identifier
   * @param {object} updates - Fields to update
   * @returns {object} Updated rule
   */
  updateRuleStatus(ruleId, updates) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    const rule = this.state.canonical_state.rules.find(r => r.rule_id === ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (key === 'violated' && updates[key] === true && !rule.violated) {
        // First violation - increment count
        rule.violation_count += 1;
      } else if (key === 'violation_count') {
        rule.violation_count = updates[key];
      }
      rule[key] = updates[key];
    });

    this.updateTimestamp();
    return rule;
  }

  /**
   * Mark rule as violated (basic version - Phase 1)
   *
   * @param {string} ruleId - Rule identifier
   * @param {number} sceneNumber - Scene where violation occurred
   * @returns {object} Updated rule
   */
  markRuleViolated(ruleId, sceneNumber = null) {
    const rule = this.updateRuleStatus(ruleId, { violated: true });
    rule.violation_count += 1;

    // Add to irreversible violations log
    this.state.canonical_state.irreversible_flags.violations.push({
      rule_id: ruleId,
      scene: sceneNumber,
      timestamp: new Date().toISOString()
    });

    this.updateTimestamp();
    return rule;
  }

  // ============================================================================
  // PHASE 3: STRUCTURED RULE METHODS
  // ============================================================================

  /**
   * Get rule by ID
   *
   * @param {string} ruleId - Rule identifier
   * @returns {object|null} Rule object or null
   */
  getRule(ruleId) {
    if (!this.state) return null;
    return this.state.canonical_state.rules.find(r => r.rule_id === ruleId) || null;
  }

  /**
   * Check if rule can be violated (hasn't exceeded threshold)
   *
   * @param {string} ruleId - Rule identifier
   * @returns {boolean} True if rule can be violated
   */
  canRuleBeViolated(ruleId) {
    const rule = this.getRule(ruleId);
    if (!rule) return false;

    return rule.violation_count < rule.violation_threshold;
  }

  /**
   * Get rule status with full context
   *
   * @param {string} ruleId - Rule identifier
   * @returns {object} Rule status object
   */
  getRuleStatus(ruleId) {
    const rule = this.getRule(ruleId);
    if (!rule) {
      return { exists: false };
    }

    return {
      exists: true,
      active: rule.active,
      violated: rule.violated,
      violation_count: rule.violation_count,
      violation_threshold: rule.violation_threshold,
      can_be_violated: this.canRuleBeViolated(ruleId),
      reversible: rule.reversibility.reversible
    };
  }

  /**
   * Activate a rule (make it enforceable)
   *
   * @param {string} ruleId - Rule identifier
   * @returns {object} Updated rule
   */
  activateRule(ruleId) {
    const rule = this.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    rule.active = true;
    this.updateTimestamp();

    console.log(`✅ Rule activated: ${ruleId}`);
    return rule;
  }

  /**
   * Deactivate a rule (make it non-enforceable)
   *
   * @param {string} ruleId - Rule identifier
   * @returns {object} Updated rule
   */
  deactivateRule(ruleId) {
    const rule = this.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    rule.active = false;
    this.updateTimestamp();

    console.log(`⚠️  Rule deactivated: ${ruleId}`);
    return rule;
  }

  /**
   * Violate rule with automatic consequence application (Phase 3)
   *
   * @param {string} ruleId - Rule identifier
   * @param {number} sceneNumber - Scene where violation occurred
   * @returns {object} Violation result with applied consequences
   */
  violateRule(ruleId, sceneNumber = null) {
    const rule = this.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Check if rule can be violated
    if (!this.canRuleBeViolated(ruleId)) {
      console.warn(`⚠️  Rule ${ruleId} already at violation threshold (${rule.violation_count}/${rule.violation_threshold})`);
    }

    // Mark rule as violated
    rule.violated = true;
    rule.violation_count += 1;

    // Add to irreversible violations log
    this.state.canonical_state.irreversible_flags.violations.push({
      rule_id: ruleId,
      scene: sceneNumber,
      timestamp: new Date().toISOString(),
      violation_number: rule.violation_count
    });

    const appliedConsequences = {
      immediate: [],
      delayed: [],
      permanent: []
    };

    // Apply immediate consequences
    if (rule.consequences.immediate) {
      rule.consequences.immediate.forEach(consequence => {
        try {
          this.applyConsequence(consequence);
          appliedConsequences.immediate.push(consequence);
        } catch (error) {
          console.error(`Failed to apply immediate consequence "${consequence}":`, error.message);
        }
      });
    }

    // Apply permanent consequences
    if (rule.consequences.permanent) {
      rule.consequences.permanent.forEach(consequence => {
        try {
          this.applyConsequence(consequence);
          appliedConsequences.permanent.push(consequence);
        } catch (error) {
          console.error(`Failed to apply permanent consequence "${consequence}":`, error.message);
        }
      });
    }

    // Check and activate dependent rules
    if (rule.dependencies.enables_rules && rule.dependencies.enables_rules.length > 0) {
      rule.dependencies.enables_rules.forEach(enabledRuleId => {
        try {
          this.checkRuleDependencies(enabledRuleId);
        } catch (error) {
          console.error(`Failed to check dependencies for "${enabledRuleId}":`, error.message);
        }
      });
    }

    // Log the violation and consequences
    const deltaChanges = [
      `Rule ${ruleId} violated (${rule.violation_count}/${rule.violation_threshold})`
    ];

    if (appliedConsequences.immediate.length > 0) {
      deltaChanges.push(`Immediate consequences: ${appliedConsequences.immediate.join(', ')}`);
    }

    if (appliedConsequences.permanent.length > 0) {
      deltaChanges.push(`Permanent consequences: ${appliedConsequences.permanent.join(', ')}`);
    }

    this.logDelta(sceneNumber, deltaChanges);
    this.updateTimestamp();

    console.log(`🚨 Rule violated: ${ruleId} (count: ${rule.violation_count}/${rule.violation_threshold})`);
    console.log(`   Applied consequences:`, appliedConsequences);

    return {
      rule,
      appliedConsequences,
      violation_count: rule.violation_count,
      at_threshold: rule.violation_count >= rule.violation_threshold
    };
  }

  /**
   * Apply a consequence to state
   *
   * @param {string} consequence - Consequence identifier
   * @returns {boolean} True if applied successfully
   */
  applyConsequence(consequence) {
    // Consequence type mapping
    const consequenceHandlers = {
      // Protection/Safety
      'protection_void': () => {
        this.setIrreversibleFlag('protected', false);
        console.log('   → Protection voided');
      },
      'boundary_breached': () => {
        this.setIrreversibleFlag('boundary_intact', false);
        console.log('   → Boundary breached');
      },

      // Entity capabilities
      'entity_can_reach_vehicle': () => {
        this.addEntityCapability('can_enter_vehicle', true);
        console.log('   → Entity can now enter vehicle');
      },
      'entity_can_imitate_narrator': () => {
        this.addEntityCapability('can_imitate_narrator', true);
        console.log('   → Entity can imitate narrator');
      },
      'entity_knows_name': () => {
        this.addEntityCapability('knows_narrator_name', true);
        console.log('   → Entity knows narrator name');
      },
      'attention_drawn': () => {
        this.addEntityCapability('aware_of_narrator', true);
        console.log('   → Entity attention drawn');
      },

      // Contamination/Marking
      'marked_for_collection': () => {
        this.setIrreversibleFlag('marked', true);
        this.state.canonical_state.irreversible_flags.contamination_level += 1;
        console.log('   → Narrator marked for collection');
      },
      'marked_for_observation': () => {
        this.setIrreversibleFlag('under_observation', true);
        this.state.canonical_state.irreversible_flags.contamination_level += 1;
        console.log('   → Narrator under observation');
      },
      'contamination_spread': () => {
        this.state.canonical_state.irreversible_flags.contamination_level += 2;
        console.log('   → Contamination spread');
      },

      // Temporal/Reality
      'temporal_slip': () => {
        this.addWorldFact('temporal_stability', 'unstable');
        console.log('   → Temporal stability compromised');
      },
      'reality_degradation': () => {
        this.setIrreversibleFlag('reality_stable', false);
        console.log('   → Reality degrading');
      },

      // Procedural
      'procedure_disrupted': () => {
        this.addWorldFact('procedure_intact', false);
        console.log('   → Procedure disrupted');
      },
      'system_instability': () => {
        this.setIrreversibleFlag('system_stable', false);
        console.log('   → System unstable');
      },

      // Object state
      'object_state_changed': () => {
        this.addWorldFact('object_pristine', false);
        console.log('   → Object state changed');
      },
      'interaction_irreversible': () => {
        this.setIrreversibleFlag('can_undo_interaction', false);
        console.log('   → Interaction irreversible');
      }
    };

    const handler = consequenceHandlers[consequence];
    if (handler) {
      handler();
      return true;
    } else {
      console.warn(`⚠️  Unknown consequence: ${consequence}`);
      return false;
    }
  }

  /**
   * Check rule dependencies and activate rules if requirements met
   *
   * @param {string} ruleId - Rule to check
   * @returns {boolean} True if rule can be activated
   */
  checkRuleDependencies(ruleId) {
    const rule = this.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Check if all required rules are violated
    if (rule.dependencies.requires_rules && rule.dependencies.requires_rules.length > 0) {
      const allRequirementsMet = rule.dependencies.requires_rules.every(requiredRuleId => {
        const requiredRule = this.getRule(requiredRuleId);
        return requiredRule && requiredRule.violated;
      });

      if (allRequirementsMet && !rule.active) {
        this.activateRule(ruleId);
        this.logDelta(null, [`Rule ${ruleId} activated (dependencies met)`]);
        return true;
      }

      return allRequirementsMet;
    }

    return true; // No dependencies
  }

  /**
   * Add or update entity capability
   *
   * @param {string} capability - Capability name
   * @param {any} value - Capability value (boolean, string, object)
   * @returns {object} Updated capabilities object
   */
  addEntityCapability(capability, value) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    this.state.canonical_state.entity_capabilities[capability] = value;
    this.updateTimestamp();
    return this.state.canonical_state.entity_capabilities;
  }

  /**
   * Add or update world fact
   *
   * @param {string} key - Fact key
   * @param {any} value - Fact value
   * @returns {object} Updated world_facts object
   */
  addWorldFact(key, value) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    this.state.canonical_state.world_facts[key] = value;
    this.updateTimestamp();
    return this.state.canonical_state.world_facts;
  }

  /**
   * Add timeline commitment (irreversible fact about sequence/time)
   *
   * @param {string} commitment - Timeline commitment text
   * @returns {array} Updated timeline commitments
   */
  addTimelineCommitment(commitment) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    this.state.canonical_state.world_facts.timeline_commitments.push({
      commitment,
      timestamp: new Date().toISOString()
    });

    this.updateTimestamp();
    return this.state.canonical_state.world_facts.timeline_commitments;
  }

  /**
   * Set irreversible flag
   *
   * @param {string} flagName - Flag name
   * @param {any} value - Flag value
   * @returns {object} Updated irreversible_flags object
   */
  setIrreversibleFlag(flagName, value) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    this.state.canonical_state.irreversible_flags[flagName] = value;
    this.updateTimestamp();
    return this.state.canonical_state.irreversible_flags;
  }

  /**
   * Log narrative delta (changes that occurred in a scene)
   *
   * @param {number} sceneNumber - Scene number
   * @param {array} changes - Array of change descriptions
   * @returns {object} Delta log entry
   */
  logDelta(sceneNumber, changes = []) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    const deltaEntry = {
      scene: sceneNumber,
      timestamp: new Date().toISOString(),
      changes: Array.isArray(changes) ? changes : [changes]
    };

    this.state.narrative_delta_log.push(deltaEntry);
    this.updateTimestamp();
    return deltaEntry;
  }

  /**
   * Get current state
   *
   * @returns {object} Current state object
   */
  getState() {
    return this.state;
  }

  /**
   * Get canonical state only (without logs/metadata)
   *
   * @returns {object} Canonical state object
   */
  getCanonicalState() {
    return this.state ? this.state.canonical_state : null;
  }

  /**
   * Get all active rules
   *
   * @returns {array} Array of active rules
   */
  getActiveRules() {
    if (!this.state) return [];
    return this.state.canonical_state.rules.filter(r => r.active && r.text);
  }

  /**
   * Get all violated rules
   *
   * @returns {array} Array of violated rules
   */
  getViolatedRules() {
    if (!this.state) return [];
    return this.state.canonical_state.rules.filter(r => r.violated);
  }

  /**
   * Get entity capabilities
   *
   * @returns {object} Entity capabilities object
   */
  getEntityCapabilities() {
    return this.state ? this.state.canonical_state.entity_capabilities : {};
  }

  /**
   * Get world facts
   *
   * @returns {object} World facts object
   */
  getWorldFacts() {
    return this.state ? this.state.canonical_state.world_facts : {};
  }

  /**
   * Get irreversible flags
   *
   * @returns {object} Irreversible flags object
   */
  getIrreversibleFlags() {
    return this.state ? this.state.canonical_state.irreversible_flags : {};
  }

  /**
   * Check if state has any violations
   *
   * @returns {boolean} True if any rules violated
   */
  hasViolations() {
    if (!this.state) return false;
    return this.state.canonical_state.rules.some(r => r.violated);
  }

  /**
   * Get state summary for logging
   *
   * @returns {object} Summary object
   */
  getSummary() {
    if (!this.state) {
      return { initialized: false };
    }

    const activeRules = this.getActiveRules();
    const violatedRules = this.getViolatedRules();

    return {
      initialized: true,
      session_id: this.sessionId,
      total_rules: this.state.canonical_state.rules.length,
      active_rules: activeRules.length,
      violated_rules: violatedRules.length,
      entity_capabilities_count: Object.keys(this.state.canonical_state.entity_capabilities).length,
      contamination_level: this.state.canonical_state.irreversible_flags.contamination_level,
      bound_to_system: this.state.canonical_state.irreversible_flags.bound_to_system,
      delta_log_entries: this.state.narrative_delta_log.length
    };
  }

  /**
   * Update timestamp
   */
  updateTimestamp() {
    if (this.state && this.state.metadata) {
      this.state.metadata.updated_at = new Date().toISOString();
    }
  }

  /**
   * Save state to JSON file
   *
   * @param {string} filepath - Path to save file
   * @returns {Promise<string>} Saved file path
   */
  async saveState(filepath) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    // Ensure directory exists
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });

    // Write state to file
    await fs.writeFile(
      filepath,
      JSON.stringify(this.state, null, 2),
      'utf8'
    );

    console.log(`✅ State saved to: ${filepath}`);
    return filepath;
  }

  /**
   * Load state from JSON file
   *
   * @param {string} filepath - Path to state file
   * @returns {Promise<object>} Loaded state object
   */
  async loadState(filepath) {
    try {
      const data = await fs.readFile(filepath, 'utf8');
      this.state = JSON.parse(data);
      this.sessionId = this.state.session_id;
      console.log(`✅ State loaded from: ${filepath}`);
      return this.state;
    } catch (error) {
      throw new Error(`Failed to load state from ${filepath}: ${error.message}`);
    }
  }

  /**
   * Export state as formatted string for logging
   *
   * @returns {string} Formatted state string
   */
  toString() {
    if (!this.state) {
      return 'State not initialized';
    }

    const summary = this.getSummary();
    return `StateManager[${this.sessionId}]: ${summary.active_rules}/${summary.total_rules} rules active, ` +
           `${summary.violated_rules} violated, ${summary.delta_log_entries} delta entries`;
  }

  // ============================================================================
  // PHASE 2: CHECKPOINT PROTOCOL METHODS
  // ============================================================================

  /**
   * Apply state delta from checkpoint
   *
   * @param {number} sceneNumber - Scene number
   * @param {object} delta - Delta object with changes array
   * @returns {object} Application result
   */
  applyDelta(sceneNumber, delta) {
    if (!this.state) {
      throw new Error('State not initialized. Call initializeState() first.');
    }

    if (!delta || !delta.changes) {
      console.warn('⚠️  Empty delta provided');
      return { applied: 0, failed: 0 };
    }

    console.log(`\n=== Applying Delta for Scene ${sceneNumber} ===`);
    console.log(`Changes to apply: ${delta.changes.length}`);

    const results = {
      applied: 0,
      failed: 0,
      changes: []
    };

    // Process each change
    delta.changes.forEach((change, index) => {
      try {
        console.log(`  [${index + 1}/${delta.changes.length}] ${change.type}: ${JSON.stringify(change).substring(0, 80)}...`);
        this.processChange(change);
        results.applied++;
        results.changes.push({
          change,
          status: 'applied',
          error: null
        });
      } catch (error) {
        console.error(`  ❌ Failed to apply change:`, error.message);
        results.failed++;
        results.changes.push({
          change,
          status: 'failed',
          error: error.message
        });
      }
    });

    // Log delta application
    this.logDelta(sceneNumber, [
      `Delta applied: ${results.applied} changes applied, ${results.failed} failed`,
      ...delta.changes.map(c => `${c.type}: ${JSON.stringify(c).substring(0, 60)}`)
    ]);

    console.log(`✅ Delta applied: ${results.applied} successful, ${results.failed} failed\n`);

    return results;
  }

  /**
   * Process individual change from delta
   *
   * @param {object} change - Change object
   * @returns {boolean} True if processed successfully
   */
  processChange(change) {
    if (!change || !change.type) {
      throw new Error('Invalid change object: missing type');
    }

    switch (change.type) {
      case 'rule_violation':
        return this.processRuleViolation(change);

      case 'entity_capability':
        return this.processEntityCapability(change);

      case 'irreversible_flag':
        return this.processIrreversibleFlag(change);

      case 'world_fact':
        return this.processWorldFact(change);

      case 'timeline_commitment':
        return this.processTimelineCommitment(change);

      default:
        console.warn(`⚠️  Unknown change type: ${change.type}`);
        return false;
    }
  }

  /**
   * Process rule violation change
   *
   * @param {object} change - Change object
   * @returns {boolean} True if processed successfully
   */
  processRuleViolation(change) {
    const { rule_id, scene_number } = change;

    if (!rule_id) {
      throw new Error('Rule violation change missing rule_id');
    }

    const rule = this.getRule(rule_id);
    if (!rule) {
      console.warn(`⚠️  Rule not found: ${rule_id} - skipping violation`);
      return false;
    }

    // Check if rule already violated at or above threshold
    if (rule.violated && rule.violation_count >= rule.violation_threshold) {
      console.log(`   ℹ️  Rule ${rule_id} already at threshold - skipping`);
      return true; // Not an error, just already violated
    }

    // Apply violation with consequences
    this.violateRule(rule_id, scene_number);
    console.log(`   ✅ Rule violation applied: ${rule_id}`);

    return true;
  }

  /**
   * Process entity capability change
   *
   * @param {object} change - Change object
   * @returns {boolean} True if processed successfully
   */
  processEntityCapability(change) {
    const { capability, value } = change;

    if (!capability) {
      throw new Error('Entity capability change missing capability name');
    }

    // Check if capability already exists with same value
    const currentValue = this.state.canonical_state.entity_capabilities[capability];
    if (currentValue === value) {
      console.log(`   ℹ️  Capability ${capability} already set to ${value} - skipping`);
      return true;
    }

    this.addEntityCapability(capability, value);
    console.log(`   ✅ Entity capability applied: ${capability} = ${value}`);

    return true;
  }

  /**
   * Process irreversible flag change
   *
   * @param {object} change - Change object
   * @returns {boolean} True if processed successfully
   */
  processIrreversibleFlag(change) {
    const { flag, value } = change;

    if (!flag) {
      throw new Error('Irreversible flag change missing flag name');
    }

    // Check if flag already exists with same value
    const currentValue = this.state.canonical_state.irreversible_flags[flag];
    if (currentValue === value) {
      console.log(`   ℹ️  Flag ${flag} already set to ${value} - skipping`);
      return true;
    }

    // Irreversible flags should not be reversed
    if (currentValue !== undefined && currentValue !== value) {
      console.warn(`   ⚠️  Attempting to change irreversible flag ${flag} from ${currentValue} to ${value}`);
      // Still apply but log warning
    }

    this.setIrreversibleFlag(flag, value);
    console.log(`   ✅ Irreversible flag applied: ${flag} = ${value}`);

    return true;
  }

  /**
   * Process world fact change
   *
   * @param {object} change - Change object
   * @returns {boolean} True if processed successfully
   */
  processWorldFact(change) {
    const { key, value } = change;

    if (!key) {
      throw new Error('World fact change missing key');
    }

    this.addWorldFact(key, value);
    console.log(`   ✅ World fact applied: ${key} = ${value}`);

    return true;
  }

  /**
   * Process timeline commitment change
   *
   * @param {object} change - Change object
   * @returns {boolean} True if processed successfully
   */
  processTimelineCommitment(change) {
    const { commitment } = change;

    if (!commitment) {
      throw new Error('Timeline commitment change missing commitment text');
    }

    // Check if commitment already exists
    const existingCommitments = this.state.canonical_state.world_facts.timeline_commitments || [];
    const exists = existingCommitments.some(tc => {
      const existingText = typeof tc === 'string' ? tc : tc.commitment;
      return existingText === commitment;
    });

    if (exists) {
      console.log(`   ℹ️  Timeline commitment already exists - skipping`);
      return true;
    }

    this.addTimelineCommitment(commitment);
    console.log(`   ✅ Timeline commitment applied: ${commitment.substring(0, 60)}...`);

    return true;
  }
}

module.exports = StateManager;
