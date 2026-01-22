# Data Policy - Copyright Protection

## ⚠️ CRITICAL RULE: No Copyrighted Materials in Repository

This repository **MUST NOT** contain:
- ❌ Full-text transcripts from third-party stories, videos, or podcasts
- ❌ Copyrighted example stories or story excerpts
- ❌ Analysis corpora from external sources without explicit permission
- ❌ Any material that could constitute redistribution of copyrighted work
- ❌ Full-text examples from research papers or books
- ❌ Third-party horror stories used for pattern analysis

## ✅ What IS Allowed

- ✅ Original synthetic examples created specifically for this project
- ✅ Short excerpts (under 100 words) for technical demonstration with proper attribution
- ✅ Templates and schemas we created
- ✅ Generated outputs from our own system (in local output/ only)
- ✅ Metadata and analysis results (word counts, structure patterns) without original text
- ✅ Code, configuration, and documentation
- ✅ Original architectural diagrams and flowcharts

## Local Development Setup

### Private Data Folder (Local Only)

Developers should maintain a `data_private/` folder locally for:
- Testing with copyrighted transcripts
- Analysis examples from research materials
- Reference materials for understanding patterns
- Third-party stories for testing edge cases

**This folder is:**
- ✅ Never committed to Git (.gitignore protection)
- ✅ Never included in build artifacts
- ✅ Never uploaded to any public location
- ✅ Never included in output packages
- ✅ Protected by pre-commit hooks

### Folder Structure

```
data_private/              # NEVER COMMITTED
├── README.md             # Local documentation only
├── transcripts/          # Story transcripts for analysis
│   ├── ferry_story.csv
│   ├── diner_story.csv
│   └── [other transcripts]
├── analysis_examples/    # Full-text examples from research
│   └── [research materials]
└── test_corpora/        # Third-party materials
    └── [reference stories]

data_public_samples/      # CAN BE COMMITTED (synthetic only)
├── README.md
└── [original synthetic examples]
```

### How to Set Up Locally

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd rule-based-horror
   ```

2. **Create private data folder**
   ```bash
   mkdir -p data_private/transcripts
   mkdir -p data_private/analysis_examples
   mkdir -p data_private/test_corpora
   ```

3. **Add your reference materials**
   - Place copyrighted materials ONLY in `data_private/`
   - Never add them anywhere else

4. **Verify protection is active**
   ```bash
   ./verify_data_safety.sh
   git status  # Should NOT show data_private/
   ```

5. **Install pre-commit hook**
   ```bash
   chmod +x .git-hooks/pre-commit
   ln -sf ../../.git-hooks/pre-commit .git/hooks/pre-commit
   ```

## Output Package Safety

Generated ZIP/RAR outputs **MUST** only contain:
- Files written during the current generation run
- Files explicitly in `/generated/` directory
- No files from `data_private/` or similar locations
- No paths outside the allowed output directory

### Enforcement in Code

The output packager implements **allowlist-based** safety:
- Only explicitly allowed paths can be packaged
- Forbidden paths are rejected even if accidentally specified
- Path traversal (`../`) is blocked
- Logs show any excluded files for transparency

## Synthetic Sample Data

Files in `data_public_samples/` must be:
- ✅ Original creations for this project
- ✅ Synthetic examples demonstrating format only
- ✅ Minimal (not full stories)
- ✅ Clearly labeled as synthetic

Files in `data_public_samples/` must NOT be:
- ❌ Copies of copyrighted materials
- ❌ Lightly modified versions of copyrighted content
- ❌ Full transcripts or stories from external sources

## Reproduction and Sharing

To allow others to reproduce results without copyrighted materials:
- ✅ Share code, templates, and schemas
- ✅ Provide synthetic sample data (original to this project)
- ✅ Document expected input format (not actual content)
- ✅ Share metadata/statistics without underlying text
- ❌ Do NOT share actual copyrighted transcripts or stories

## Enforcement Mechanisms

### Layer 1: .gitignore
- Prevents accidental staging of protected paths
- Blocks transcript file extensions (.srt, .vtt, .sbv)
- Blocks entire `data_private/` directory tree

### Layer 2: Pre-Commit Hook
- Scans staged files for forbidden patterns
- Blocks commit if violations detected
- Provides clear error messages

### Layer 3: CI/CD Pipeline
- GitHub Actions workflow checks all commits
- Fails build if forbidden files detected
- Final safety net before merge

### Layer 4: Code Review
- Human review required for any data file additions
- Verify source and licensing before accepting

### Layer 5: Output Packager
- Allowlist-based file inclusion
- Rejects files outside approved paths
- Logs exclusions for transparency

## What to Do If You Accidentally Commit Protected Data

### If Not Yet Pushed

```bash
# Unstage the files
git reset HEAD data_private/

# Remove from Git tracking (keeps local file)
git rm --cached -r data_private/

# Amend the commit to remove them
git commit --amend

# Verify they're gone
git log --stat
```

### If Already Pushed

**STOP AND ALERT TEAM IMMEDIATELY**

1. Do not make additional commits
2. Contact repository maintainer
3. History rewrite may be necessary:
   ```bash
   # Repository maintainer uses BFG Repo-Cleaner or git filter-branch
   # Then force-push new history
   # All contributors must re-clone
   ```

## Compliance Verification

### Before Every Commit

Run the verification script:
```bash
./verify_data_safety.sh
```

### Manual Check

```bash
# What is Git tracking?
git ls-files | grep -E "(data_private|transcripts|\.srt$|\.vtt$)"
# Should return NOTHING

# What is staged?
git diff --cached --name-only
# Should NOT include data_private/ or transcript files

# Is .gitignore working?
git check-ignore data_private/
# Should return: data_private/
```

## Copyright Attribution

If you DO include short excerpts (under 100 words) for technical demonstration:

1. **Use sparingly** - only when absolutely necessary
2. **Attribute properly** - include source, author, date
3. **Mark clearly** - wrap in comments indicating copyrighted material
4. **Seek permission** - if possible, get explicit permission
5. **Document** - note in commit message why excerpt is necessary

Example:
```python
# SHORT EXCERPT (87 words) from [Source Name]
# Copyright [Year] by [Author/Creator]
# Used under fair use for technical demonstration
# Full text not included per copyright policy
excerpt = """
[limited text here]
"""
```

## Questions and Clarifications

### "Can I commit analysis results?"
✅ Yes, if they don't include the original copyrighted text.
- Word counts: YES
- Structural patterns: YES
- Rule enumeration: YES
- Full story text: NO

### "Can I commit synthetic examples I created?"
✅ Yes, if they are truly original creations.
- Must not be lightly modified copyrighted content
- Should be clearly labeled as synthetic
- Should be minimal (format demonstration only)

### "Can I share generated stories from the system?"
✅ Yes, stories generated by YOUR use of the system are yours.
- System output belongs to you
- Templates are MIT licensed (or your chosen license)
- AI-generated content follows Anthropic's terms of service

### "What about metadata about copyrighted stories?"
✅ Yes, metadata without original text is generally safe.
- Structure: "Story has 7 rules, 3 violations, contamination ending"
- Analysis: "Rule 3 changes meaning at line 450"
- Full text: NO

## License Compatibility

This project's code is under [MIT License].

Generated stories using the system:
- Output belongs to the user running the generation
- Subject to Anthropic's terms of service for AI-generated content
- Templates used are MIT licensed

Copyrighted reference materials:
- Remain under their original copyright
- Are NOT distributed with this repository
- Must be obtained separately by users who need them

## Contact

Questions about data policy? Open an issue or contact maintainers.

**When in doubt, DON'T commit it. Better safe than sued.**
