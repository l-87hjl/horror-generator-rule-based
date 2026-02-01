# AGENT WORKSPACE CONTRACT

This directory defines the agent-project-space contract for the
horror-generator-rule-based repository.

It exists to stage, validate, and prepare artifacts that would otherwise
require UI waiting, repeated downloads/uploads, or long-running backend work.

---

## Principles

1. Deterministic first — planning and validation live here
2. Human-readable — markdown and JSON preferred
3. Execution is downstream — Render + Claude consume artifacts
4. Versioned and inspectable — diffs matter

---

## Structure

agent-project-space/horror-generator-rule-based/
├── AGENT_WORKSPACE.md
├── prompts/
├── plans/
├── audits/
└── docs/

---

## Usage

Artifacts in this directory are authoritative when referenced explicitly.
They must not contain secrets or runtime-only outputs.
