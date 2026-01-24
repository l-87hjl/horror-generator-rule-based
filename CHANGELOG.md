# Changelog

All notable changes to the Rule-Based Horror Story Generator project.

## Format
- **Run ID**: Identifier for this session
- **Changes**: What was implemented
- **Issues**: Problems discovered
- **Solutions**: How issues were resolved
- **Status**: Working / Partial / Broken

---

## [Run 001] - Independent Chunks Architecture - 2026-01-24

### Changes
1. **Architectural Change: Independent Chunk Files (v2.0)**
   - Chunks now saved immediately to disk after generation
   - State extraction made non-blocking (optional)
   - Each chunk saved to `chunks/chunk_NN.md`
   - Created chunk manifest JSON with metadata
   - Nothing lost on failure - chunks persist on disk

2. **Timeout Increases**
   - API timeout: 2min → 5min → 10min (final)
   - Client stall warning: 3min → 5min
   - Client stall error: 5min → 10min
   - User message: "3-5 minutes" → "5-10 minutes"

3. **Comprehensive Diagnostic Logging**
   - Added `[CHECKPOINT]` prefix to all chunked generation logs
   - Log every step with timing information
   - Progress percentages and word counts
   - Enhanced error logging with stack traces

### Issues Discovered
1. **Timeout Too Aggressive**: Initial 2-minute timeout too short
2. **Refinement Step Slow**: Takes 6-8 minutes for complex stories
3. **State Extraction Blocking**: State extraction failures killed generation
4. **Silent Stalls**: User couldn't see errors without checking Render logs
5. **Invalid Timeout Parameter**: timeout not supported in messages.create()

### Solutions Implemented
1. **Increased Timeout**: 2min → 10min gives sufficient time
2. **Promise.race Wrapper**: Manual timeout enforcement
3. **Independent File Architecture**: Save chunks immediately
4. **Client-side Stall Detection**: Progressive warnings at 5min/10min
5. **Debug Logs Button**: View Render logs without interrupting generation
6. **Removed Invalid Parameters**: Removed timeout from messages.create()

### Status
- ✅ **Working**: Small stories (~6,000 words), single-call (≤12,000 words)
- ⚠️ **Partial**: Chunked generation works but slow
- ❌ **Known Issues**: Large stories >12,000 words still challenging

### Files Modified
- src/backend/services/checkpointManager.js
- src/backend/services/orchestrator.js
- src/backend/utils/outputPackager.js
- src/backend/api/claudeClient.js
- src/frontend/js/app.js
- src/frontend/index.html

### Commits
- 8d2b450 - ARCHITECTURE: Independent Chunk Files
- ce3e6b0 - DIAGNOSTIC: Comprehensive Logging
- 1396e53 - CRITICAL: Increase timeout 5min to 10min
- b57e87b - INCREASE TIMEOUT: 2min to 5min
- c6f9273 - FIX: Promise.race Wrapper

---

## [Run 000] - Pre-Naming Archive - Before 2026-01-24

### Summary
All work before implementing run naming system.

### Major Features
1. Phase 1-5 Implementation (state, chunks, rules, constraints)
2. Production deployment to Render
3. UX improvements (cost estimator, progress, partial recovery)

### Artifacts
Upload files to: runs/run-000-pre-naming-archive/

---

## Known Issues (Current)

### 🔴 Critical
- Large stories >12,000 words timeout during refinement
- Refinement takes 6-8 minutes, sometimes exceeds 10min

### 🟡 Medium
- State extraction failures (now non-blocking)
- Render cold starts add 50+ seconds

---

## Solutions Library

### Timeout Issues
**Solutions Tried**:
1. ❌ 2-minute timeout (too aggressive)
2. ❌ 5-minute timeout (not enough)
3. ✅ 10-minute timeout (current)

**If Still Timing Out**:
- Reduce chunk size (1500 → 1000 words)
- Skip refinement for chunked stories
- Optimize prompts
- Use Haiku for state extraction

### Silent Stalls
**Solution**: Client-side timer + debug logs button

### Lost Work
**Solution**: Independent chunk files + partial recovery

---

## Next Steps

1. Test Run 001 in production
2. Optimize performance (chunk size, refinement)
3. Future: Resume from chunks, parallel generation
