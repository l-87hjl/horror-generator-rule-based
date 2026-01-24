# File Upload Guide

## Where to Upload Your Files

### For This Session (Run 001)

**Successful outputs** → `runs/run-001-independent-chunks/artifacts/`
- ZIP files from successful generations
- Screenshots showing it worked
- Notes about what settings you used

**Errors/failures** → `runs/run-001-independent-chunks/errors/`
- Screenshots of Render logs showing errors
- Error messages from the app
- Screenshots of UI when it failed
- Notes about what you tried

### For Old Files (Before 2026-01-24)

**Any old artifacts** → `runs/run-000-pre-naming-archive/artifacts/`
- Old successful story outputs
- Screenshots from earlier testing

**Any old errors** → `runs/run-000-pre-naming-archive/errors/`
- Old error screenshots
- Old timeout logs

## How to Name Files

Make file names descriptive:

**Good examples:**
- `success-6000-words-took-4min.zip`
- `timeout-15000-words-refinement-stage.png`
- `error-chunk-generation-scene-3.png`
- `render-logs-showing-timeout.png`

**Bad examples:**
- `screenshot.png` (too vague)
- `download.zip` (no context)
- `IMG_1234.png` (no info)

## What Info to Include

When uploading, create a quick `notes.txt` in the same folder with:
- Word count you tried
- When it happened (time/date)
- What stage failed (if known)
- How long it took before failing
- Any other settings you used

Example `notes.txt`:
```
File: timeout-12000-words.png
Date: 2026-01-24
Settings: 12,000 words, abandoned hospital
Failed at: Refinement round 1/3
Time: 8:42 elapsed before timeout
Notes: Got partial download with chunks saved
```

## Current Run Status

**Run 001** is focused on testing the new independent chunks architecture.

We need to know:
1. Does it work for small stories (~6,000 words)?
2. Does it work for medium stories (~10,000 words)?
3. Does it save chunks even when it times out?
4. Are partial artifacts downloadable?

Upload whatever you get - successes AND failures both help!
