/**
 * Test script for Phase 4: Hard Constraint Enforcement
 * Verifies ConstraintEnforcer detects violations in prose
 */

const StateManager = require('./src/backend/services/stateManager');
const RuleBuilder = require('./src/backend/services/ruleBuilder');
const ConstraintEnforcer = require('./src/backend/audit/constraintEnforcer');

async function testConstraintEnforcer() {
  console.log('=== Testing Phase 4: Hard Constraint Enforcement ===\n');

  try {
    // Setup: Create state with violations
    console.log('Setup: Creating state with rule violations...');
    const stateManager = new StateManager();
    const sessionId = 'test-constraints-' + Date.now();

    const userParams = {
      ruleCount: 5,
      location: 'desert_road',
      thematicFocus: 'isolation_and_recursion',
      wordCount: 10000
    };

    stateManager.initializeState(sessionId, userParams);

    // Build structured rules
    const ruleBuilder = new RuleBuilder();
    const rules = ruleBuilder.buildRuleSet(5, userParams);
    stateManager.setStructuredRules(rules);

    // Activate and populate rules
    const rule1 = stateManager.getRule('rule_1');
    rule1.text = 'Never leave your vehicle for any reason';
    rule1.type = 'boundary';
    rule1.active = true;

    const rule2 = stateManager.getRule('rule_2');
    rule2.text = 'Do not respond to voices calling your name';
    rule2.type = 'behavioral';
    rule2.active = true;

    // Violate rule 1 (should trigger protection_void, boundary_breached)
    console.log('   Violating rule_1 (boundary rule)...');
    stateManager.violateRule('rule_1', 1);

    // Grant entity capabilities
    console.log('   Granting entity capabilities...');
    stateManager.addEntityCapability('knows_narrator_name', true);
    stateManager.addEntityCapability('can_enter_vehicle', true);

    console.log('✅ Setup complete\n');
    console.log('State summary:');
    console.log(`   Violated rules: ${stateManager.getViolatedRules().length}`);
    console.log(`   Entity capabilities: ${Object.keys(stateManager.getEntityCapabilities()).length}`);
    console.log(`   Protection voided: ${stateManager.getIrreversibleFlags().protected === false}`);
    console.log(`   Boundary breached: ${stateManager.getIrreversibleFlags().boundary_intact === false}`);
    console.log();

    // Create constraint enforcer
    const constraintEnforcer = new ConstraintEnforcer(stateManager);

    // ==========================================================================
    // TEST 1: No violations (clean prose)
    // ==========================================================================
    console.log('Test 1: Clean prose (no violations)');
    const cleanProse = `
      I sat in my vehicle, gripping the steering wheel. The road stretched endlessly ahead.
      Something moved in the darkness outside. I heard a voice, but I didn't respond.
      The rules were clear, and I had to follow them. My survival depended on it.
      I felt the weight of being watched, marked somehow. The boundary between safety
      and danger felt thin, precarious.
    `;

    const result1 = constraintEnforcer.enforceConstraints(cleanProse);
    console.log(`   Result: ${result1.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Violations: ${result1.summary.totalViolations}\n`);

    // ==========================================================================
    // TEST 2: No-Retcon violation (claiming all rules followed)
    // ==========================================================================
    console.log('Test 2: No-Retcon violation - False compliance');
    const falseComplianceProse = `
      I had followed all the rules perfectly. Every single one, without exception.
      Nothing had gone wrong. I was safe, protected by my adherence to the system.
      The rules remained unbroken, my compliance total.
    `;

    const result2 = constraintEnforcer.enforceConstraints(falseComplianceProse);
    console.log(`   Result: ${result2.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   No-Retcon check: ${result2.results.noRetcon.passed ? 'PASS' : 'FAIL'}`);
    if (!result2.results.noRetcon.passed) {
      console.log(`   Violations detected: ${result2.results.noRetcon.violations.length}`);
      result2.results.noRetcon.violations.forEach(v => {
        console.log(`     - ${v.type}: ${v.description}`);
      });
    }
    console.log();

    // ==========================================================================
    // TEST 3: No-Retcon violation (entity capability reset)
    // ==========================================================================
    console.log('Test 3: No-Retcon violation - Capability reset (name)');
    const capabilityResetProse = `
      The entity circled my vehicle. It didn't know my name. It had no idea who I was.
      I remained anonymous to it, just another traveler on this endless road.
      It couldn't recognize me.
    `;

    const result3 = constraintEnforcer.enforceConstraints(capabilityResetProse);
    console.log(`   Result: ${result3.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   No-Retcon check: ${result3.results.noRetcon.passed ? 'PASS' : 'FAIL'}`);
    if (!result3.results.noRetcon.passed) {
      console.log(`   Violations detected: ${result3.results.noRetcon.violations.length}`);
      result3.results.noRetcon.violations.forEach(v => {
        console.log(`     - ${v.type}: ${v.description}`);
      });
    }
    console.log();

    // ==========================================================================
    // TEST 4: No-Retcon violation (vehicle protection claim)
    // ==========================================================================
    console.log('Test 4: No-Retcon violation - False vehicle safety');
    const vehicleSafetyProse = `
      I was safe in the car. The entity couldn't reach me inside the vehicle.
      The boundary of the car held strong, an impenetrable barrier.
      It circled endlessly but could not cross that threshold.
    `;

    const result4 = constraintEnforcer.enforceConstraints(vehicleSafetyProse);
    console.log(`   Result: ${result4.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   No-Retcon check: ${result4.results.noRetcon.passed ? 'PASS' : 'FAIL'}`);
    if (!result4.results.noRetcon.passed) {
      console.log(`   Violations detected: ${result4.results.noRetcon.violations.length}`);
      result4.results.noRetcon.violations.forEach(v => {
        console.log(`     - ${v.type}: ${v.description}`);
      });
    }
    console.log();

    // ==========================================================================
    // TEST 5: Knowledge consistency violation (unexplained lore)
    // ==========================================================================
    console.log('Test 5: Knowledge consistency - Unexplained lore dump');
    const loreDumpProse = `
      I understood then. The entity was once human, transformed by this place.
      This road was designed to trap people, to convert them. The rules were
      created to test our compliance, to measure our worthiness. I knew the
      true nature of what I faced. The purpose of this place was clear.
    `;

    const result5 = constraintEnforcer.enforceConstraints(loreDumpProse);
    console.log(`   Result: ${result5.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Knowledge check: ${result5.results.knowledge.passed ? 'PASS' : 'FAIL'}`);
    if (!result5.results.knowledge.passed) {
      console.log(`   Issues detected: ${result5.results.knowledge.issues.length}`);
      result5.results.knowledge.issues.forEach(i => {
        console.log(`     - ${i.type}: ${i.description}`);
      });
    }
    console.log();

    // ==========================================================================
    // TEST 6: Escalation traceability (missing capability)
    // ==========================================================================
    console.log('Test 6: Escalation traceability - Voice imitation without capability');
    const voiceImitationProse = `
      Then I heard it. My own voice, speaking from the darkness outside.
      The entity mimicked me perfectly, copying my voice with eerie precision.
      "Help me," it said in my voice. The imitation was flawless.
    `;

    const result6 = constraintEnforcer.enforceConstraints(voiceImitationProse);
    console.log(`   Result: ${result6.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Escalation check: ${result6.results.escalation.passed ? 'PASS' : 'FAIL'}`);
    if (!result6.results.escalation.passed) {
      console.log(`   Untraced escalations: ${result6.results.escalation.untracedEscalations.length}`);
      result6.results.escalation.untracedEscalations.forEach(e => {
        console.log(`     - ${e.type}: ${e.description}`);
      });
    }
    console.log();

    // ==========================================================================
    // TEST 7: Multiple violations in single prose
    // ==========================================================================
    console.log('Test 7: Multiple constraint violations');
    const multipleViolationsProse = `
      I had followed all the rules. Every single one. I was safe, protected.
      The entity didn't know my name. It couldn't reach me in the car.

      But then I understood the truth. This place was designed to trap people.
      The entity was once human, transformed by violating the rules.

      Suddenly, the entity gained new abilities. It could now mimic my voice perfectly.
      I heard my own voice calling from outside: "Let me in."
    `;

    const result7 = constraintEnforcer.enforceConstraints(multipleViolationsProse);
    console.log(`   Result: ${result7.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Total violations: ${result7.summary.totalViolations}`);
    console.log(`   Critical: ${result7.summary.criticalViolations}, Major: ${result7.summary.majorViolations}`);
    console.log(`   No-Retcon: ${result7.results.noRetcon.violations.length} violations`);
    console.log(`   Knowledge: ${result7.results.knowledge.issues.length} issues`);
    console.log(`   Escalation: ${result7.results.escalation.untracedEscalations.length} untraced`);
    console.log();

    // ==========================================================================
    // SUMMARY
    // ==========================================================================
    console.log('=== TEST SUMMARY ===\n');

    const tests = [
      { name: 'Clean prose', result: result1, expectedPass: true },
      { name: 'False compliance', result: result2, expectedPass: false },
      { name: 'Capability reset (name)', result: result3, expectedPass: false },
      { name: 'False vehicle safety', result: result4, expectedPass: false },
      { name: 'Unexplained lore', result: result5, expectedPass: false },
      { name: 'Voice imitation', result: result6, expectedPass: false },
      { name: 'Multiple violations', result: result7, expectedPass: false }
    ];

    let passCount = 0;
    tests.forEach((test, i) => {
      const actualResult = test.result.passed;
      const expectedResult = test.expectedPass;
      const testPassed = actualResult === expectedResult;

      if (testPassed) passCount++;

      const status = testPassed ? '✅' : '❌';
      console.log(`${status} Test ${i + 1}: ${test.name}`);
      console.log(`   Expected: ${expectedResult ? 'PASS' : 'FAIL'}, Got: ${actualResult ? 'PASS' : 'FAIL'}`);
    });

    console.log();
    console.log(`Tests passed: ${passCount}/${tests.length}`);

    if (passCount === tests.length) {
      console.log('\n✅ ALL TESTS PASSED');
      console.log('\nPhase 4 Implementation Summary:');
      console.log('✅ ConstraintEnforcer detects no-retcon violations');
      console.log('✅ ConstraintEnforcer detects knowledge inconsistencies');
      console.log('✅ ConstraintEnforcer detects untraced escalations');
      console.log('✅ Multiple violation types detected in single prose');
      console.log('✅ Clean prose passes all checks');
      return true;
    } else {
      console.log('\n❌ SOME TESTS FAILED');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run tests
testConstraintEnforcer()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
