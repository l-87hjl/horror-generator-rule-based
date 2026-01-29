/**
 * State Updater Module
 * Performs minimal, incremental state updates between chunks
 *
 * Purpose: Update session_state.json with delta WITHOUT running validation checks.
 * All heavy validation is deferred to post-processing.
 *
 * Updates:
 * - Increments counters (violation_count, escalation_level)
 * - Adds new capabilities to entity.capabilities array
 * - Marks rules as active if introduced
 * - Does NOT run validation checks (deferred to post-processing)
 */

class StateUpdater {
  constructor(stateManager, options = {}) {
    this.stateManager = stateManager;
    this.skipValidation = options.skipValidation !== false; // Default: skip validation
    this.updateLog = []; // Track all updates
  }

  /**
   * Update canonical state with delta (minimal update, no validation)
   *
   * @param {object} delta - Delta object with changes
   * @param {object} options - Additional options
   * @returns {object} Update result
   */
  updateCanonicalState(delta, options = {}) {
    const startTime = Date.now();
    const sceneNumber = delta.scene_number || delta.sceneNumber;

    const result = {
      success: true,
      sceneNumber: sceneNumber,
      appliedChanges: [],
      skippedChanges: [],
      errors: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Process each change type
      if (delta.rulesViolated && delta.rulesViolated.length > 0) {
        this.processRuleViolations(delta.rulesViolated, sceneNumber, result);
      }

      if (delta.rulesIntroduced && delta.rulesIntroduced.length > 0) {
        this.processRulesIntroduced(delta.rulesIntroduced, sceneNumber, result);
      }

      if (delta.entityCapabilities && Object.keys(delta.entityCapabilities).length > 0) {
        this.processEntityCapabilities(delta.entityCapabilities, result);
      }

      if (delta.timelineCommitments && delta.timelineCommitments.length > 0) {
        this.processTimelineCommitments(delta.timelineCommitments, result);
      }

      // Also handle the generic changes array format (for compatibility)
      if (delta.changes && Array.isArray(delta.changes)) {
        this.processGenericChanges(delta.changes, sceneNumber, result);
      }

      // Update escalation level based on violations
      this.updateEscalationLevel(result);

      // Log the update
      this.updateLog.push({
        sceneNumber: sceneNumber,
        timestamp: result.timestamp,
        applied: result.appliedChanges.length,
        skipped: result.skippedChanges.length,
        errors: result.errors.length
      });

      result.duration = Date.now() - startTime;

    } catch (error) {
      result.success = false;
      result.errors.push({
        type: 'fatal',
        message: error.message,
        stack: error.stack
      });
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Process rule violations (increment counters, don't validate)
   *
   * @param {Array} violations - Array of rule IDs
   * @param {number} sceneNumber - Scene number
   * @param {object} result - Result object to update
   */
  processRuleViolations(violations, sceneNumber, result) {
    for (const ruleId of violations) {
      try {
        const rule = this.stateManager.getRule(ruleId);

        if (!rule) {
          result.skippedChanges.push({
            type: 'rule_violation',
            ruleId: ruleId,
            reason: 'Rule not found'
          });
          continue;
        }

        // Check if already at or above threshold (skip if so)
        if (rule.violation_count >= rule.violation_threshold) {
          result.skippedChanges.push({
            type: 'rule_violation',
            ruleId: ruleId,
            reason: 'Already at threshold'
          });
          continue;
        }

        // Increment violation count (minimal update)
        rule.violated = true;
        rule.violation_count += 1;

        // Add to irreversible violations log
        const state = this.stateManager.getState();
        if (state && state.canonical_state && state.canonical_state.irreversible_flags) {
          state.canonical_state.irreversible_flags.violations.push({
            rule_id: ruleId,
            scene: sceneNumber,
            timestamp: new Date().toISOString(),
            violation_number: rule.violation_count
          });
        }

        result.appliedChanges.push({
          type: 'rule_violation',
          ruleId: ruleId,
          newCount: rule.violation_count,
          threshold: rule.violation_threshold
        });

      } catch (error) {
        result.errors.push({
          type: 'rule_violation',
          ruleId: ruleId,
          message: error.message
        });
      }
    }
  }

  /**
   * Process rules introduced (mark as active)
   *
   * @param {Array} rules - Array of rule texts
   * @param {number} sceneNumber - Scene number
   * @param {object} result - Result object to update
   */
  processRulesIntroduced(rules, sceneNumber, result) {
    const state = this.stateManager.getState();
    if (!state || !state.canonical_state || !state.canonical_state.rules) {
      return;
    }

    const stateRules = state.canonical_state.rules;

    for (const ruleText of rules) {
      try {
        // Find an inactive rule slot to use
        const emptySlot = stateRules.find(r => !r.active && !r.text);

        if (emptySlot) {
          emptySlot.text = ruleText;
          emptySlot.active = true;
          emptySlot.established_at_scene = sceneNumber;

          result.appliedChanges.push({
            type: 'rule_introduced',
            ruleId: emptySlot.rule_id,
            text: ruleText.substring(0, 50) + '...'
          });
        } else {
          result.skippedChanges.push({
            type: 'rule_introduced',
            text: ruleText.substring(0, 50) + '...',
            reason: 'No empty rule slots available'
          });
        }

      } catch (error) {
        result.errors.push({
          type: 'rule_introduced',
          message: error.message
        });
      }
    }
  }

  /**
   * Process entity capabilities
   *
   * @param {object} capabilities - Capability key-value pairs
   * @param {object} result - Result object to update
   */
  processEntityCapabilities(capabilities, result) {
    for (const [capability, value] of Object.entries(capabilities)) {
      try {
        this.stateManager.addEntityCapability(capability, value);

        result.appliedChanges.push({
          type: 'entity_capability',
          capability: capability,
          value: value
        });

      } catch (error) {
        result.errors.push({
          type: 'entity_capability',
          capability: capability,
          message: error.message
        });
      }
    }
  }

  /**
   * Process timeline commitments
   *
   * @param {Array} commitments - Array of commitment strings
   * @param {object} result - Result object to update
   */
  processTimelineCommitments(commitments, result) {
    for (const commitment of commitments) {
      try {
        this.stateManager.addTimelineCommitment(commitment);

        result.appliedChanges.push({
          type: 'timeline_commitment',
          commitment: commitment.substring(0, 50) + (commitment.length > 50 ? '...' : '')
        });

      } catch (error) {
        result.errors.push({
          type: 'timeline_commitment',
          message: error.message
        });
      }
    }
  }

  /**
   * Process generic changes array (for compatibility with existing format)
   *
   * @param {Array} changes - Array of change objects
   * @param {number} sceneNumber - Scene number
   * @param {object} result - Result object to update
   */
  processGenericChanges(changes, sceneNumber, result) {
    for (const change of changes) {
      try {
        switch (change.type) {
          case 'rule_violation':
            this.processRuleViolations([change.rule_id], sceneNumber, result);
            break;

          case 'entity_capability':
            this.processEntityCapabilities({ [change.capability]: change.value }, result);
            break;

          case 'timeline_commitment':
            this.processTimelineCommitments([change.commitment], result);
            break;

          case 'irreversible_flag':
            this.stateManager.setIrreversibleFlag(change.flag, change.value);
            result.appliedChanges.push({
              type: 'irreversible_flag',
              flag: change.flag,
              value: change.value
            });
            break;

          case 'world_fact':
            this.stateManager.addWorldFact(change.key, change.value);
            result.appliedChanges.push({
              type: 'world_fact',
              key: change.key,
              value: change.value
            });
            break;

          default:
            result.skippedChanges.push({
              type: change.type,
              reason: 'Unknown change type'
            });
        }

      } catch (error) {
        result.errors.push({
          type: change.type,
          message: error.message
        });
      }
    }
  }

  /**
   * Update escalation level based on violations
   *
   * @param {object} result - Result object with applied changes
   */
  updateEscalationLevel(result) {
    const state = this.stateManager.getState();
    if (!state || !state.canonical_state) return;

    // Count total violations
    const violationChanges = result.appliedChanges.filter(c => c.type === 'rule_violation');

    if (violationChanges.length > 0) {
      // Get current contamination level
      const currentLevel = state.canonical_state.irreversible_flags.contamination_level || 0;

      // Increment by number of new violations
      state.canonical_state.irreversible_flags.contamination_level = currentLevel + violationChanges.length;

      result.appliedChanges.push({
        type: 'escalation_update',
        previousLevel: currentLevel,
        newLevel: state.canonical_state.irreversible_flags.contamination_level
      });
    }
  }

  /**
   * Get update log (history of all updates)
   *
   * @returns {Array} Array of update log entries
   */
  getUpdateLog() {
    return [...this.updateLog];
  }

  /**
   * Get summary of current state
   *
   * @returns {object} State summary
   */
  getStateSummary() {
    const summary = this.stateManager.getSummary();

    return {
      ...summary,
      updateCount: this.updateLog.length,
      lastUpdate: this.updateLog.length > 0
        ? this.updateLog[this.updateLog.length - 1]
        : null
    };
  }

  /**
   * Clear update log
   */
  clearUpdateLog() {
    this.updateLog = [];
  }
}

module.exports = StateUpdater;
