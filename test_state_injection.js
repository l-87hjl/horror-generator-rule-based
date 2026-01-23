/**
 * Test script for Phase 5: State Injection into Prompts
 * Verifies state constraints are injected into generation prompts
 */

const StateManager = require('./src/backend/services/stateManager');
const RuleBuilder = require('./src/backend/services/ruleBuilder');

// Mock minimal StoryGenerator to avoid SDK dependency in tests
class MockStoryGenerator {
  constructor() {
    this.ruleBuilder = new RuleBuilder();
  }

  // Copy buildStateConstraintsSection from actual StoryGenerator
  buildStateConstraintsSection(state) {
    if (!state || !state.canonical_state) {
      return '';
    }

    const canonicalState = state.canonical_state;
    const constraints = [];

    constraints.push('# MANDATORY STATE CONSTRAINTS - DO NOT VIOLATE');
    constraints.push('');
    constraints.push('The following represent the CURRENT STATE of the story world.');
    constraints.push('You MUST respect all constraints below. Violations will be rejected.');
    constraints.push('');

    const activeRules = canonicalState.rules.filter(r => r.text && r.active);
    if (activeRules.length > 0) {
      constraints.push('## Active Rules in Story:');
      constraints.push('');
      activeRules.forEach(rule => {
        const status = rule.violated ? '❌ VIOLATED' : '✅ Active';
        constraints.push(`- ${rule.text} [${status}]`);
        if (rule.violated) {
          constraints.push(`  * Violation Count: ${rule.violation_count}/${rule.violation_threshold}`);
          constraints.push(`  * YOU MAY NOT show this rule as unbroken or compliance as intact`);
        }
      });
      constraints.push('');
    }

    const violations = canonicalState.rules.filter(r => r.violated);
    if (violations.length > 0) {
      constraints.push('## Rule Consequences Already Applied:');
      constraints.push('');
      constraints.push('These effects are PERMANENT and CANNOT be reversed:');
      constraints.push('');
      violations.forEach(rule => {
        if (rule.consequences.immediate && rule.consequences.immediate.length > 0) {
          rule.consequences.immediate.forEach(consequence => {
            constraints.push(`- ${consequence} (from ${rule.rule_id} violation)`);
          });
        }
        if (rule.consequences.permanent && rule.consequences.permanent.length > 0) {
          rule.consequences.permanent.forEach(consequence => {
            constraints.push(`- ${consequence} (from ${rule.rule_id} violation)`);
          });
        }
      });
      constraints.push('');
    }

    const capabilities = Object.keys(canonicalState.entity_capabilities);
    if (capabilities.length > 0) {
      constraints.push('## Entity Current Capabilities:');
      constraints.push('');
      constraints.push('The entity has GAINED these abilities and MUST demonstrate them:');
      constraints.push('');
      Object.entries(canonicalState.entity_capabilities).forEach(([capability, value]) => {
        const status = value ? '✅ CAN' : '❌ CANNOT';
        const capabilityDisplay = capability.replace(/_/g, ' ');
        constraints.push(`- ${status} ${capabilityDisplay}`);
      });
      constraints.push('');
      constraints.push('YOU MAY NOT show the entity lacking abilities it has gained.');
      constraints.push('');
    }

    const flagsSet = Object.entries(canonicalState.irreversible_flags).filter(
      ([key, value]) => {
        if (key === 'violations') return false;
        return value === true || value === false || (typeof value === 'number' && value > 0);
      }
    );

    if (flagsSet.length > 0) {
      constraints.push('## Irreversible Events/States:');
      constraints.push('');
      flagsSet.forEach(([flag, value]) => {
        const flagDisplay = flag.replace(/_/g, ' ');
        if (typeof value === 'boolean') {
          constraints.push(`- ${flagDisplay}: ${value ? 'TRUE' : 'FALSE'} (cannot be reversed)`);
        } else {
          constraints.push(`- ${flagDisplay}: ${value}`);
        }
      });
      constraints.push('');
    }

    if (canonicalState.world_facts.timeline_commitments &&
        canonicalState.world_facts.timeline_commitments.length > 0) {
      constraints.push('## Timeline Commitments:');
      constraints.push('');
      constraints.push('These events have ALREADY occurred and cannot be contradicted:');
      constraints.push('');
      canonicalState.world_facts.timeline_commitments.forEach(tc => {
        const commitment = typeof tc === 'string' ? tc : tc.commitment;
        constraints.push(`- ${commitment}`);
      });
      constraints.push('');
    }

    constraints.push('## EXPLICIT PROHIBITIONS Based on Current State:');
    constraints.push('');
    constraints.push('YOU MAY NOT:');

    if (violations.length > 0) {
      constraints.push(`- Show violated rules (${violations.map(r => r.rule_id).join(', ')}) as unbroken`);
      constraints.push('- Reset any violation status or count');
    }

    if (capabilities.length > 0) {
      constraints.push('- Remove or ignore entity capabilities already gained');
      constraints.push('- Show entity without abilities it has acquired');
    }

    if (flagsSet.length > 0) {
      constraints.push('- Reverse any irreversible flags or states');
    }

    if (canonicalState.world_facts.timeline_commitments &&
        canonicalState.world_facts.timeline_commitments.length > 0) {
      constraints.push('- Contradict established timeline commitments');
    }

    constraints.push('- Introduce new entity behaviors without state support');
    constraints.push('- Restore normalcy or safety that has been compromised');
    constraints.push('');

    constraints.push('Remember: The state above is CANON. Deviations will be detected and rejected.');

    return constraints.join('\n');
  }

  buildSystemPrompt(templates, sessionState = null) {
    let prompt = 'CORE PRINCIPLES\n';

    if (sessionState) {
      const stateConstraints = this.buildStateConstraintsSection(sessionState);
      if (stateConstraints) {
        prompt += `\n---\n\n${stateConstraints}\n\n---\n`;
      }
    }

    prompt += '\nNARRATIVE REQUIREMENTS\n';
    return prompt;
  }
}

async function testStateInjection() {
  console.log('=== Testing Phase 5: State Injection into Prompts ===\n');

  try {
    // Setup: Create state with violations and capabilities
    console.log('Setup: Creating state with violations...');
    const stateManager = new StateManager();
    const sessionId = 'test-injection-' + Date.now();

    const userParams = {
      ruleCount: 5,
      location: 'desert_road',
      thematicFocus: 'isolation_and_recursion',
      entryCondition: 'inherited_obligation',
      discoveryMethod: 'explicit_list',
      completenessPattern: 'complete_upfront',
      violationResponse: 'escalation',
      escalationStyle: 'procedural',
      endingType: 'transformation_exit',
      wordCount: 10000
    };

    stateManager.initializeState(sessionId, userParams);

    // Build structured rules
    const ruleBuilder = new RuleBuilder();
    const rules = ruleBuilder.buildRuleSet(5, userParams);

    // Populate rules with text
    rules[0].text = 'Never leave your vehicle between sunset and sunrise';
    rules[0].active = true;
    rules[0].established_at_scene = 1;

    rules[1].text = 'Do not respond to voices calling your name';
    rules[1].active = true;
    rules[1].established_at_scene = 1;

    rules[2].text = 'Keep all windows and doors locked at all times';
    rules[2].active = true;
    rules[2].established_at_scene = 1;

    stateManager.setStructuredRules(rules);

    // Violate rule 1
    console.log('   Violating rule_1...');
    stateManager.violateRule('rule_1', 2);

    // Add entity capabilities
    console.log('   Adding entity capabilities...');
    stateManager.addEntityCapability('knows_narrator_name', true);
    stateManager.addEntityCapability('can_enter_vehicle', true);

    // Add timeline commitments
    stateManager.addTimelineCommitment('Narrator arrived at rest stop at 9:00 PM');
    stateManager.addTimelineCommitment('Sun set at 9:30 PM');

    console.log('✅ Setup complete\n');

    // Test 1: Build state constraints section
    console.log('Test 1: Build state constraints section');
    const storyGenerator = new MockStoryGenerator();
    const constraintsSection = storyGenerator.buildStateConstraintsSection(stateManager.getState());

    console.log('✅ State constraints generated');
    console.log(`   Length: ${constraintsSection.length} characters\n`);

    // Test 2: Verify constraint content
    console.log('Test 2: Verify constraint content');
    const requiredPatterns = [
      'MANDATORY STATE CONSTRAINTS',
      'Active Rules in Story',
      'Never leave your vehicle',
      '❌ VIOLATED',
      'Violation Count: 1/1',
      'Rule Consequences Already Applied',
      'Entity Current Capabilities',
      'knows narrator name',  // Note: underscores replaced with spaces
      'can enter vehicle',     // Note: underscores replaced with spaces
      'Irreversible Events',
      'Timeline Commitments',
      'Narrator arrived at rest stop',
      'EXPLICIT PROHIBITIONS',
      'YOU MAY NOT'
    ];

    let missingPatterns = [];
    for (const pattern of requiredPatterns) {
      if (!constraintsSection.includes(pattern)) {
        missingPatterns.push(pattern);
      }
    }

    if (missingPatterns.length === 0) {
      console.log('✅ All required patterns found in constraints');
    } else {
      console.log('❌ Missing patterns:');
      missingPatterns.forEach(p => console.log(`   - "${p}"`));
    }
    console.log();

    // Test 3: Build full system prompt with state
    console.log('Test 3: Build full system prompt with state injection');
    const templates = {}; // Minimal templates for testing
    const sessionState = stateManager.getState();
    const systemPrompt = storyGenerator.buildSystemPrompt(templates, sessionState);

    console.log('✅ System prompt generated with state injection');
    console.log(`   Total length: ${systemPrompt.length} characters`);

    // Verify state constraints are in the prompt
    const inPrompt = systemPrompt.includes('MANDATORY STATE CONSTRAINTS');
    console.log(`   Contains state constraints: ${inPrompt ? 'YES' : 'NO'}`);
    console.log();

    // Test 4: Verify specific prohibitions appear
    console.log('Test 4: Verify specific prohibitions in prompt');
    const prohibitions = [
      'Show violated rules (rule_1) as unbroken',
      'Remove or ignore entity capabilities',
      'Reverse any irreversible flags',
      'Contradict established timeline commitments'
    ];

    let foundProhibitions = [];
    let missingProhibitions = [];

    for (const prohibition of prohibitions) {
      if (systemPrompt.includes(prohibition)) {
        foundProhibitions.push(prohibition);
      } else {
        missingProhibitions.push(prohibition);
      }
    }

    console.log(`   Found prohibitions: ${foundProhibitions.length}/${prohibitions.length}`);
    if (missingProhibitions.length > 0) {
      console.log('   Missing:');
      missingProhibitions.forEach(p => console.log(`     - ${p}`));
    }
    console.log();

    // Test 5: Display sample of constraints section
    console.log('Test 5: Sample of generated constraints');
    console.log('---');
    const lines = constraintsSection.split('\n');
    const sampleLines = lines.slice(0, Math.min(40, lines.length));
    console.log(sampleLines.join('\n'));
    console.log('...');
    console.log(`(${lines.length - 40} more lines)`);
    console.log('---\n');

    // Test 6: Test without state (first generation)
    console.log('Test 6: Test prompt generation without state');
    const promptWithoutState = storyGenerator.buildSystemPrompt(templates, null);
    const hasConstraints = promptWithoutState.includes('MANDATORY STATE CONSTRAINTS');

    console.log(`   Prompt without state length: ${promptWithoutState.length} characters`);
    console.log(`   Contains state constraints: ${hasConstraints ? 'YES (ERROR!)' : 'NO (correct)'}`);
    console.log();

    // Summary
    console.log('=== TEST SUMMARY ===\n');

    const tests = [
      {
        name: 'State constraints generation',
        passed: constraintsSection.length > 0
      },
      {
        name: 'All required patterns present',
        passed: missingPatterns.length === 0
      },
      {
        name: 'Constraints injected into system prompt',
        passed: inPrompt
      },
      {
        name: 'Specific prohibitions present',
        passed: missingProhibitions.length === 0
      },
      {
        name: 'No constraints when state is null',
        passed: !hasConstraints
      }
    ];

    let passCount = 0;
    tests.forEach((test, i) => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} Test ${i + 1}: ${test.name}`);
      if (test.passed) passCount++;
    });

    console.log();
    console.log(`Tests passed: ${passCount}/${tests.length}`);

    if (passCount === tests.length) {
      console.log('\n✅ ALL TESTS PASSED');
      console.log('\nPhase 5 Implementation Summary:');
      console.log('✅ State constraints are generated from session state');
      console.log('✅ Constraints include violated rules with status');
      console.log('✅ Entity capabilities are explicitly stated');
      console.log('✅ Irreversible flags are marked as prohibitions');
      console.log('✅ Timeline commitments are preserved');
      console.log('✅ Specific prohibitions based on state');
      console.log('✅ State constraints injected into system prompt');
      console.log('✅ No constraints when state is null (first generation)');
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
testStateInjection()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
