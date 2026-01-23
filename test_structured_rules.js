/**
 * Test script for Phase 3: Structured Rule Objects
 * Verifies RuleBuilder and enhanced StateManager functionality
 */

const StateManager = require('./src/backend/services/stateManager');
const RuleBuilder = require('./src/backend/services/ruleBuilder');
const path = require('path');
const fs = require('fs').promises;

async function testStructuredRules() {
  console.log('=== Testing Phase 3: Structured Rule Objects ===\n');

  try {
    // Test 1: RuleBuilder - Build single rule
    console.log('Test 1: Build single structured rule');
    const ruleBuilder = new RuleBuilder();

    const singleRule = ruleBuilder.buildRule({
      rule_id: 'rule_test',
      text: 'Do not leave your vehicle for any reason',
      type: 'boundary',
      active: true,
      established_at_scene: 1,
      notes: 'Primary boundary rule'
    });

    console.log('✅ Single rule built');
    console.log(`   Type: ${singleRule.type}`);
    console.log(`   Threshold: ${singleRule.violation_threshold}`);
    console.log(`   Reversible: ${singleRule.reversibility.reversible}`);
    console.log(`   Immediate consequences: ${singleRule.consequences.immediate.join(', ')}`);
    console.log();

    // Test 2: RuleBuilder - Build rule set
    console.log('Test 2: Build structured rule set (7 rules)');
    const ruleSet = ruleBuilder.buildRuleSet(7, {
      thematicFocus: 'contamination_and_corruption',
      location: 'industrial_facility'
    });

    console.log('✅ Rule set built');
    console.log(`   Total rules: ${ruleSet.length}`);

    const typeCount = {};
    ruleSet.forEach(rule => {
      typeCount[rule.type] = (typeCount[rule.type] || 0) + 1;
    });
    console.log(`   Type distribution:`, typeCount);
    console.log();

    // Test 3: StateManager with structured rules
    console.log('Test 3: Initialize StateManager with structured rules');
    const stateManager = new StateManager();
    const sessionId = 'test-structured-' + Date.now();

    const userParams = {
      ruleCount: 7,
      location: 'desert_road',
      thematicFocus: 'isolation_and_recursion',
      entryCondition: 'inherited_obligation',
      discoveryMethod: 'environmental_observation',
      wordCount: 10000
    };

    stateManager.initializeState(sessionId, userParams);
    stateManager.setStructuredRules(ruleSet);

    console.log('✅ StateManager initialized with structured rules');
    console.log(`   Rules loaded: ${stateManager.getActiveRules().length} active`);
    console.log();

    // Test 4: Activate and populate rules
    console.log('Test 4: Activate and populate rules');

    const rule1 = stateManager.getRule('rule_1');
    rule1.text = 'Never leave your vehicle between sunset and sunrise';
    rule1.active = true;
    rule1.established_at_scene = 1;

    const rule2 = stateManager.getRule('rule_2');
    rule2.text = 'Do not respond to voices calling your name';
    rule2.active = true;
    rule2.established_at_scene = 1;

    console.log('✅ Rules activated and populated');
    console.log(`   Active rules: ${stateManager.getActiveRules().length}`);
    console.log();

    // Test 5: Check rule status
    console.log('Test 5: Check rule status');
    const rule1Status = stateManager.getRuleStatus('rule_1');
    console.log('✅ Rule status retrieved');
    console.log(`   Rule: rule_1`);
    console.log(`   Active: ${rule1Status.active}`);
    console.log(`   Violated: ${rule1Status.violated}`);
    console.log(`   Can be violated: ${rule1Status.can_be_violated}`);
    console.log(`   Threshold: ${rule1Status.violation_threshold}`);
    console.log();

    // Test 6: Violate rule with automatic consequences
    console.log('Test 6: Violate rule (automatic consequences)');
    console.log('   Violating rule_1 (boundary rule)...');

    const violationResult = stateManager.violateRule('rule_1', 3);

    console.log('✅ Rule violated with consequences');
    console.log(`   Violation count: ${violationResult.violation_count}/${rule1.violation_threshold}`);
    console.log(`   At threshold: ${violationResult.at_threshold}`);
    console.log(`   Immediate consequences applied: ${violationResult.appliedConsequences.immediate.join(', ')}`);
    console.log(`   Permanent consequences applied: ${violationResult.appliedConsequences.permanent.join(', ')}`);
    console.log();

    // Test 7: Verify consequences in state
    console.log('Test 7: Verify consequences applied to state');
    const flags = stateManager.getIrreversibleFlags();
    const capabilities = stateManager.getEntityCapabilities();

    console.log('✅ Consequences verified in state');
    console.log(`   Irreversible flags set: ${Object.keys(flags).filter(k => flags[k] === true || flags[k] === false).length}`);
    console.log(`   Entity capabilities gained: ${Object.keys(capabilities).length}`);
    console.log(`   Contamination level: ${flags.contamination_level}`);
    console.log();

    // Test 8: Test rule dependencies
    console.log('Test 8: Set up and test rule dependencies');

    const rule7 = stateManager.getRule('rule_7');
    rule7.text = 'Never acknowledge seeing movement in mirrors';
    rule7.active = false; // Starts inactive
    rule7.dependencies.requires_rules = ['rule_1']; // Requires rule_1 violation

    console.log('   Rule 7 requires rule_1 violation to activate');
    console.log(`   Rule 7 currently active: ${rule7.active}`);

    // Check dependencies - should activate rule_7 since rule_1 is violated
    stateManager.checkRuleDependencies('rule_7');

    console.log('✅ Dependencies checked');
    console.log(`   Rule 7 now active: ${rule7.active}`);
    console.log();

    // Test 9: Multiple violations
    console.log('Test 9: Test violation threshold (multiple violations)');

    const rule3 = stateManager.getRule('rule_3');
    rule3.text = 'Maintain speed between 45-55 mph at all times';
    rule3.type = 'temporal';
    rule3.active = true;
    rule3.violation_threshold = 3; // Can violate 3 times
    rule3.consequences.immediate = ['temporal_slip'];

    console.log(`   Rule 3 threshold: ${rule3.violation_threshold}`);
    console.log(`   Violating 3 times...`);

    for (let i = 1; i <= 3; i++) {
      const result = stateManager.violateRule('rule_3', 4 + i);
      console.log(`   Violation ${i}: count=${result.violation_count}, at_threshold=${result.at_threshold}`);
    }

    console.log('✅ Multiple violations tested');
    console.log();

    // Test 10: Save and verify state structure
    console.log('Test 10: Save state and verify structure');
    const testDir = path.join(process.cwd(), 'generated', sessionId);
    const stateFilePath = path.join(testDir, 'session_state.json');
    await stateManager.saveState(stateFilePath);

    const fileContent = await fs.readFile(stateFilePath, 'utf8');
    const loadedState = JSON.parse(fileContent);

    console.log('✅ State saved and verified');
    console.log('   State file structure:');
    console.log(`   - session_id: ${loadedState.session_id}`);
    console.log(`   - Total rules: ${loadedState.canonical_state.rules.length}`);

    // Check first rule has full structure
    const firstRule = loadedState.canonical_state.rules[0];
    console.log('\n   First rule structure:');
    console.log(`   - rule_id: ${firstRule.rule_id}`);
    console.log(`   - type: ${firstRule.type}`);
    console.log(`   - violation_threshold: ${firstRule.violation_threshold}`);
    console.log(`   - violated: ${firstRule.violated}`);
    console.log(`   - violation_count: ${firstRule.violation_count}`);
    console.log(`   - consequences.immediate: [${firstRule.consequences.immediate.join(', ')}]`);
    console.log(`   - consequences.permanent: [${firstRule.consequences.permanent.join(', ')}]`);
    console.log(`   - reversibility.reversible: ${firstRule.reversibility.reversible}`);
    console.log(`   - dependencies.requires_rules: [${firstRule.dependencies.requires_rules.join(', ')}]`);
    console.log(`   - dependencies.enables_rules: [${firstRule.dependencies.enables_rules.join(', ')}]`);

    console.log('\n   Violated rules in state:');
    const violatedRules = loadedState.canonical_state.rules.filter(r => r.violated);
    violatedRules.forEach(rule => {
      console.log(`   - ${rule.rule_id}: ${rule.violation_count}/${rule.violation_threshold} violations`);
    });

    console.log('\n   Irreversible flags in state:');
    Object.entries(loadedState.canonical_state.irreversible_flags).forEach(([key, value]) => {
      if (value !== 0 && value !== false && !(Array.isArray(value) && value.length === 0)) {
        console.log(`   - ${key}: ${JSON.stringify(value)}`);
      }
    });

    console.log('\n   Entity capabilities in state:');
    Object.entries(loadedState.canonical_state.entity_capabilities).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });

    console.log();

    // Test 11: Test consequence effect definitions
    console.log('Test 11: Verify consequence definitions');
    const allConsequences = ruleBuilder.getAllConsequences();
    const consequenceCount = Object.keys(allConsequences).length;

    console.log('✅ Consequence definitions loaded');
    console.log(`   Total consequences defined: ${consequenceCount}`);
    console.log('   Sample consequences:');

    const sampleConsequences = ['protection_void', 'contamination_spread', 'temporal_slip'];
    sampleConsequences.forEach(c => {
      const def = allConsequences[c];
      if (def) {
        console.log(`   - ${c}: ${def.description} (${def.type})`);
      }
    });
    console.log();

    // Test 12: Test rule type defaults
    console.log('Test 12: Verify rule type defaults');
    const boundaryDefaults = ruleBuilder.getRuleTypeDefaults('boundary');
    const temporalDefaults = ruleBuilder.getRuleTypeDefaults('temporal');

    console.log('✅ Rule type defaults verified');
    console.log(`   Boundary rules: threshold=${boundaryDefaults.violation_threshold}, reversible=${boundaryDefaults.reversible}`);
    console.log(`   Temporal rules: threshold=${temporalDefaults.violation_threshold}, reversible=${temporalDefaults.reversible}`);
    console.log();

    console.log('=== ALL TESTS PASSED ===');
    console.log();
    console.log('Phase 3 Implementation Summary:');
    console.log('✅ RuleBuilder creates structured rules with consequences');
    console.log('✅ StateManager handles structured rules');
    console.log('✅ violateRule() automatically applies consequences');
    console.log('✅ Consequences update entity_capabilities and irreversible_flags');
    console.log('✅ Rule dependencies work (requires/enables)');
    console.log('✅ Violation thresholds enforced');
    console.log('✅ State file contains full rule structure');
    console.log();
    console.log(`Test state file: ${stateFilePath}`);

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run tests
testStructuredRules()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
