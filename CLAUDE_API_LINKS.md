# From Claude Code to Claude (API)

## Purpose

This document provides links to key files that Claude (API) needs to understand the Rule-Based Horror Story Generator system. Claude Code created and maintains this system.

**User Instructions:**
1. Share this file with Claude app for project context
2. Claude can reference these links to understand the codebase
3. Download specific files if Claude needs deeper analysis

---

## Essential Files for Understanding the System

### 1. Documentation & Status

**CHANGELOG.md** - Complete history of changes, issues, and solutions
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/CHANGELOG.md
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/CHANGELOG.md

**README.md** - Current status, features, and known issues
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/README.md
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/README.md

**PRIVACY.md** - Data protection policy (what never gets committed)
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/PRIVACY.md
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/PRIVACY.md

**SESSIONS_GUIDE.md** - Claude Code workflow guide
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/SESSIONS_GUIDE.md
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/SESSIONS_GUIDE.md

**CHATGPT_GUIDE.md** - How to handle ChatGPT suggestions
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/CHATGPT_GUIDE.md
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/CHATGPT_GUIDE.md

### 2. Core Backend Services

**checkpointManager.js** - Chunked generation with independent file storage (v2.0)
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/services/checkpointManager.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/services/checkpointManager.js
- **Key Feature**: Saves chunks immediately to disk, state extraction optional

**orchestrator.js** - Main workflow coordinator
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/services/orchestrator.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/services/orchestrator.js

**storyGenerator.js** - Story generation service
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/services/storyGenerator.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/services/storyGenerator.js

**claudeClient.js** - Claude API wrapper with timeout handling
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/api/claudeClient.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/api/claudeClient.js
- **Key Feature**: 10-minute timeout with Promise.race wrapper

### 3. Frontend

**index.html** - Main UI
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/frontend/index.html
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/frontend/index.html

**app.js** - Frontend logic with stall detection
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/frontend/js/app.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/frontend/js/app.js
- **Key Feature**: Client-side stall warnings at 5min/10min

**tokenEstimator.js** - Client-side cost calculator
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/frontend/js/tokenEstimator.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/frontend/js/tokenEstimator.js

### 4. Audit & Refinement

**revisionAuditor.js** - Structural audit system
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/audit/revisionAuditor.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/audit/revisionAuditor.js

**storyRefiner.js** - Story refinement based on audit
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/services/storyRefiner.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/services/storyRefiner.js

**constraintEnforcer.js** - Hard constraint validation
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/audit/constraintEnforcer.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/audit/constraintEnforcer.js

### 5. Output & Packaging

**outputPackager.js** - ZIP creation with copyright protection
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/src/backend/utils/outputPackager.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/src/backend/utils/outputPackager.js

### 6. Server & Configuration

**server.js** - Express server with authentication
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/server.js
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/server.js

**package.json** - Dependencies and scripts
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/package.json
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/package.json

### 7. Templates (Critical for Understanding Story Generation)

**revision_checklist.yaml** - Audit criteria
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/templates/v1/schemas/revision_checklist.yaml
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/templates/v1/schemas/revision_checklist.yaml

**rule_grammar.yaml** - Rule structure definitions
- GitHub: https://github.com/l-87hjl/rule-based-horror/blob/claude/horror-story-generator-DTAVx/templates/v1/schemas/rule_grammar.yaml
- Raw: https://raw.githubusercontent.com/l-87hjl/rule-based-horror/claude/horror-story-generator-DTAVx/templates/v1/schemas/rule_grammar.yaml

---

## Files NOT Accessible (Local Only, Privacy Protected)

These files exist in testing sessions but are in .gitignore:

- **runs/** folder contents - User testing data, artifacts, errors (all private)
- **generated/** folder - Generated stories (user work product)
- **notes.md** / **summary.md** - Session notes (local only)

**If Claude needs these:** User can download and share specific files as needed.

---

## Quick Reference

### Repository Root
https://github.com/l-87hjl/rule-based-horror/tree/claude/horror-story-generator-DTAVx

### Production App
https://rule-based-horror.onrender.com/generator/

### Directory Structure
```
src/
├── backend/
│   ├── api/              # Claude API integration
│   ├── audit/            # Revision audit system
│   ├── services/         # Core services (generator, refiner, orchestrator)
│   └── utils/            # Utilities (templates, packaging)
└── frontend/
    ├── index.html        # Main UI
    ├── css/             # Styling
    └── js/              # Frontend logic (app, tokenEstimator)

templates/
└── v1/                  # Template system
    ├── inflection_points/  # Story structure
    └── schemas/            # Validation schemas

runs/                    # Testing artifacts (LOCAL ONLY)
generated/               # Output storage (LOCAL ONLY)
```

---

## How to Use This Document

**For User:**
1. Share this document with Claude app for project context
2. Claude can reference links to understand codebase
3. If Claude needs protected files, download and share those specifically

**For Claude (API):**
1. Read this document first to understand project structure
2. Use GitHub/Raw links to access public code files
3. Ask user to download protected files if needed
4. Reference CHANGELOG.md for recent changes and known issues
5. Use these links to understand implementation before suggesting changes

---

**Last Updated**: 2026-01-24
**Current Run**: 001
**Architecture**: Independent Chunk Files (v2.0)
**Branch**: claude/horror-story-generator-DTAVx
