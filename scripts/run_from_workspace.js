#!/usr/bin/env node

/**
 * One-off execution script: run_from_workspace.js
 *
 * Purpose:
 * - Execute a single generation run using pre-staged agent workspace artifacts
 * - Bypass UI prompt assembly and dynamic chunk planning
 * - Write outputs into a declared run directory
 *
 * This script is intentionally minimal and safe to delete after Run 001.
 */

const fs = require('fs');
const path = require('path');
const Orchestrator = require('../src/backend/services/orchestrator');

// ---- Simple CLI arg parsing ----
const args = process.argv.slice(2);
function getArg(flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
}

const promptPath = getArg('--prompt');
const planPath = getArg('--plan');
const outputDir = getArg('--output');

if (!promptPath || !planPath || !outputDir) {
  console.error('Usage: node scripts/run_from_workspace.js --prompt <path> --plan <path> --output <dir>');
  process.exit(1);
}

// ---- Load artifacts ----
const prompt = fs.readFileSync(promptPath, 'utf8');
const chunkPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

// ---- Ensure output directory exists ----
fs.mkdirSync(outputDir, { recursive: true });

// ---- Initialize orchestrator ----
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set in environment');
  process.exit(1);
}

const orchestrator = new Orchestrator(apiKey, {
  model: chunkPlan.execution_constraints.model,
  maxRevisionRounds: 3,
  autoRefine: true
});

(async () => {
  try {
    console.log('Starting one-off run using agent workspace artifacts...');

    const result = await orchestrator.executeWorkflow({
      promptOverride: prompt,
      chunkPlanOverride: chunkPlan
    });

    // ---- Write outputs ----
    fs.writeFileSync(
      path.join(outputDir, '00_user_input_log.json'),
      JSON.stringify({ promptPath, planPath }, null, 2)
    );

    fs.writeFileSync(
      path.join(outputDir, '01_initial_generation.txt'),
      result.initialStory || ''
    );

    fs.writeFileSync(
      path.join(outputDir, '02_revision_audit_report.md'),
      result.auditReport || ''
    );

    fs.writeFileSync(
      path.join(outputDir, '03_revised_story.txt'),
      result.finalStory || ''
    );

    console.log('Run completed successfully. Outputs written to:', outputDir);
  } catch (err) {
    console.error('Run failed:', err);
    process.exit(1);
  }
})();
