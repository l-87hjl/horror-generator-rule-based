# AGENT WORKSPACE CONTRACT

This directory defines the **agent-project-space** contract for the
`horror-generator-rule-based` repository.

Its purpose is to provide a stable, versioned workspace where ChatGPT (the agent)
can stage, validate, and prepare artifacts that would otherwise require:
- UI waiting
- repeated downloads/uploads
- long-running backend computation

The workspace is **not** a production runtime directory. It is a preflight and
postflight collaboration surface between the human operator and the agent.

---

## Core Principles

1. **Deterministic First**
   - Anything that can be planned, validated, or audited without calling Claude
     belongs here.

2. **Human-Readable by Default**
   - Files should be understandable without executing code.
   - Markdown and JSON are preferred.

3. **Execution Is Downstream**
   - Render + Claude consume artifacts from this workspace.
   - They do not decide structure; they execute it.

4. **Versioned, Inspectable, Reversible**
   - All changes are committed.
   - Diffs matter more than logs.

---

## Directory Structure

```
agent-project-space/
└── horror-generator-rule-based/
    ├── AGENT_WORKSPACE.md        # This contract
    ├── prompts/                  # Fully assembled LLM prompts
    │   └── generation_prompt_vX.md
    ├── plans/                    # Deterministic execution plans
    │   └── chunk_plan.json
    ├── audits/                   # Rule-based and preflight audits
    │   └── preflight_audit.md
    ├── docs/                     # Generated documentation artifacts
    │   ├── revision_audit_report.md
    │   └── change_log.md
    └── notes/                    # Rationale, assumptions, decisions
        └── rationale.md
```

Not all folders are required for every workflow. They exist to standardize
where artifacts *should* live when they are needed.

---

## What Belongs Here

### ✅ Allowed
- Prompt assembly and refinement
- Chunk planning and token budgeting
- Structural audits derived from templates and schemas
- Deterministic validation outputs
- Documentation drafts
- Failure analysis and recovery plans

### ❌ Not Allowed
- API keys or secrets
- Runtime-only artifacts (`generated/` output)
- Copyrighted third-party source texts
- Long-lived caches

---

## Relationship to Production Code

- Files in this workspace may be:
  - read manually
  - copied into runtime workflows
  - consumed by backend services

- They should **not**:
  - be required for the app to boot
  - introduce side effects

Think of this workspace as a **compiler front-end**, not a runtime dependency.

---

## Expected Workflow

1. Human and agent collaborate to produce artifacts here
2. Artifacts are reviewed via Git diff
3. Backend execution consumes the artifacts
4. Results inform the next iteration

This loop replaces UI blocking, retries, and manual file handling with
explicit, inspectable state.

---

## Status

This contract is intentionally minimal.
It should evolve only when a repeated pattern emerges.
