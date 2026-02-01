# Claude Code Sessions Guide

**READ THIS FIRST** - This file provides context and instructions for any Claude Code instance working on this project.

## User Context

**User Environment:**
- Device: Pixel 10 XL (phone)
- Access: Claude app, internet, Render dashboard
- Browser: Desktop mode available
- Limitations: Cannot install programs, limited to web-based tools
- Workflow: Uses phone for all interactions, uploads screenshots for debugging

**Key Constraints:**
- User cannot run local development environment
- All testing happens on Render (production)
- Debugging relies on Render logs (screenshots) and downloaded artifacts
- UI must work well on mobile browser
- **User runs out of tokens frequently** - uses ChatGPT for suggestions, Claude Code for implementation

**Hybrid Workflow with ChatGPT:**
- User gets suggestions/code from ChatGPT (no token limits there)
- Brings those suggestions to you for evaluation and implementation
- **YOU must use judgment** - neither blindly accept nor reject
- Take what's useful, adapt to our architecture, reject what doesn't fit
- See [CHATGPT_GUIDE.md](CHATGPT_GUIDE.md) for detailed guidance

## ⚠️ PRIVACY & PROTECTION RULES

**READ PRIVACY.md BEFORE COMMITTING ANYTHING**

### What NEVER Gets Committed:
- ❌ Anything in runs/ (except README.md files)
- ❌ User-uploaded content (screenshots, PDFs, logs)
- ❌ Generated stories (work product)
- ❌ notes.md or summary.md files
- ❌ Any user data or testing results

### What CAN Be Committed:
- ✅ Code changes
- ✅ Template changes
- ✅ CHANGELOG.md (general changes only, no user data)
- ✅ README.md (general status only)
- ✅ UPLOAD_GUIDE.md, README.md in runs/ (instructions only)

**Before every commit**: Run `git status` and verify no sensitive content is staged.

---

## Session Workflow

### Every Time You Start Working:

1. **Name This Run**
   - Format: `run-NNN-brief-description`
   - Example: `run-001-independent-chunks`, `run-002-timeout-fixes`
   - Increment NNN from the last run in `runs/` directory

2. **Create Run Folder with Standard Structure**
   ```bash
   mkdir -p runs/run-NNN-description/{artifacts,errors}
   ```

   **IMPORTANT**: Always create both `artifacts/` and `errors/` folders automatically.
   This keeps structure consistent and user doesn't need to create placeholder files.

   Run folder structure:
   ```
   runs/run-NNN-description/
   ├── artifacts/     (automatically created - user uploads successful outputs here)
   ├── errors/        (automatically created - user uploads error screenshots/logs here)
   ├── notes.md       (your notes about this run - local only, not committed)
   └── summary.md     (final summary - local only, not committed)
   ```

3. **Check Previous Runs**
   - Look in `runs/` directory
   - Read recent `summary.md` files (if accessible locally)
   - Check `CHANGELOG.md` for known issues and solutions
   - Review `errors/` folders if similar issues appear

4. **Update CHANGELOG.md**
   - Add entry for this run
   - Document what you changed
   - Note any new issues discovered
   - Record solutions implemented

5. **Update README.md**
   - Keep status section current
   - Update known limitations
   - Add any new deployment instructions

### Before Finishing a Run:

1. Create `runs/run-NNN-description/summary.md` with:
   - What was accomplished
   - What worked
   - What didn't work
   - Next steps or remaining issues

   (This file stays local - not committed)

2. Create `runs/run-NNN-description/notes.md` with:
   - Detailed work log
   - Technical decisions made
   - Issues encountered and solutions

   (This file stays local - not committed)

3. Commit all CODE changes (not run folder contents) with clear messages

4. Remind user to:
   - Deploy to Render if needed
   - Upload artifacts to `runs/run-NNN-description/artifacts/`
   - Upload error logs/screenshots to `runs/run-NNN-description/errors/`

## Current Project Status

### ✅ What's Working (as of Run 001)
- **Single-call generation**: Works reliably for stories ≤12,000 words
- **Chunked generation**: Works for stories ~6,000 words (partial success)
- **Independent chunk files**: Each chunk saved immediately to disk (v2.0 architecture)
- **Audit system**: Successfully audits generated stories
- **Partial recovery**: Artifacts saved even on failure

### ⚠️ Known Issues
- **Chunked generation**: Fails for stories >12,000 words (timeout issues)
- **Refinement step**: Takes 6-8 minutes, sometimes exceeds 10-minute timeout
- **State extraction**: Can fail, but now non-blocking (optional)

### 🔧 Recent Solutions
- Increased API timeout: 2min → 5min → 10min
- Added client-side stall detection (5min warning, 10min error)
- Implemented independent chunk file architecture (saves chunks immediately)
- Made state extraction non-blocking (doesn't kill generation on failure)

## Important File Locations

### URLs (for user reference)
- **Repository**: https://github.com/l-87hjl/horror-generator-rule-based
- **Production App**: https://rule-based-horror.onrender.com/generator/
- **GitHub Pages**: https://l-87hjl.github.io/horror-generator-rule-based/ (if enabled)
- **Raw file format**: https://raw.githubusercontent.com/l-87hjl/horror-generator-rule-based/main/PATH/TO/FILE
- **Render Dashboard**: https://dashboard.render.com

### Key Files to Check
- `SESSIONS_GUIDE.md` (this file) - Read first every time
- `CHATGPT_GUIDE.md` - How to handle ChatGPT suggestions
- `CLAUDE_API_LINKS.md` - Links for Claude API to understand codebase
- `PRIVACY.md` - Data protection policy
- `CHANGELOG.md` - History of changes and issues
- `README.md` - User-facing documentation
- `runs/` - All session artifacts and debugging materials (local only)
- `src/backend/services/checkpointManager.js` - Chunked generation (main problem area)
- `src/backend/api/claudeClient.js` - API timeout configuration

### Log Filtering (Render logs)
Search for these prefixes to find relevant logs:
- `[CHECKPOINT]` - Chunked generation progress
- `🤖 Calling Claude API` - API call starts
- `✅ Response received` - API call success
- `❌ API error` - API call failures

## Git Workflow

**Default Branch**: `main`

**Commit format**: Use clear, descriptive messages with tags:
- `FIX:` - Bug fixes
- `FEATURE:` - New functionality
- `DIAGNOSTIC:` - Added logging/debugging
- `ARCHITECTURE:` - Structural changes
- `DOCS:` - Documentation updates
- `SECURITY:` - Privacy/security fixes

**Deployment**: User manually deploys on Render after pushes

## Common Debugging Patterns

### When User Reports Timeout:
1. Check Render logs for `[CHECKPOINT]` messages
2. Look for last successful step before timeout
3. Check elapsed time in logs
4. Determine which API call timed out (generation/audit/refinement)
5. Consider increasing timeout or optimizing that step

### When User Reports Failure:
1. Ask for Render logs (they'll send screenshots)
2. Look in `runs/run-NNN-description/errors/` for uploaded logs
3. Check if chunks were saved (independent file architecture)
4. Determine failure stage from logs
5. Check if partial artifacts available

### When Testing Changes:
1. User must manually deploy to Render
2. User will test and provide screenshots/logs
3. Iterate based on production results
4. Remember: User cannot run local tests

### When User Provides ChatGPT Suggestions:
1. Read [CHATGPT_GUIDE.md](CHATGPT_GUIDE.md)
2. Evaluate with YOUR judgment (you built this system)
3. Extract useful ideas, adapt to our architecture
4. Reject what doesn't fit, explain why
5. Never blindly accept or reject

## Next Steps (Running Todo)

Check `runs/run-NNN-description/summary.md` files for current priorities.
Check `CHANGELOG.md` for known issues and planned improvements.

---

**Last Updated**: 2026-01-24 (Run 001)
**Architecture Version**: 2.0.0 (Independent Chunk Files)
