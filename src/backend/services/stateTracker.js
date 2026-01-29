/**
 * State Tracker Service
 * Manages state between chunks according to state_schema.yaml
 *
 * Three categories of state:
 * 1. IMMUTABLE FACTS - Set at start from contract, never change
 * 2. EVOLVING FACTS - Change as story progresses
 * 3. COUNTERS - Numerical tracking of escalation/progression
 */

class StateTracker {
  constructor() {
    this.state = null;
  }

  /**
   * Initialize state from a contract
   * @param {Object} contract - The story contract
   * @returns {Object} - Initial state
   */
  initializeFromContract(contract) {
    const rules = contract.rule_system?.rules || [];

    this.state = {
      version: '1.0',
      session_id: contract.session_id,
      last_updated: new Date().toISOString(),
      chunk_number: 0,

      // Section 1: Immutable Facts (from contract)
      immutable_facts: {
        setting_location: contract.identity_anchors?.setting?.location_name,
        protagonist_name: contract.identity_anchors?.protagonist?.name,
        protagonist_role: contract.identity_anchors?.protagonist?.role,
        pov_type: contract.identity_anchors?.point_of_view?.pov_type,
        tense: contract.identity_anchors?.point_of_view?.tense,
        total_rule_count: rules.length,
        ending_type: contract.ending_contract?.ending_type,
        primary_theme: contract.thematic_contract?.primary_theme
      },

      // Section 2: Rule State
      rule_state: {
        rules: rules.map(r => ({
          rule_number: r.rule_number,
          rule_text: r.rule_text,
          status: r.is_hidden ? 'unknown' : 'discovered',
          discovered_in_chunk: r.is_hidden ? null : 0,
          violated_in_chunk: null,
          violation_count: 0,
          consequence_applied: false,
          consequence_description: null
        })),
        rules_discovered: rules.filter(r => !r.is_hidden).length,
        rules_violated: 0,
        rules_remaining_unknown: rules.filter(r => r.is_hidden).length
      },

      // Section 3: Protagonist State
      protagonist_state: {
        physical_condition: {
          health: 'healthy',
          injuries: [],
          location_in_setting: 'entry_point',
          possessions: [],
          lost_possessions: []
        },
        mental_condition: {
          awareness: 'unaware',
          sanity: 'stable',
          primary_emotion: 'neutral',
          motivations: [contract.identity_anchors?.protagonist?.primary_motivation]
        },
        knowledge: {
          knows_rules: rules.filter(r => !r.is_hidden).map(r => r.rule_number),
          knows_entities: [],
          knows_escape_method: false,
          false_beliefs: [],
          recent_discoveries: []
        }
      },

      // Section 4: Entity State
      entity_state: {
        entities: [],
        active_entity_count: 0,
        total_entity_appearances: 0
      },

      // Section 5: Escalation State
      escalation_state: {
        escalation_tier: 1,
        escalation_events: [],
        contamination_level: 0,
        point_of_no_return_reached: false,
        can_still_escape_cleanly: true
      },

      // Section 6: Narrative State
      narrative_state: {
        current_chunk: 0,
        total_words_generated: 0,
        target_words_remaining: contract.generation_parameters?.target_word_count,
        act_structure: {
          current_act: 'setup',
          act_started_chunk: 1,
          beats_completed: [],
          beats_remaining: ['introduction', 'rule_discovery', 'first_test', 'escalation', 'crisis', 'resolution']
        },
        scene_state: {
          current_scene_number: 0,
          current_scene_goal: 'Establish setting and protagonist',
          scene_tension_level: 'low'
        },
        timeline: {
          story_start_time: null,
          current_time: null,
          elapsed_in_story: '0'
        }
      },

      // Section 7: Continuity Tracking
      continuity: {
        established_facts: [],
        named_elements: {
          character_names: contract.identity_anchors?.protagonist?.name
            ? [contract.identity_anchors.protagonist.name]
            : [],
          location_names: [contract.identity_anchors?.setting?.location_name].filter(Boolean),
          object_names: [],
          entity_names: []
        },
        promises: []
      },

      // State delta (for debugging)
      state_delta: {
        changes: []
      }
    };

    return this.state;
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Update state after a chunk
   * @param {Object} updates - Changes to apply
   * @param {number} chunkNumber - Which chunk just completed
   * @param {number} chunkWordCount - Words in the chunk
   * @returns {Object} - Updated state
   */
  updateAfterChunk(updates, chunkNumber, chunkWordCount) {
    if (!this.state) {
      throw new Error('State not initialized');
    }

    const changes = [];
    const previousState = JSON.parse(JSON.stringify(this.state));

    // Always update chunk tracking
    this.state.chunk_number = chunkNumber;
    this.state.last_updated = new Date().toISOString();
    this.state.narrative_state.current_chunk = chunkNumber;

    // Update word counts
    const prevWords = this.state.narrative_state.total_words_generated;
    this.state.narrative_state.total_words_generated += chunkWordCount;
    this.state.narrative_state.target_words_remaining -= chunkWordCount;
    changes.push(`words: ${prevWords} -> ${this.state.narrative_state.total_words_generated}`);

    // Apply provided updates
    if (updates.rules_discovered) {
      updates.rules_discovered.forEach(ruleNum => {
        const rule = this.state.rule_state.rules.find(r => r.rule_number === ruleNum);
        if (rule && rule.status === 'unknown') {
          rule.status = 'discovered';
          rule.discovered_in_chunk = chunkNumber;
          this.state.rule_state.rules_discovered++;
          this.state.rule_state.rules_remaining_unknown--;
          this.state.protagonist_state.knowledge.knows_rules.push(ruleNum);
          changes.push(`rule ${ruleNum} discovered`);
        }
      });
    }

    if (updates.rules_violated) {
      updates.rules_violated.forEach(ruleNum => {
        const rule = this.state.rule_state.rules.find(r => r.rule_number === ruleNum);
        if (rule) {
          if (rule.violated_in_chunk === null) {
            rule.violated_in_chunk = chunkNumber;
            this.state.rule_state.rules_violated++;
          }
          rule.violation_count++;
          rule.status = 'violated';
          changes.push(`rule ${ruleNum} violated (count: ${rule.violation_count})`);
        }
      });
    }

    if (updates.escalation_tier !== undefined) {
      const prevTier = this.state.escalation_state.escalation_tier;
      if (updates.escalation_tier > prevTier) {
        this.state.escalation_state.escalation_tier = updates.escalation_tier;
        this.state.escalation_state.escalation_events.push({
          chunk: chunkNumber,
          event: updates.escalation_event || 'Escalation increased',
          tier_before: prevTier,
          tier_after: updates.escalation_tier
        });
        changes.push(`escalation: tier ${prevTier} -> ${updates.escalation_tier}`);
      }
    }

    if (updates.contamination_level !== undefined) {
      const prevLevel = this.state.escalation_state.contamination_level;
      if (updates.contamination_level > prevLevel) {
        this.state.escalation_state.contamination_level = updates.contamination_level;
        changes.push(`contamination: ${prevLevel}% -> ${updates.contamination_level}%`);
      }
    }

    if (updates.protagonist_health) {
      const prev = this.state.protagonist_state.physical_condition.health;
      this.state.protagonist_state.physical_condition.health = updates.protagonist_health;
      changes.push(`health: ${prev} -> ${updates.protagonist_health}`);
    }

    if (updates.protagonist_location) {
      const prev = this.state.protagonist_state.physical_condition.location_in_setting;
      this.state.protagonist_state.physical_condition.location_in_setting = updates.protagonist_location;
      changes.push(`location: ${prev} -> ${updates.protagonist_location}`);
    }

    if (updates.protagonist_awareness) {
      const prev = this.state.protagonist_state.mental_condition.awareness;
      this.state.protagonist_state.mental_condition.awareness = updates.protagonist_awareness;
      changes.push(`awareness: ${prev} -> ${updates.protagonist_awareness}`);
    }

    if (updates.injuries) {
      updates.injuries.forEach(injury => {
        if (!this.state.protagonist_state.physical_condition.injuries.includes(injury)) {
          this.state.protagonist_state.physical_condition.injuries.push(injury);
          changes.push(`injury: ${injury}`);
        }
      });
    }

    if (updates.entities_appeared) {
      updates.entities_appeared.forEach(entity => {
        const existing = this.state.entity_state.entities.find(e => e.entity_name === entity.name);
        if (!existing) {
          this.state.entity_state.entities.push({
            entity_name: entity.name,
            entity_type: entity.type || 'unknown',
            first_appeared_chunk: chunkNumber,
            current_status: entity.status || 'observing',
            threat_level: entity.threat_level || 'ambient',
            last_action: entity.action || 'Appeared',
            triggered_by: entity.triggers || [],
            capabilities_revealed: entity.capabilities || []
          });
          this.state.entity_state.active_entity_count++;
          this.state.continuity.named_elements.entity_names.push(entity.name);
          changes.push(`entity appeared: ${entity.name}`);
        }
        this.state.entity_state.total_entity_appearances++;
      });
    }

    if (updates.established_facts) {
      updates.established_facts.forEach(fact => {
        this.state.continuity.established_facts.push({
          fact: fact.text,
          established_chunk: chunkNumber,
          category: fact.category || 'general'
        });
        changes.push(`fact established: ${fact.text.slice(0, 50)}...`);
      });
    }

    if (updates.promises) {
      updates.promises.forEach(promise => {
        this.state.continuity.promises.push({
          setup: promise.setup,
          established_chunk: chunkNumber,
          requires_payoff_by: promise.payoff_by || null,
          paid_off: false,
          payoff_chunk: null
        });
        changes.push(`promise: ${promise.setup.slice(0, 50)}...`);
      });
    }

    if (updates.promises_paid) {
      updates.promises_paid.forEach(setup => {
        const promise = this.state.continuity.promises.find(p => p.setup === setup && !p.paid_off);
        if (promise) {
          promise.paid_off = true;
          promise.payoff_chunk = chunkNumber;
          changes.push(`promise paid: ${setup.slice(0, 50)}...`);
        }
      });
    }

    if (updates.act_transition) {
      const prev = this.state.narrative_state.act_structure.current_act;
      this.state.narrative_state.act_structure.current_act = updates.act_transition;
      this.state.narrative_state.act_structure.act_started_chunk = chunkNumber;
      changes.push(`act: ${prev} -> ${updates.act_transition}`);
    }

    if (updates.scene_tension) {
      this.state.narrative_state.scene_state.scene_tension_level = updates.scene_tension;
    }

    if (updates.point_of_no_return) {
      this.state.escalation_state.point_of_no_return_reached = true;
      this.state.escalation_state.can_still_escape_cleanly = false;
      changes.push('point of no return reached');
    }

    // Record state delta
    this.state.state_delta = {
      chunk: chunkNumber,
      timestamp: new Date().toISOString(),
      changes: changes
    };

    return this.state;
  }

  /**
   * Extract state updates from chunk using AI
   * @param {Object} claudeClient - Claude API client
   * @param {string} chunkText - The chunk text
   * @param {Object} contract - The story contract
   * @param {number} chunkNumber - Which chunk
   * @returns {Object} - Extracted updates
   */
  async extractUpdatesFromChunk(claudeClient, chunkText, contract, chunkNumber) {
    const rules = contract.rule_system?.rules || [];
    const ruleDescriptions = rules.map(r => `Rule ${r.rule_number}: ${r.rule_text}`).join('\n');

    const prompt = `Analyze this story chunk and extract state changes.

RULES IN CONTRACT:
${ruleDescriptions}

CHUNK TEXT:
${chunkText}

Extract the following (return JSON):
{
  "rules_discovered": [array of rule numbers newly revealed to protagonist],
  "rules_violated": [array of rule numbers that were broken],
  "escalation_tier": number 1-5 (1=observation, 2=pressure, 3=threshold, 4=crisis, 5=resolution),
  "escalation_event": "description if escalation changed",
  "contamination_level": number 0-100,
  "protagonist_health": "healthy|injured|severely_injured|dying|transformed",
  "protagonist_location": "where in the setting",
  "protagonist_awareness": "unaware|suspicious|aware|terrified|resigned|compliant",
  "injuries": ["list of new injuries"],
  "entities_appeared": [{"name": "entity name", "type": "creature|force|presence|system", "status": "dormant|observing|active|pursuing|manifesting|sated", "threat_level": "ambient|present|immediate|imminent|engaged", "action": "what it did"}],
  "established_facts": [{"text": "fact that was established", "category": "setting|character|rule|entity|timeline|object"}],
  "promises": [{"setup": "something that needs payoff later", "payoff_by": chunk number or null}],
  "promises_paid": ["setups that were paid off in this chunk"],
  "act_transition": "setup|confrontation|crisis|resolution" (only if act changed),
  "scene_tension": "low|building|high|peak|aftermath",
  "point_of_no_return": true/false (did protagonist cross point of no return?)
}

Only include fields that changed. Return valid JSON only.`;

    try {
      const response = await claudeClient.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn(`State extraction failed: ${error.message}`);
    }

    // Return minimal updates if extraction fails
    return {
      escalation_tier: this.state?.escalation_state?.escalation_tier || 1
    };
  }

  /**
   * Load state from JSON
   */
  loadState(stateJson) {
    this.state = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson;
    return this.state;
  }

  /**
   * Export state as JSON
   */
  exportState() {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * Get compact state summary for chunk prompts
   */
  getCompactSummary() {
    if (!this.state) return null;

    return {
      chunk: this.state.narrative_state?.current_chunk,
      words_so_far: this.state.narrative_state?.total_words_generated,
      words_remaining: this.state.narrative_state?.target_words_remaining,
      escalation_tier: this.state.escalation_state?.escalation_tier,
      contamination: this.state.escalation_state?.contamination_level,
      rules_known: this.state.rule_state?.rules_discovered,
      rules_violated: this.state.rule_state?.rules_violated,
      protagonist_health: this.state.protagonist_state?.physical_condition?.health,
      protagonist_awareness: this.state.protagonist_state?.mental_condition?.awareness,
      current_act: this.state.narrative_state?.act_structure?.current_act,
      point_of_no_return: this.state.escalation_state?.point_of_no_return_reached,
      active_entities: this.state.entity_state?.active_entity_count
    };
  }

  /**
   * Get state for injection into chunk prompts
   */
  getPromptContext() {
    if (!this.state) return '';

    const summary = this.getCompactSummary();
    const knownRules = this.state.rule_state?.rules
      .filter(r => r.status !== 'unknown')
      .map(r => `- Rule ${r.rule_number}: ${r.rule_text} ${r.status === 'violated' ? '(VIOLATED)' : ''}`)
      .join('\n');

    const activeEntities = this.state.entity_state?.entities
      .filter(e => e.current_status !== 'dormant' && e.current_status !== 'sated')
      .map(e => `- ${e.entity_name}: ${e.current_status}, threat: ${e.threat_level}`)
      .join('\n');

    const recentFacts = this.state.continuity?.established_facts
      .slice(-5)
      .map(f => `- ${f.fact}`)
      .join('\n');

    return `
## CURRENT STATE (Chunk ${summary.chunk})

### Progress
- Words: ${summary.words_so_far} / ${summary.words_so_far + summary.words_remaining}
- Act: ${summary.current_act}
- Escalation Tier: ${summary.escalation_tier}/5
- Contamination: ${summary.contamination}%
${summary.point_of_no_return ? '- POINT OF NO RETURN CROSSED' : ''}

### Protagonist
- Health: ${summary.protagonist_health}
- Awareness: ${summary.protagonist_awareness}
- Location: ${this.state.protagonist_state?.physical_condition?.location_in_setting}

### Rules Known (${summary.rules_known}/${this.state.immutable_facts?.total_rule_count})
${knownRules || '(none yet)'}

### Active Entities (${summary.active_entities})
${activeEntities || '(none active)'}

### Recent Facts
${recentFacts || '(establishing setting)'}
`.trim();
  }
}

module.exports = StateTracker;
