# Public Sample Data - Safe for Repository

✅ This folder contains **ONLY** original synthetic examples created specifically for this project.

## Purpose

Provide minimal examples that demonstrate:
- Expected input format for the story generator
- Structure of analysis outputs
- Template usage examples
- Testing the system without copyrighted materials

## Contents

### Synthetic Story Examples

- **`sample_rule_system_1.txt`** - Minimal synthetic horror story showing rule structure
- **`sample_rule_system_2.txt`** - Another synthetic example with different inflection points
- **`story_structure_example.json`** - Metadata format demonstration

### Format Examples

- **`transcript_format_example.csv`** - Shows expected CSV structure (synthetic data only)
- **`analysis_output_example.json`** - Shows expected analysis output format

## ⚠️ Important: What These Are NOT

These files are **NOT**:
- ❌ Real transcripts from external sources
- ❌ Copyrighted material from third parties
- ❌ Full examples from research materials
- ❌ Lightly modified versions of copyrighted content
- ❌ Excerpts from published horror stories

## ✅ What These ARE

These files **ARE**:
- ✅ Original creations for this project
- ✅ Minimal examples (not full stories)
- ✅ Safe to commit and distribute
- ✅ Format demonstrations only
- ✅ Synthetic data showing structure

## Guidelines for Adding Files Here

### Before Adding a File

Ask yourself:
1. **Did I create this specifically for this project?**
   - If NO → goes in `data_private/`
2. **Is it based on copyrighted material?**
   - If YES → goes in `data_private/`
3. **Is it a full story or just a minimal example?**
   - If full story → consider if it should be generated output instead
4. **Could someone claim copyright on this?**
   - If YES → goes in `data_private/`

### Creating Synthetic Examples

When creating examples for this folder:

**DO**:
- Create truly original content
- Keep it minimal (just enough to show format)
- Label clearly as "SYNTHETIC EXAMPLE"
- Make it obviously not a real story
- Focus on structure demonstration

**DON'T**:
- Copy from existing stories and modify slightly
- Use character names, settings, or plots from copyrighted works
- Create "complete" stories (those go in `/generated/`)
- Include anything that could be mistaken for copyrighted material

### Example: Good vs. Bad

**❌ BAD (Don't Do This)**:
```
# Based on the ferry story we analyzed
The ferry operator, John, stood at the dock...
[follows similar plot structure to copyrighted story]
```

**✅ GOOD (Do This)**:
```
# SYNTHETIC EXAMPLE - Format Demonstration Only
# Created 2026-01-22 for rule-based horror generator project
# This is NOT a real story, just a minimal structure example

Rule 1: Never speak to passengers who board after sunset
Rule 2: Count the passengers exactly once
Rule 3: [Example showing rule structure]
...
[Minimal text just showing format, obviously synthetic]
```

## File Naming Convention

Use descriptive names that make it clear these are examples:
- `sample_*.txt` - Synthetic story examples
- `example_*.json` - Format examples
- `template_*.yaml` - Template demonstrations
- `format_*.csv` - Structure demonstrations

## Verification

Before committing anything to this folder:

```bash
# 1. Verify it's original content you created
# 2. Verify it's minimal (not a full story)
# 3. Run the verification script
./verify_data_safety.sh

# 4. Check what you're committing
git status
git diff data_public_samples/

# 5. Ask yourself one more time:
#    "Did I create this? Is it synthetic? Is it minimal?"
```

## Current Files

### `sample_rule_system_1.txt`
- **Purpose**: Demonstrates basic rule-based structure
- **Content**: Minimal synthetic example (not a complete story)
- **Created**: 2026-01-22
- **Author**: Project team (original)

### `story_structure_example.json`
- **Purpose**: Shows metadata format for story analysis
- **Content**: Synthetic data structure only
- **Created**: 2026-01-22
- **Author**: Project team (original)

*(Add descriptions as you add files)*

## Using These Examples

### In Code

```javascript
// Load synthetic example for testing
const examplePath = path.join(__dirname, '..', 'data_public_samples', 'sample_rule_system_1.txt');
const syntheticStory = fs.readFileSync(examplePath, 'utf8');

// Use for format validation, not content analysis
validateStoryFormat(syntheticStory);
```

### In Documentation

These examples can be:
- Shown in README or guides
- Used in test cases
- Referenced in documentation
- Shared with users as format reference

### In Tests

```javascript
describe('Story Parser', () => {
  it('should parse synthetic example correctly', () => {
    const example = loadSyntheticExample('sample_rule_system_1.txt');
    const parsed = parseStory(example);
    expect(parsed.rules).toBeDefined();
  });
});
```

## License

All files in this folder are part of the rule-based-horror-generator project and are licensed under the same license as the project (MIT License).

These are original works created for this project and are safe to distribute.

## Questions?

### "Can I use these examples in my own project?"
Yes! They're MIT licensed (same as the project).

### "Can I add examples from other projects here?"
Only if:
1. You created them specifically for this project, OR
2. They're properly licensed (e.g., MIT, CC0) AND you include attribution

### "Should generated stories from our system go here?"
No. System-generated stories go in `/generated/` (gitignored).
Only put truly minimal format examples here.

## Related Documentation

- **DATA_POLICY.md** - Complete copyright protection policy
- **data_private/README.md** - Where copyrighted materials go
- **README.md** - Main project documentation

---

**Remember**: When in doubt, ask yourself: "Did I create this from scratch specifically for this project?"

If the answer is anything other than "Yes, definitely", it doesn't belong here.
