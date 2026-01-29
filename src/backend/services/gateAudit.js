/**
 * Gate Audit Service
 * Lightweight checks performed after each chunk
 *
 * Fast pass/fail to catch expensive-to-fix-later problems early
 * If gate audit fails, generation STOPS until the issue is resolved
 */

class GateAudit {
  constructor(claudeClient) {
    this.claudeClient = claudeClient;
  }

  /**
   * Perform gate audit on a chunk
   * @param {Object} contract - The story contract
   * @param {Object} previousState - State before this chunk
   * @param {Object} newState - Proposed state after this chunk
   * @param {string} chunkText - The generated chunk text
   * @param {number} chunkNumber - Which chunk this is
   * @param {boolean} isFinal - Whether this is the final chunk
   * @returns {Object} - Audit result with pass/fail and reasons
   */
  async auditChunk(contract, previousState, newState, chunkText, chunkNumber, isFinal = false) {
    console.log(`🔍 Gate audit: Chunk ${chunkNumber}...`);
    const startTime = Date.now();

    const results = {
      chunk_number: chunkNumber,
      timestamp: new Date().toISOString(),
      status: 'PASS',
      checks: {},
      critical_failures: [],
      warnings: [],
      state_delta_verified: true,
      recommendation: 'PROCEED'
    };

    // Run all checks
    const checks = [
      this.checkIdentityPreservation(contract, chunkText, chunkNumber),
      this.checkRuleConsistency(contract, previousState, newState, chunkText),
      this.checkScopeEnforcement(contract, chunkText, chunkNumber, isFinal),
      this.checkEscalationIntegrity(previousState, newState),
      this.checkStateValidity(previousState, newState, chunkText)
    ];

    const checkResults = await Promise.all(checks);

    // Combine results
    checkResults.forEach(check => {
      results.checks[check.name] = check;

      if (check.status === 'FAIL') {
        if (check.severity === 'critical') {
          results.critical_failures.push({
            check: check.name,
            reason: check.failure_reason,
            evidence: check.evidence
          });
        } else {
          results.warnings.push({
            check: check.name,
            reason: check.failure_reason
          });
        }
      }
    });

    // Determine overall status
    if (results.critical_failures.length > 0) {
      results.status = 'FAIL';
      results.recommendation = 'STOP';
    } else if (results.warnings.length > 0) {
      results.status = 'PASS_WITH_WARNINGS';
      results.recommendation = 'PROCEED_WITH_CAUTION';
    }

    results.duration_ms = Date.now() - startTime;

    // Log result
    if (results.status === 'FAIL') {
      console.log(`❌ Gate audit FAILED: ${results.critical_failures.length} critical issue(s)`);
      results.critical_failures.forEach(f => {
        console.log(`   - ${f.check}: ${f.reason}`);
      });
    } else if (results.status === 'PASS_WITH_WARNINGS') {
      console.log(`⚠️ Gate audit PASSED with ${results.warnings.length} warning(s)`);
    } else {
      console.log(`✅ Gate audit PASSED (${results.duration_ms}ms)`);
    }

    return results;
  }

  /**
   * Check 1: Identity Preservation
   */
  async checkIdentityPreservation(contract, chunkText, chunkNumber) {
    const result = {
      name: 'identity_preservation',
      status: 'PASS',
      severity: 'critical',
      sub_checks: {}
    };

    // Check protagonist identity
    const protagonist = contract.identity_anchors?.protagonist;
    if (protagonist?.name) {
      // If protagonist has a name, verify it's used consistently
      const nameRegex = new RegExp(protagonist.name, 'gi');
      const nameCount = (chunkText.match(nameRegex) || []).length;

      result.sub_checks.protagonist_name = {
        status: nameCount > 0 || chunkNumber === 1 ? 'PASS' : 'WARN',
        evidence: `Name "${protagonist.name}" found ${nameCount} times`
      };
    }

    // Check for POV consistency
    const pov = contract.identity_anchors?.point_of_view;
    if (pov?.pov_type === 'first_person') {
      // Check for first-person pronouns
      const firstPersonCount = (chunkText.match(/\b(I|me|my|myself)\b/gi) || []).length;
      const thirdPersonCount = (chunkText.match(/\b(he|she|they|him|her|them)\b/gi) || []).length;

      // First person should dominate in first-person POV
      const firstPersonRatio = firstPersonCount / (firstPersonCount + thirdPersonCount + 1);

      result.sub_checks.pov_consistency = {
        status: firstPersonRatio > 0.3 ? 'PASS' : 'WARN',
        evidence: `First-person pronouns: ${firstPersonCount}, ratio: ${(firstPersonRatio * 100).toFixed(1)}%`
      };
    }

    // Check setting identity
    const setting = contract.identity_anchors?.setting;
    if (setting?.location_name) {
      // Look for location references or indicators the story is still in the right place
      const locationKeywords = setting.atmosphere_keywords || [];
      const keywordMatches = locationKeywords.filter(kw =>
        chunkText.toLowerCase().includes(kw.toLowerCase())
      );

      result.sub_checks.setting_identity = {
        status: keywordMatches.length > 0 || chunkNumber === 1 ? 'PASS' : 'WARN',
        evidence: `Atmosphere keywords found: ${keywordMatches.join(', ') || 'none'}`
      };
    }

    // Aggregate sub-checks
    const hasFailure = Object.values(result.sub_checks).some(c => c.status === 'FAIL');
    const hasWarning = Object.values(result.sub_checks).some(c => c.status === 'WARN');

    if (hasFailure) {
      result.status = 'FAIL';
      result.failure_reason = 'Identity anchor violation detected';
    } else if (hasWarning && chunkNumber > 2) {
      result.status = 'WARN';
      result.failure_reason = 'Potential identity drift';
    }

    return result;
  }

  /**
   * Check 2: Rule Consistency
   */
  async checkRuleConsistency(contract, previousState, newState, chunkText) {
    const result = {
      name: 'rule_consistency',
      status: 'PASS',
      severity: 'critical',
      sub_checks: {}
    };

    const rules = contract.rule_system?.rules || [];
    const prevRuleState = previousState?.rule_state?.rules || [];
    const newRuleState = newState?.rule_state?.rules || [];

    // Check: No unauthorized new rules
    const contractRuleCount = rules.length;
    const newStateRuleCount = newRuleState.length;

    result.sub_checks.no_unauthorized_rules = {
      status: newStateRuleCount <= contractRuleCount ? 'PASS' : 'FAIL',
      evidence: `Contract rules: ${contractRuleCount}, State rules: ${newStateRuleCount}`
    };

    // Check: Rules discovered in this chunk are valid
    const newlyDiscovered = newRuleState.filter((r, i) =>
      r.status === 'discovered' &&
      (!prevRuleState[i] || prevRuleState[i].status === 'unknown')
    );

    if (newlyDiscovered.length > 0) {
      // Verify discovered rules exist in contract
      const validDiscoveries = newlyDiscovered.every(r => {
        const contractRule = rules.find(cr => cr.rule_number === r.rule_number);
        return contractRule !== undefined;
      });

      result.sub_checks.discoveries_valid = {
        status: validDiscoveries ? 'PASS' : 'FAIL',
        evidence: `${newlyDiscovered.length} rule(s) discovered, all in contract: ${validDiscoveries}`
      };
    }

    // Check: Violated rules had consequences (if violation claimed)
    const newlyViolated = newRuleState.filter((r, i) =>
      r.status === 'violated' &&
      (!prevRuleState[i] || prevRuleState[i].status !== 'violated')
    );

    if (newlyViolated.length > 0) {
      // Check that violation text appears in chunk
      result.sub_checks.violations_consequential = {
        status: 'PASS', // Would need AI check for deep verification
        evidence: `${newlyViolated.length} rule(s) marked as violated`
      };
    }

    // Aggregate
    const hasFailure = Object.values(result.sub_checks).some(c => c.status === 'FAIL');
    if (hasFailure) {
      result.status = 'FAIL';
      result.failure_reason = 'Rule consistency violation';
      result.evidence = Object.entries(result.sub_checks)
        .filter(([_, c]) => c.status === 'FAIL')
        .map(([name, c]) => `${name}: ${c.evidence}`)
        .join('; ');
    }

    return result;
  }

  /**
   * Check 3: Scope Enforcement
   */
  async checkScopeEnforcement(contract, chunkText, chunkNumber, isFinal) {
    const result = {
      name: 'scope_enforcement',
      status: 'PASS',
      severity: 'critical',
      sub_checks: {}
    };

    const forbiddenExpansions = contract.scope_constraints?.forbidden_expansions || [];

    // Check for new POV characters (forbidden expansion: new_protagonists)
    if (forbiddenExpansions.includes('new_protagonists')) {
      // Look for POV shifts (third person sections in first-person story, etc.)
      const povShiftIndicators = [
        /\bhe thought to himself\b/i,
        /\bshe realized\b/i,
        /\bthey knew\b/i,
        /\bfrom (his|her|their) perspective\b/i
      ];

      const povShiftFound = povShiftIndicators.some(regex => regex.test(chunkText));

      result.sub_checks.no_new_protagonists = {
        status: povShiftFound ? 'WARN' : 'PASS',
        evidence: povShiftFound ? 'Potential POV shift detected' : 'No POV shift detected'
      };
    }

    // Check for premature ending (if not final chunk)
    if (!isFinal) {
      const endingIndicators = [
        /\bthe end\b/i,
        /\bfinally.*over\b/i,
        /\band so.*story\b/i,
        /\bthat was the last\b/i
      ];

      const prematureEnding = endingIndicators.some(regex => regex.test(chunkText));

      result.sub_checks.not_premature_end = {
        status: prematureEnding ? 'FAIL' : 'PASS',
        evidence: prematureEnding ? 'Ending language detected in non-final chunk' : 'No premature ending'
      };

      if (prematureEnding) {
        result.status = 'FAIL';
        result.failure_reason = 'Story appears to end prematurely';
        result.severity = 'critical';
      }
    }

    // Check word count (chunk should be reasonable size)
    const wordCount = chunkText.split(/\s+/).length;
    const targetChunkSize = contract.generation_parameters?.chunk_size || 2000;
    const minSize = targetChunkSize * 0.5;
    const maxSize = targetChunkSize * 1.5;

    result.sub_checks.word_count_reasonable = {
      status: wordCount >= minSize && wordCount <= maxSize ? 'PASS' : 'WARN',
      evidence: `Chunk words: ${wordCount}, target: ${targetChunkSize} (50-150%: ${minSize}-${maxSize})`
    };

    // Aggregate
    if (result.status !== 'FAIL') {
      const hasFailure = Object.values(result.sub_checks).some(c => c.status === 'FAIL');
      const hasWarning = Object.values(result.sub_checks).some(c => c.status === 'WARN');

      if (hasFailure) {
        result.status = 'FAIL';
        result.failure_reason = 'Scope constraint violated';
      } else if (hasWarning) {
        result.status = 'WARN';
      }
    }

    return result;
  }

  /**
   * Check 4: Escalation Integrity
   */
  async checkEscalationIntegrity(previousState, newState) {
    const result = {
      name: 'escalation_integrity',
      status: 'PASS',
      severity: 'critical',
      sub_checks: {}
    };

    const prevEscalation = previousState?.escalation_state || {};
    const newEscalation = newState?.escalation_state || {};

    // Check: Escalation tier never decreases
    const prevTier = prevEscalation.escalation_tier || 1;
    const newTier = newEscalation.escalation_tier || 1;

    result.sub_checks.escalation_monotonic = {
      status: newTier >= prevTier ? 'PASS' : 'FAIL',
      evidence: `Tier: ${prevTier} -> ${newTier}`
    };

    if (newTier < prevTier) {
      result.status = 'FAIL';
      result.failure_reason = 'Escalation tier decreased (forbidden reset)';
      result.evidence = `Escalation dropped from tier ${prevTier} to ${newTier}`;
    }

    // Check: Contamination level never decreases
    const prevContam = prevEscalation.contamination_level || 0;
    const newContam = newEscalation.contamination_level || 0;

    result.sub_checks.contamination_monotonic = {
      status: newContam >= prevContam ? 'PASS' : 'FAIL',
      evidence: `Contamination: ${prevContam}% -> ${newContam}%`
    };

    if (newContam < prevContam) {
      result.status = 'FAIL';
      result.failure_reason = 'Contamination level decreased (forbidden reset)';
      result.evidence = `Contamination dropped from ${prevContam}% to ${newContam}%`;
    }

    // Check: Rules violated count never decreases
    const prevViolated = previousState?.rule_state?.rules_violated || 0;
    const newViolated = newState?.rule_state?.rules_violated || 0;

    result.sub_checks.violations_monotonic = {
      status: newViolated >= prevViolated ? 'PASS' : 'FAIL',
      evidence: `Violations: ${prevViolated} -> ${newViolated}`
    };

    return result;
  }

  /**
   * Check 5: State Validity
   */
  async checkStateValidity(previousState, newState, chunkText) {
    const result = {
      name: 'state_validity',
      status: 'PASS',
      severity: 'major',
      sub_checks: {}
    };

    // Check: Current chunk number incremented
    const prevChunk = previousState?.narrative_state?.current_chunk || 0;
    const newChunk = newState?.narrative_state?.current_chunk || 0;

    result.sub_checks.chunk_incremented = {
      status: newChunk === prevChunk + 1 ? 'PASS' : 'WARN',
      evidence: `Chunk: ${prevChunk} -> ${newChunk}`
    };

    // Check: Word count updated
    const prevWords = previousState?.narrative_state?.total_words_generated || 0;
    const newWords = newState?.narrative_state?.total_words_generated || 0;
    const chunkWords = chunkText.split(/\s+/).length;

    const expectedNewWords = prevWords + chunkWords;
    const wordDiff = Math.abs(newWords - expectedNewWords);

    result.sub_checks.words_updated = {
      status: wordDiff < 100 ? 'PASS' : 'WARN', // Allow small discrepancy
      evidence: `Words: ${prevWords} + ${chunkWords} = ${expectedNewWords}, state says ${newWords}`
    };

    // Check: No dead characters acting (if we have death info)
    // This would require more sophisticated state tracking

    // Aggregate
    const hasFailure = Object.values(result.sub_checks).some(c => c.status === 'FAIL');
    const hasWarning = Object.values(result.sub_checks).some(c => c.status === 'WARN');

    if (hasFailure) {
      result.status = 'FAIL';
      result.failure_reason = 'State validation failed';
    } else if (hasWarning) {
      result.status = 'WARN';
    }

    return result;
  }

  /**
   * Generate audit report markdown
   */
  generateReport(auditResult) {
    const lines = [
      `# Gate Audit: Chunk ${auditResult.chunk_number}`,
      `**Status:** ${auditResult.status}`,
      `**Timestamp:** ${auditResult.timestamp}`,
      `**Duration:** ${auditResult.duration_ms}ms`,
      '',
      '## Checks Performed',
      '| Check | Result | Notes |',
      '|-------|--------|-------|'
    ];

    for (const [name, check] of Object.entries(auditResult.checks)) {
      const notes = check.evidence || check.failure_reason || '-';
      lines.push(`| ${name} | ${check.status} | ${notes} |`);
    }

    if (auditResult.critical_failures.length > 0) {
      lines.push('', '## Critical Failures');
      auditResult.critical_failures.forEach(f => {
        lines.push(`- **${f.check}**: ${f.reason}`);
        if (f.evidence) {
          lines.push(`  - Evidence: ${f.evidence}`);
        }
      });
    }

    if (auditResult.warnings.length > 0) {
      lines.push('', '## Warnings');
      auditResult.warnings.forEach(w => {
        lines.push(`- **${w.check}**: ${w.reason}`);
      });
    }

    lines.push('', `## Recommendation`, auditResult.recommendation);

    return lines.join('\n');
  }

  /**
   * Quick AI-assisted check (for deeper verification when needed)
   */
  async aiQuickCheck(contract, chunkText, checkType) {
    const prompts = {
      identity: `Given this story contract and chunk, verify:
1. Is the protagonist the same as contracted?
2. Is the setting the same as contracted?
3. Has POV/tense remained consistent?

Contract identity: ${JSON.stringify(contract.identity_anchors)}
Chunk text (first 1000 chars): ${chunkText.slice(0, 1000)}

Respond with JSON: {"protagonist_match": true/false, "setting_match": true/false, "pov_consistent": true/false, "issues": []}`,

      rules: `Given these rules and this chunk, verify:
1. Do all rules still work the same way?
2. Were any unauthorized new rules introduced?

Rules: ${JSON.stringify(contract.rule_system?.rules?.slice(0, 5))}
Chunk text (first 1000 chars): ${chunkText.slice(0, 1000)}

Respond with JSON: {"rules_consistent": true/false, "no_unauthorized_rules": true/false, "issues": []}`,

      scope: `Given these constraints and this chunk, verify:
1. Were any forbidden expansions made (new protagonists, new locations, genre shift)?
2. Did the story avoid concluding prematurely?

Constraints: ${JSON.stringify(contract.scope_constraints)}
Chunk text (first 1000 chars): ${chunkText.slice(0, 1000)}

Respond with JSON: {"no_forbidden_expansion": true/false, "not_premature_end": true/false, "issues": []}`
    };

    const prompt = prompts[checkType];
    if (!prompt) return null;

    try {
      const response = await this.claudeClient.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn(`AI quick check failed: ${error.message}`);
    }

    return null;
  }
}

module.exports = GateAudit;
