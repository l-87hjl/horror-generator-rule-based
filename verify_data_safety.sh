#!/bin/bash
# Data Safety Verification Script
# Verifies that copyrighted materials are properly protected
# Part of the rule-based-horror-generator copyright protection system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track overall pass/fail
ALL_CHECKS_PASSED=0
WARNINGS_FOUND=0

echo ""
echo "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo "${BLUE}║  Data Safety Verification                         ║${NC}"
echo "${BLUE}║  Copyright Protection Status Check                ║${NC}"
echo "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Check 1: .gitignore exists and contains required protections
echo "📋 Check 1: .gitignore protection rules..."
if [ ! -f ".gitignore" ]; then
    echo "${RED}❌ FAIL: .gitignore file not found${NC}"
    ALL_CHECKS_PASSED=1
else
    REQUIRED_PATTERNS=(
        "data_private/"
        "transcripts/"
        "*.srt"
        "*.vtt"
    )

    MISSING_PATTERNS=()
    for pattern in "${REQUIRED_PATTERNS[@]}"; do
        if ! grep -q "$pattern" .gitignore; then
            MISSING_PATTERNS+=("$pattern")
        fi
    done

    if [ ${#MISSING_PATTERNS[@]} -eq 0 ]; then
        echo "${GREEN}✅ PASS: All required patterns found in .gitignore${NC}"
    else
        echo "${RED}❌ FAIL: Missing patterns in .gitignore:${NC}"
        printf '  %s\n' "${MISSING_PATTERNS[@]}"
        ALL_CHECKS_PASSED=1
    fi
fi
echo ""

# Check 2: data_private exists and is properly ignored
echo "📁 Check 2: data_private/ folder protection..."
if [ ! -d "data_private" ]; then
    echo "${YELLOW}⚠️  WARNING: data_private/ folder does not exist yet${NC}"
    echo "   This is normal for a fresh clone. Create it when you need it."
    WARNINGS_FOUND=1
else
    if git check-ignore data_private/ > /dev/null 2>&1; then
        echo "${GREEN}✅ PASS: data_private/ exists and is properly ignored by Git${NC}"
    else
        echo "${RED}❌ FAIL: data_private/ exists but is NOT ignored by Git!${NC}"
        echo "   This is a critical security issue - fix .gitignore immediately"
        ALL_CHECKS_PASSED=1
    fi
fi
echo ""

# Check 3: No forbidden files are tracked by Git
echo "🔍 Check 3: Git tracking check..."
TRACKED_FORBIDDEN=$(git ls-files | grep -E "(data_private/|transcripts/|\.srt$|\.vtt$|\.sbv$|copyrighted_examples/)" || true)

if [ -z "$TRACKED_FORBIDDEN" ]; then
    echo "${GREEN}✅ PASS: No forbidden patterns found in Git tracking${NC}"
else
    echo "${RED}❌ FAIL: Git is tracking forbidden files!${NC}"
    echo "   The following files should NOT be tracked:"
    echo "$TRACKED_FORBIDDEN" | sed 's/^/     /'
    echo ""
    echo "   To fix this:"
    echo "   git rm --cached <filename>"
    echo "   git commit -m 'Remove copyrighted materials from tracking'"
    ALL_CHECKS_PASSED=1
fi
echo ""

# Check 4: Pre-commit hook is installed and executable
echo "🪝 Check 4: Pre-commit hook installation..."
if [ ! -f ".git-hooks/pre-commit" ]; then
    echo "${RED}❌ FAIL: .git-hooks/pre-commit not found${NC}"
    ALL_CHECKS_PASSED=1
elif [ ! -x ".git-hooks/pre-commit" ]; then
    echo "${YELLOW}⚠️  WARNING: .git-hooks/pre-commit exists but is not executable${NC}"
    echo "   Fix with: chmod +x .git-hooks/pre-commit"
    WARNINGS_FOUND=1
else
    if [ -L ".git/hooks/pre-commit" ] || [ -f ".git/hooks/pre-commit" ]; then
        echo "${GREEN}✅ PASS: Pre-commit hook installed and executable${NC}"
    else
        echo "${YELLOW}⚠️  WARNING: Pre-commit hook exists but is not linked to .git/hooks/${NC}"
        echo "   Install with: ln -sf ../../.git-hooks/pre-commit .git/hooks/pre-commit"
        WARNINGS_FOUND=1
    fi
fi
echo ""

# Check 5: DATA_POLICY.md exists
echo "📄 Check 5: Policy documentation..."
if [ ! -f "DATA_POLICY.md" ]; then
    echo "${RED}❌ FAIL: DATA_POLICY.md not found${NC}"
    ALL_CHECKS_PASSED=1
else
    echo "${GREEN}✅ PASS: DATA_POLICY.md exists${NC}"
fi
echo ""

# Check 6: No forbidden files in staged area
echo "📦 Check 6: Staged files check..."
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
    echo "${GREEN}✅ PASS: No files currently staged${NC}"
else
    STAGED_FORBIDDEN=$(echo "$STAGED_FILES" | grep -E "(data_private/|transcripts/|\.srt$|\.vtt$)" || true)

    if [ -z "$STAGED_FORBIDDEN" ]; then
        echo "${GREEN}✅ PASS: Staged files do not contain forbidden patterns${NC}"
    else
        echo "${RED}❌ FAIL: Forbidden files are staged for commit!${NC}"
        echo "   Staged forbidden files:"
        echo "$STAGED_FORBIDDEN" | sed 's/^/     /'
        echo ""
        echo "   To fix: git reset HEAD <filename>"
        ALL_CHECKS_PASSED=1
    fi
fi
echo ""

# Check 7: Verify output/ and generated/ are ignored
echo "📂 Check 7: Output directories protection..."
OUTPUT_DIRS=("output" "generated")
for dir in "${OUTPUT_DIRS[@]}"; do
    if git check-ignore "$dir/" > /dev/null 2>&1; then
        echo "${GREEN}✅ PASS: $dir/ is properly ignored${NC}"
    else
        echo "${YELLOW}⚠️  WARNING: $dir/ is not ignored by Git${NC}"
        echo "   Add '$dir/' to .gitignore"
        WARNINGS_FOUND=1
    fi
done
echo ""

# Check 8: Test pre-commit hook (if installed)
echo "🧪 Check 8: Pre-commit hook functionality test..."
if [ -x ".git/hooks/pre-commit" ]; then
    # Create a test file in data_private to see if hook catches it
    TEST_DIR="data_private_test_$$"
    mkdir -p "$TEST_DIR"
    echo "test" > "$TEST_DIR/test.txt"

    # Try to stage it
    git add "$TEST_DIR/test.txt" 2>/dev/null || true

    # Check if it's staged
    if git diff --cached --name-only | grep -q "$TEST_DIR"; then
        # Try to commit (this should be blocked by hook)
        if git commit --dry-run -m "test" &>/dev/null; then
            echo "${RED}❌ FAIL: Pre-commit hook did not block test file${NC}"
            ALL_CHECKS_PASSED=1
        else
            # Hook working if commit would fail
            echo "${GREEN}✅ PASS: Pre-commit hook is functional (test blocked)${NC}"
        fi

        # Clean up staged file
        git reset HEAD "$TEST_DIR/test.txt" 2>/dev/null || true
    fi

    # Clean up test directory
    rm -rf "$TEST_DIR"
else
    echo "${YELLOW}⚠️  SKIP: Pre-commit hook not installed, cannot test${NC}"
    WARNINGS_FOUND=1
fi
echo ""

# Summary
echo "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo "${BLUE}║  Verification Summary                             ║${NC}"
echo "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

if [ $ALL_CHECKS_PASSED -eq 0 ] && [ $WARNINGS_FOUND -eq 0 ]; then
    echo "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo ""
    echo "Your repository is properly protected against accidental"
    echo "publication of copyrighted materials."
    echo ""
    exit 0
elif [ $ALL_CHECKS_PASSED -eq 0 ]; then
    echo "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}"
    echo ""
    echo "Critical protections are in place, but some optional"
    echo "enhancements should be addressed (see warnings above)."
    echo ""
    exit 0
else
    echo "${RED}❌ VERIFICATION FAILED${NC}"
    echo ""
    echo "Critical issues detected. Fix the failures above before"
    echo "adding any copyrighted materials or committing changes."
    echo ""
    echo "For help, see:"
    echo "  - DATA_POLICY.md"
    echo "  - data_private/README.md"
    echo ""
    exit 1
fi
