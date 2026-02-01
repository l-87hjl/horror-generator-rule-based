# Agent Context

## Project Overview

This is the **Rule-Based Horror Story Generator** - a web-based procedural horror story generator that creates, refines, and validates rule-based horror stories following established structural principles.

## Boot Configuration

- **Boot Repo**: l-87hjl/agent-boot
- **Boot Ref**: main
- **Boot Version**: 1.0.0
- **Contract Repo**: l-87hjl/ai-agent-contract
- **Contract Version**: 1.0.0

## Workspace Structure

| Directory | Purpose |
|-----------|---------|
| `inputs/` | User drops new story requests here |
| `outputs/` | Agent writes generated stories here |
| `audits/` | Story quality checks and reviews |
| `scratch/` | Temporary files (gitignored) |

## Memory Files

| File | Purpose |
|------|---------|
| `agent/STATE.json` | Current agent state and metrics |
| `agent/TODO.json` | Task queue for pending work |
| `agent/CONTEXT.md` | This context file |
| `agent/last-run.log` | Log from most recent execution |
| `CHANGELOG.md` | History of all changes |

## Core Principles

The horror story generator follows these structural principles:

1. **Rule Logic**: Rules behave as laws, not suggestions
2. **Object Ontology**: Objects have single, stable roles
3. **Escalation Integrity**: Violations escalate, never reset
4. **Ritual Integrity**: Warning, meaningful choice, persistent cost
5. **Resolution Discipline**: Endings resolve through cost/transformation

## Initialized

2026-02-01
