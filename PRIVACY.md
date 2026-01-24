# Privacy & Data Protection Policy

## 🔒 Critical: What Must NEVER Be Committed

This document outlines what content must be protected from public access in this repository.

## Protected Content Categories

### 1. User Testing Data & Work Product (runs/ folder)

**NEVER COMMIT:**
- ❌ Generated stories (user's work product)
- ❌ Error logs containing user data
- ❌ Screenshots from user's device
- ❌ PDFs uploaded by user
- ❌ Session notes containing debugging details
- ❌ Summary files with test results
- ❌ Any artifacts/ or errors/ folder contents

**CAN COMMIT:**
- ✅ UPLOAD_GUIDE.md (instructions only)
- ✅ README.md files (folder documentation, no data)

**Reason**: The `runs/` folder contains user's testing data, generated stories (copyrighted work product), screenshots that may contain sensitive info, and debugging logs.

### 2. Internal Documentation (For Claude Only)

**NEVER COMMIT:**
- ❌ SESSIONS.md (internal guide for Claude instances)
- ❌ SESSIONS_INTERNAL.md
- ❌ CLAUDE_NOTES.md
- ❌ Any notes.md or summary.md in runs/

**Reason**: These contain internal workflows, debugging strategies, and may reference user's specific issues or data.

### 3. Generated Content

**NEVER COMMIT:**
- ❌ Anything in generated/ folder
- ❌ ZIP files containing story outputs
- ❌ Story files (.txt, .md with story content)

**Reason**: Generated stories are user's copyrighted work product.

### 4. Copyrighted Material

**NEVER COMMIT:**
- ❌ Transcripts (any format)
- ❌ Third-party texts
- ❌ Reference materials from copyrighted sources
- ❌ Story corpora or examples

**Reason**: Copyright protection.

### 5. Sensitive Information

**NEVER COMMIT:**
- ❌ API keys (.env files)
- ❌ Credentials
- ❌ User's personal information
- ❌ Screenshots showing user's device/data

**Reason**: Security and privacy.

## Git Ignore Configuration

The `.gitignore` file is configured to automatically protect:

1. **runs/** folder (all contents except README.md files)
2. **SESSIONS.md** (Claude-only documentation)
3. **generated/** folder (all generated stories)
4. **Media files** (*.png, *.jpg, *.pdf anywhere in runs/)
5. **Environment files** (.env, credentials)
6. **Copyrighted materials** (transcripts, third-party texts)

## For Claude Instances

When working on this project:

### ✅ DO:
- Create README.md files with instructions (no data)
- Update CHANGELOG.md with changes (no user data)
- Update public README.md with status (general only)
- Commit code changes
- Commit template changes

### ❌ DON'T:
- Commit anything in runs/ except documentation files
- Commit SESSIONS.md (keep local only)
- Commit notes.md or summary.md files
- Commit user-uploaded content
- Reference specific user data in public docs

### When Creating Files:

Ask yourself:
1. Does this contain user's testing data? → **Don't commit**
2. Does this contain generated stories? → **Don't commit**
3. Does this contain user's screenshots/logs? → **Don't commit**
4. Is this instructions/documentation only? → **Safe to commit**
5. Is this code or templates? → **Safe to commit**

## Verification Before Commit

Before committing, check:

```bash
# See what's staged
git status

# Review actual changes
git diff --cached

# Look for protected content
git diff --cached | grep -i "session\|story\|error\|screenshot"
```

If you see user data, stories, or sensitive info → **UNSTAGE IT**:

```bash
git reset HEAD <file>
```

## If Sensitive Data Was Committed

If sensitive data was accidentally committed:

1. **Don't push** to remote if you haven't already
2. Remove from tracking: `git rm --cached <file>`
3. Update .gitignore to prevent future commits
4. Commit the removal
5. If already pushed, contact user immediately

## Summary

**Golden Rule**: If it contains user data, generated content, or internal debugging info → **Keep it local only**.

Only commit code, templates, and general documentation that contains no user-specific information.
