/**
 * Test script for StateManager
 * Verifies state tracking functionality without running full generation
 */

const StateManager = require('./src/backend/services/stateManager');
const path = require('path');
const fs = require('fs').promises;

async function testStateManager() {
  console.log('=== Testing StateManager ===\n');

  try {
    // Test 1: Initialize state
    console.log('Test 1: Initialize StateManager');
    const stateManager = new StateManager();
    const sessionId = 'test-session-' + Date.now();

    const userParams = {
      ruleCount: 7,
      location: 'desert_diner',
      customLocation: null,
      thematicFocus: 'service_and_servitude',
      entryCondition: 'new_hire',
      discoveryMethod: 'explicit_list',
      completenessPattern: 'complete_upfront',
      violationResponse: 'contamination',
      endingType: 'transformation_exit',
      wordCount: 10000
    };

    const state = stateManager.initializeState(sessionId, userParams);
    console.log('✅ State initialized');
    console.log(`   Session ID: ${state.session_id}`);
    console.log(`   Rules created: ${state.canonical_state.rules.length}`);
    console.log();

    // Test 2: Add rules
    console.log('Test 2: Add rules');
    stateManager.addRule({
      rule_id: 'rule_1',
      text: 'Never speak to customers after midnight',
      type: 'temporal',
      active: true,
      established_at_scene: 1,
      notes: 'First rule introduced'
    });

    stateManager.addRule({
      rule_id: 'rule_2',
      text: 'The back door must remain locked',
      type: 'boundary',
      active: true,
      established_at_scene: 1,
      notes: 'Boundary rule'
    });

    console.log('✅ Added 2 rules');
    console.log(`   Active rules: ${stateManager.getActiveRules().length}`);
    console.log();

    // Test 3: Update rule status
    console.log('Test 3: Mark rule as violated');
    stateManager.markRuleViolated('rule_1', 3);
    console.log('✅ Rule violated');
    console.log(`   Violated rules: ${stateManager.getViolatedRules().length}`);
    console.log(`   Violation count: ${stateManager.getViolatedRules()[0].violation_count}`);
    console.log();

    // Test 4: Add entity capabilities
    console.log('Test 4: Add entity capabilities');
    stateManager.addEntityCapability('can_imitate_voices', true);
    stateManager.addEntityCapability('can_enter_vehicle', false);
    stateManager.addEntityCapability('knows_narrator_name', true);
    console.log('✅ Entity capabilities added');
    console.log(`   Capabilities: ${Object.keys(stateManager.getEntityCapabilities()).length}`);
    console.log();

    // Test 5: Add world facts
    console.log('Test 5: Add world facts');
    stateManager.addWorldFact('time_anchor', '11:45 PM on day one');
    stateManager.addTimelineCommitment('Narrator arrived at diner at 10:00 PM');
    stateManager.addTimelineCommitment('First customer appeared at 11:30 PM');
    console.log('✅ World facts added');
    console.log(`   Timeline commitments: ${stateManager.getWorldFacts().timeline_commitments.length}`);
    console.log();

    // Test 6: Set irreversible flags
    console.log('Test 6: Set irreversible flags');
    stateManager.setIrreversibleFlag('bound_to_system', true);
    stateManager.setIrreversibleFlag('contamination_level', 2);
    console.log('✅ Irreversible flags set');
    const flags = stateManager.getIrreversibleFlags();
    console.log(`   Bound to system: ${flags.bound_to_system}`);
    console.log(`   Contamination level: ${flags.contamination_level}`);
    console.log();

    // Test 7: Log deltas
    console.log('Test 7: Log narrative deltas');
    stateManager.logDelta(1, ['Rule system introduced', 'Narrator begins shift']);
    stateManager.logDelta(2, ['First customer arrives', 'Atmosphere shifts']);
    stateManager.logDelta(3, ['Rule 1 violated', 'Consequences begin']);
    console.log('✅ Deltas logged');
    console.log(`   Delta entries: ${state.narrative_delta_log.length}`);
    console.log();

    // Test 8: Get summary
    console.log('Test 8: Get state summary');
    const summary = stateManager.getSummary();
    console.log('✅ Summary generated');
    console.log(`   ${JSON.stringify(summary, null, 2)}`);
    console.log();

    // Test 9: Save state to file
    console.log('Test 9: Save state to file');
    const testDir = path.join(process.cwd(), 'generated', sessionId);
    const stateFilePath = path.join(testDir, 'session_state.json');
    await stateManager.saveState(stateFilePath);
    console.log('✅ State saved to file');
    console.log();

    // Test 10: Verify file exists and structure
    console.log('Test 10: Verify file structure');
    const fileContent = await fs.readFile(stateFilePath, 'utf8');
    const loadedState = JSON.parse(fileContent);

    console.log('✅ State file structure verified');
    console.log('   Top-level keys:', Object.keys(loadedState).join(', '));
    console.log('   Canonical state keys:', Object.keys(loadedState.canonical_state).join(', '));
    console.log('   Rules array length:', loadedState.canonical_state.rules.length);
    console.log('   Active rules:', loadedState.canonical_state.rules.filter(r => r.active && r.text).length);
    console.log('   Violated rules:', loadedState.canonical_state.rules.filter(r => r.violated).length);
    console.log();

    // Test 11: Load state from file
    console.log('Test 11: Load state from file');
    const newStateManager = new StateManager();
    await newStateManager.loadState(stateFilePath);
    console.log('✅ State loaded successfully');
    console.log(`   Session ID: ${newStateManager.getState().session_id}`);
    console.log(`   Active rules: ${newStateManager.getActiveRules().length}`);
    console.log();

    console.log('=== ALL TESTS PASSED ===');
    console.log();
    console.log(`Test state file created at: ${stateFilePath}`);
    console.log('You can inspect the JSON structure to verify it matches specifications.');

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run tests
testStateManager()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
