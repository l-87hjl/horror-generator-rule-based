# Run 000: Pre-Naming Archive

This folder contains artifacts from before the run naming system was implemented (before 2026-01-24).

## Purpose

Upload files here that relate to the early development period, including:

### Artifacts to Upload
- Successful story outputs (ZIP files)
- Error screenshots from Render logs
- Any partial outputs received
- Screenshots showing what was working/broken

### What This Helps With
- Understanding what worked in early versions
- Comparing behavior before/after architectural changes
- Diagnosing recurring issues
- Seeing evolution of the system

## Folder Structure

```
run-000-pre-naming-archive/
├── artifacts/    ← Put successful outputs here
│   ├── session-XXXXX.zip
│   └── ...
├── errors/       ← Put error logs/screenshots here
│   ├── error-timeout-XXXXX.png
│   └── ...
└── README.md     ← This file
```

## Context

Before Run 001, the system had these characteristics:

**Working:**
- Single-call generation for small stories
- Basic audit and refinement
- Production deployment on Render

**Issues:**
- Silent stalls (19+ minutes with no feedback)
- No API timeouts configured
- State extraction failures killed entire generation
- All work lost on failure
- No chunked generation for large stories

**Improvements Made in Run 001:**
- Independent chunk file architecture (v2.0)
- 10-minute API timeout
- Client-side stall detection
- Non-blocking state extraction
- Partial artifact recovery

## How to Use This Folder

1. **If you have old artifacts**, upload them to `artifacts/` or `errors/`
2. **Name files descriptively**: `success-6k-words.zip`, `timeout-15k-words.png`, etc.
3. **Add a note** if the file shows something important (create a `notes.txt`)

This helps future Claude instances understand what was working and what wasn't in the early days.
