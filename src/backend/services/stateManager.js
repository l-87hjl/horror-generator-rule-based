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
   * Initialize empty rule slots
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
        type: null, // boundary|temporal|behavioral|object_interaction
        active: false,
        violated: false,
        violation_count: 0,
        established_at_scene: null,
        notes: ''
      });
    }
    return rules;
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
   * Mark rule as violated
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
}

module.exports = StateManager;
