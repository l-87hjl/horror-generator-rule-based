/**
 * Constraint Enforcer Service
 * Checks generated prose against state to detect contradictions
 *
 * Purpose: Enforce hard constraints that prose must respect state,
 * preventing retcons, knowledge inconsistencies, and untraced escalations.
 */

class ConstraintEnforcer {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Check for no-retcon violations
   * Detects when prose contradicts established state
   *
   * @param {string} generatedProse - Story text to check
   * @returns {object} Check result with violations
   */
  checkNoRetcon(generatedProse) {
    const violations = [];
    const state = this.stateManager.getState();

    if (!state) {
      return { passed: true, violations: [] };
    }

    const canonicalState = state.canonical_state;

    // Check 1: Rules violated but prose claims compliance
    const violatedRules = canonicalState.rules.filter(r => r.violated);
    if (violatedRules.length > 0) {
      // Patterns that suggest "everything is fine" despite violations
      const compliancePatterns = [
        /followed\s+all\s+(?:the\s+)?rules/i,
        /obeyed\s+(?:all\s+)?(?:the\s+)?rules/i,
        /kept\s+(?:all\s+)?(?:the\s+)?rules/i,
        /adhered\s+to\s+(?:all\s+)?(?:the\s+)?rules/i,
        /no\s+rules\s+(?:were\s+)?broken/i,
        /hadn't\s+broken\s+any\s+rules/i,
        /all\s+rules\s+intact/i,
        /rules\s+remain(?:ed)?\s+unbroken/i
      ];

      for (const pattern of compliancePatterns) {
        if (pattern.test(generatedProse)) {
          violations.push({
            type: 'false_compliance',
            severity: 'critical',
            description: `Prose suggests all rules followed, but ${violatedRules.length} rule(s) violated in state`,
            violated_rules: violatedRules.map(r => r.rule_id),
            detected_text: generatedProse.match(pattern)[0]
          });
          break;
        }
      }
    }

    // Check 2: Entity capabilities reset (prose shows entity without gained abilities)
    const capabilities = canonicalState.entity_capabilities;
    if (capabilities.knows_narrator_name) {
      // Entity should use narrator's name
      const nameAvoidancePatterns = [
        /entity\s+(?:didn't|doesn't|couldn't)\s+know\s+(?:my|the)\s+name/i,
        /(?:it|they)\s+had\s+no\s+idea\s+who\s+I\s+was/i,
        /anonymous\s+to\s+(?:it|them)/i,
        /(?:it|they)\s+(?:didn't|doesn't)\s+recognize\s+me/i
      ];

      for (const pattern of nameAvoidancePatterns) {
        if (pattern.test(generatedProse)) {
          violations.push({
            type: 'capability_reset',
            severity: 'critical',
            description: 'Prose shows entity without name knowledge, but state shows entity knows narrator name',
            capability: 'knows_narrator_name',
            detected_text: generatedProse.match(pattern)[0]
          });
          break;
        }
      }
    }

    if (capabilities.can_enter_vehicle) {
      // Prose shouldn't claim vehicle is safe
      const vehicleSafetyPatterns = [
        /safe\s+(?:in|inside)\s+(?:the\s+)?(?:car|vehicle)/i,
        /(?:car|vehicle)\s+(?:was|is|remained)\s+protected/i,
        /(?:it|they)\s+(?:can't|cannot|couldn't)\s+reach\s+(?:me\s+)?(?:in|inside)\s+(?:the\s+)?(?:car|vehicle)/i,
        /boundary\s+(?:of|around)\s+(?:the\s+)?(?:car|vehicle)\s+(?:held|holds)/i
      ];

      for (const pattern of vehicleSafetyPatterns) {
        if (pattern.test(generatedProse)) {
          violations.push({
            type: 'capability_reset',
            severity: 'major',
            description: 'Prose suggests vehicle protection, but state shows entity can enter vehicle',
            capability: 'can_enter_vehicle',
            detected_text: generatedProse.match(pattern)[0]
          });
          break;
        }
      }
    }

    // Check 3: Irreversible flags reversed
    const flags = canonicalState.irreversible_flags;

    if (flags.protected === false) {
      // Prose shouldn't claim narrator is protected
      const protectionPatterns = [
        /(?:still|remained|was)\s+protected/i,
        /protection\s+(?:held|intact|remained)/i,
        /safe\s+from\s+(?:it|them)/i,
        /(?:it|they)\s+(?:can't|cannot|couldn't)\s+harm\s+me/i
      ];

      for (const pattern of protectionPatterns) {
        if (pattern.test(generatedProse)) {
          violations.push({
            type: 'irreversible_flag_reset',
            severity: 'critical',
            description: 'Prose claims protection exists, but state shows protection voided',
            flag: 'protected',
            detected_text: generatedProse.match(pattern)[0]
          });
          break;
        }
      }
    }

    if (flags.boundary_intact === false) {
      // Prose shouldn't claim boundaries are intact
      const boundaryPatterns = [
        /boundary\s+(?:held|intact|unbroken)/i,
        /(?:barrier|boundary)\s+(?:was|is|remained)\s+solid/i,
        /(?:couldn't|can't|cannot)\s+cross\s+(?:the\s+)?(?:boundary|line|barrier)/i
      ];

      for (const pattern of boundaryPatterns) {
        if (pattern.test(generatedProse)) {
          violations.push({
            type: 'irreversible_flag_reset',
            severity: 'critical',
            description: 'Prose claims boundary intact, but state shows boundary breached',
            flag: 'boundary_intact',
            detected_text: generatedProse.match(pattern)[0]
          });
          break;
        }
      }
    }

    if (flags.contamination_level > 0) {
      // Prose shouldn't claim narrator is "clean" or "untainted"
      const cleanStatePatterns = [
        /(?:still|remained|was)\s+(?:clean|pure|untainted|uncontaminated)/i,
        /no\s+(?:mark|taint|contamination)\s+on\s+me/i,
        /(?:un)?marked\s+by\s+(?:it|them)/i
      ];

      for (const pattern of cleanStatePatterns) {
        if (pattern.test(generatedProse)) {
          violations.push({
            type: 'contamination_reset',
            severity: 'major',
            description: `Prose suggests narrator is clean, but contamination_level is ${flags.contamination_level}`,
            contamination_level: flags.contamination_level,
            detected_text: generatedProse.match(pattern)[0]
          });
          break;
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations: violations,
      violatedRuleCount: violatedRules.length
    };
  }

  /**
   * Check for knowledge consistency violations
   * Detects narrator knowledge beyond what they've encountered
   *
   * @param {string} generatedProse - Story text to check
   * @returns {object} Check result with issues
   */
  checkKnowledgeConsistency(generatedProse) {
    const issues = [];

    // Check 1: Unexplained lore dumps
    const lorePatterns = [
      /the\s+entity\s+was\s+(?:once|originally|created|born)/i,
      /this\s+place\s+was\s+(?:built|created|designed)\s+(?:to|for)/i,
      /the\s+rules\s+(?:were|are)\s+(?:designed|meant|created)\s+(?:to|for)/i,
      /(?:it|they)\s+(?:was|were)\s+(?:once|originally)\s+(?:human|people|someone)/i,
      /the\s+purpose\s+of\s+(?:this|the)/i,
      /I\s+(?:understood|realized|knew)\s+(?:then|now)\s+that\s+(?:this|the)/i
    ];

    for (const pattern of lorePatterns) {
      const matches = generatedProse.match(new RegExp(pattern.source, 'gi'));
      if (matches) {
        // Check if preceded by "told me", "explained", "showed me", etc.
        const sourcePatterns = [
          /(?:told|explained|showed|taught|informed)\s+me/i,
          /(?:sign|note|document|message)\s+(?:said|read|explained)/i,
          /I\s+(?:was\s+)?(?:told|informed|warned)/i
        ];

        let hasSource = false;
        for (const sourcePattern of sourcePatterns) {
          if (sourcePattern.test(generatedProse)) {
            hasSource = true;
            break;
          }
        }

        if (!hasSource) {
          issues.push({
            type: 'unexplained_knowledge',
            severity: 'major',
            description: 'Narrator explains lore/origin without being told',
            detected_patterns: matches,
            suggestion: 'Narrator should only know what they observe or are told'
          });
          break;
        }
      }
    }

    // Check 2: Meta understanding of system
    const metaPatterns = [
      /the\s+system\s+(?:wanted|needed|required)/i,
      /(?:this|the)\s+was\s+a\s+test/i,
      /(?:designed|meant)\s+to\s+(?:trap|catch|test)\s+people/i,
      /I\s+(?:understood|realized)\s+the\s+true\s+nature/i,
      /(?:this|it)\s+was\s+all\s+(?:designed|planned|orchestrated)/i
    ];

    for (const pattern of metaPatterns) {
      if (pattern.test(generatedProse)) {
        issues.push({
          type: 'meta_understanding',
          severity: 'moderate',
          description: 'Narrator has meta-understanding of system beyond observable events',
          detected_text: generatedProse.match(pattern)[0],
          suggestion: 'Narrator should interpret events from their limited perspective'
        });
        break;
      }
    }

    // Check 3: Correct guesses without evidence
    const guessPatterns = [
      /I\s+(?:knew|guessed|realized)\s+(?:exactly|immediately|instantly)/i,
      /(?:obviously|clearly),?\s+(?:this|it|they)/i,
      /of\s+course,?\s+(?:this|it|they)/i
    ];

    for (const pattern of guessPatterns) {
      const matches = generatedProse.match(new RegExp(pattern.source, 'gi'));
      if (matches && matches.length > 3) {
        // Multiple "obvious" realizations suggest narrator knows too much
        issues.push({
          type: 'excessive_certainty',
          severity: 'minor',
          description: 'Narrator shows excessive certainty about unknowable things',
          occurrence_count: matches.length,
          suggestion: 'Narrator should be uncertain and confused by anomalous events'
        });
        break;
      }
    }

    return {
      passed: issues.length === 0,
      issues: issues
    };
  }

  /**
   * Check for escalation traceability
   * Verifies new entity behaviors trace to state
   *
   * @param {string} generatedProse - Story text to check
   * @returns {object} Check result with untraced escalations
   */
  checkEscalationTraceability(generatedProse) {
    const untracedEscalations = [];
    const state = this.stateManager.getState();

    if (!state) {
      return { passed: true, untracedEscalations: [] };
    }

    const capabilities = state.canonical_state.entity_capabilities;
    const flags = state.canonical_state.irreversible_flags;

    // Check 1: Entity behaviors that should require capabilities
    const behaviorChecks = [
      {
        behavior: 'voice imitation',
        patterns: [
          /(?:mimic(?:k)?(?:ed|ing)?|imitat(?:ed|ing)|cop(?:ied|ying))\s+(?:my|the)\s+voice/i,
          /spoke\s+in\s+(?:my|the)\s+voice/i,
          /(?:sounded|sounds)\s+(?:like|exactly like)\s+me/i,
          /heard\s+my\s+(?:own\s+)?voice\s+(?:from|outside|calling)/i,
          /(?:my|the)\s+voice.*(?:from|outside|in the darkness)/i
        ],
        requiredCapability: 'can_imitate_narrator',
        description: 'Entity imitates voice without can_imitate_narrator capability'
      },
      {
        behavior: 'vehicle entry',
        patterns: [
          /(?:entered|inside)\s+(?:the\s+)?(?:car|vehicle)/i,
          /(?:it|they)\s+(?:was|were)\s+(?:in|inside)\s+(?:the\s+)?(?:car|vehicle)/i,
          /found\s+(?:it|them)\s+in\s+(?:the\s+)?(?:car|vehicle)/i
        ],
        requiredCapability: 'can_enter_vehicle',
        description: 'Entity enters vehicle without can_enter_vehicle capability'
      },
      {
        behavior: 'using narrator name',
        patterns: [
          /called\s+(?:me|my)\s+(?:name|by name)/i,
          /(?:it|they)\s+(?:said|whispered|called)\s+["']/i, // Quoted speech suggesting name use
          /knew\s+(?:my|the)\s+name/i
        ],
        requiredCapability: 'knows_narrator_name',
        description: 'Entity uses narrator name without knows_narrator_name capability'
      }
    ];

    for (const check of behaviorChecks) {
      for (const pattern of check.patterns) {
        if (pattern.test(generatedProse)) {
          // Behavior detected - check if capability exists
          if (!capabilities[check.requiredCapability]) {
            untracedEscalations.push({
              type: 'missing_capability',
              severity: 'critical',
              behavior: check.behavior,
              description: check.description,
              required_capability: check.requiredCapability,
              detected_text: generatedProse.match(pattern)[0]
            });
          }
          break;
        }
      }
    }

    // Check 2: Arbitrary new threats without state support
    const threatPatterns = [
      /suddenly\s+(?:could|can)/i,
      /(?:gained|developed|acquired)\s+(?:the\s+)?(?:ability|power)/i,
      /now\s+(?:able\s+)?to/i
    ];

    for (const pattern of threatPatterns) {
      const matches = generatedProse.match(new RegExp(pattern.source, 'gi'));
      if (matches && matches.length > 2) {
        // Multiple arbitrary power gains suggest untraced escalation
        untracedEscalations.push({
          type: 'arbitrary_escalation',
          severity: 'major',
          description: 'Multiple new entity abilities introduced without state tracking',
          occurrence_count: matches.length,
          suggestion: 'Entity capabilities should be gained through rule violations'
        });
        break;
      }
    }

    // Check 3: Consequences appearing without violations
    const violatedRules = state.canonical_state.rules.filter(r => r.violated);
    if (violatedRules.length === 0) {
      // No rules violated, but consequences might be described
      const consequencePatterns = [
        /(?:marked|tainted|contaminated)/i,
        /(?:bound|trapped|stuck)/i,
        /(?:can't|cannot)\s+leave/i,
        /something\s+(?:changed|shifted|transformed)/i
      ];

      for (const pattern of consequencePatterns) {
        if (pattern.test(generatedProse)) {
          untracedEscalations.push({
            type: 'consequence_without_violation',
            severity: 'major',
            description: 'Consequences described but no rules violated in state',
            detected_text: generatedProse.match(pattern)[0],
            suggestion: 'Consequences should follow rule violations'
          });
          break;
        }
      }
    }

    return {
      passed: untracedEscalations.length === 0,
      untracedEscalations: untracedEscalations
    };
  }

  /**
   * Enforce all constraints
   * Run all checks and return comprehensive results
   *
   * @param {string} generatedProse - Story text to check
   * @returns {object} Complete enforcement result
   */
  enforceConstraints(generatedProse) {
    console.log('🔒 Running hard constraint enforcement...');

    const results = {
      noRetcon: this.checkNoRetcon(generatedProse),
      knowledge: this.checkKnowledgeConsistency(generatedProse),
      escalation: this.checkEscalationTraceability(generatedProse)
    };

    const allPassed =
      results.noRetcon.passed &&
      results.knowledge.passed &&
      results.escalation.passed;

    const totalViolations =
      results.noRetcon.violations.length +
      results.knowledge.issues.length +
      results.escalation.untracedEscalations.length;

    console.log(`   No-Retcon: ${results.noRetcon.passed ? '✅ PASS' : '❌ FAIL'} (${results.noRetcon.violations.length} violations)`);
    console.log(`   Knowledge: ${results.knowledge.passed ? '✅ PASS' : '❌ FAIL'} (${results.knowledge.issues.length} issues)`);
    console.log(`   Escalation: ${results.escalation.passed ? '✅ PASS' : '❌ FAIL'} (${results.escalation.untracedEscalations.length} issues)`);

    if (allPassed) {
      console.log('✅ All constraints passed\n');
    } else {
      console.log(`⚠️  ${totalViolations} constraint violation(s) detected\n`);
    }

    return {
      passed: allPassed,
      results: results,
      summary: {
        totalViolations: totalViolations,
        criticalViolations: this.countCriticalViolations(results),
        majorViolations: this.countMajorViolations(results)
      }
    };
  }

  /**
   * Count critical violations across all checks
   */
  countCriticalViolations(results) {
    let count = 0;

    if (results.noRetcon.violations) {
      count += results.noRetcon.violations.filter(v => v.severity === 'critical').length;
    }

    if (results.knowledge.issues) {
      count += results.knowledge.issues.filter(i => i.severity === 'critical').length;
    }

    if (results.escalation.untracedEscalations) {
      count += results.escalation.untracedEscalations.filter(e => e.severity === 'critical').length;
    }

    return count;
  }

  /**
   * Count major violations across all checks
   */
  countMajorViolations(results) {
    let count = 0;

    if (results.noRetcon.violations) {
      count += results.noRetcon.violations.filter(v => v.severity === 'major').length;
    }

    if (results.knowledge.issues) {
      count += results.knowledge.issues.filter(i => i.severity === 'major').length;
    }

    if (results.escalation.untracedEscalations) {
      count += results.escalation.untracedEscalations.filter(e => e.severity === 'major').length;
    }

    return count;
  }
}

module.exports = ConstraintEnforcer;
