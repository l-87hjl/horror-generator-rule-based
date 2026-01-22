# Quick Reference Guide

Essential information for using the Rule-Based Horror Story Generator.

## 📋 Common Commands

```bash
# Start server (production)
npm start

# Start with auto-reload (development)
npm run dev

# Install dependencies
npm install

# Health check
curl http://localhost:3000/api/health
```

## 🎯 Generation Parameters

### Word Count
- **Range**: 5,000 - 20,000 words
- **Recommended**: 10,000 words (good balance)
- **Quick Test**: 5,000 words (faster generation)

### Rule Count
- **Range**: 3 - 12 rules
- **Recommended**: 7 rules (manageable complexity)
- **Simple**: 3-5 rules (easier to maintain consistency)
- **Complex**: 8-12 rules (more interaction potential)

## 📍 Popular Location Types

| Location | Best For | Typical Entry |
|----------|----------|---------------|
| `desert_diner` | Service horror | new_hire, inherited_obligation |
| `warehouse_night_shift` | Industrial isolation | new_hire, proxy |
| `inherited_estate` | Family secrets | inherited_obligation, returner |
| `fire_watch_tower` | Extreme isolation | new_hire, proxy |
| `ferry_terminal` | Liminal spaces | new_hire, accidental_arrival |
| `hospital_night_wing` | Institutional horror | new_hire, proxy |
| `storage_facility` | Forgotten things | inherited_obligation, investigator |

## 🎭 Theme Recommendations

| Theme | Works Well With | Rule Focus |
|-------|----------------|------------|
| `service_and_servitude` | Hospitality locations | Customer service protocols |
| `contamination_and_corruption` | Industrial/research | Protective boundaries |
| `forgotten_obligation` | Inherited locations | Historical rules |
| `surveillance_and_visibility` | Institutional | Behavioral restrictions |
| `complicity_and_participation` | Service/employment | Harmful compliance |

## 🔄 Inflection Point Combos

### Classic Employment Horror
- Entry: `new_hire`
- Discovery: `explicit_list`
- Completeness: `complete_but_misunderstood`
- Violation: `escalation`
- Exit: `conditional_exit`

### Inherited Curse
- Entry: `inherited_obligation`
- Discovery: `fragmented_discovery`
- Completeness: `accidentally_incomplete`
- Violation: `contamination`
- Exit: `exit_through_completion`

### Trapped Investigator
- Entry: `investigator`
- Discovery: `environmental_discovery`
- Completeness: `complete_but_seemingly_arbitrary`
- Violation: `reclassification`
- Exit: `false_exit`

### Service Nightmare
- Entry: `new_hire`
- Discovery: `oral_tradition`
- Completeness: `deliberately_incomplete`
- Violation: `binding_intensification`
- Exit: `impossible_exit`

## 📊 Quality Score Targets

| Score | Meaning | Action |
|-------|---------|--------|
| 90-100 | Excellent | Ready to use |
| 75-89 | Good | Minor polish recommended |
| 60-74 | Acceptable | Review audit, consider refinement |
| 40-59 | Needs Work | Major revisions needed |
| 0-39 | Failed | Regenerate with simpler parameters |

## 🚨 Critical Failures to Avoid

The system automatically detects these but understanding helps:

1. **Rule Invariance Violation**
   - Rules changing meaning mid-story
   - Rules that stop applying arbitrarily

2. **Ticket Problem**
   - Objects solving problems they weren't set up to solve
   - Arbitrary power-ups appearing when convenient

3. **State Reset**
   - Violations having no permanent consequence
   - "Undo" mechanics after rule breaking

4. **Convenience Resolution**
   - Deus ex machina endings
   - Arbitrary solutions without setup

5. **Confabulation**
   - Inventing solutions rather than using setup
   - Making things up to resolve plot holes

## 🎨 Template Editing

### Quick Template Updates

**Add new location:**
```yaml
# In templates/v1/locations.yaml
new_location_name:
  category: "hospitality"
  isolation_level: "high"
  infrastructure: "basic"
  # ... see existing entries for full structure
```

**Add new theme:**
```yaml
# In templates/v1/thematic_elements.yaml
new_theme_name:
  description: "One-sentence description"
  core_tension: "Main conflict"
  rule_system_mappings:
    - "How rules embody this theme"
  # ... see existing entries for full structure
```

### Template Versioning

To create new template version:
```bash
# Copy current version
cp -r templates/v1 templates/v2

# Edit config.json to use new version
# "version": "v2"

# Make your changes in templates/v2/
```

## 🔧 Troubleshooting Quick Fixes

### Generation Stalls
```bash
# Check API key
cat config/.env | grep ANTHROPIC

# Verify connectivity
curl https://api.anthropic.com/v1/messages -I

# Restart server
pm2 restart horror-generator  # or Ctrl+C and npm start
```

### Low Quality Scores
Try these parameter adjustments:
- Reduce word count to 5000-7000
- Lower rule count to 3-5
- Use `explicit_list` for discovery
- Choose `escalation` for violation response
- Select clearer themes like `service_and_servitude`

### Template Errors
```bash
# Validate YAML syntax
npx js-yaml templates/v1/locations.yaml

# Check file permissions
chmod 644 templates/v1/**/*.yaml

# Clear any template cache (restart server)
```

## 📁 Output File Guide

| File | Purpose | When to Check |
|------|---------|---------------|
| `00_user_input_log.json` | Parameter record | Reproducing generation |
| `01_initial_generation.txt` | Raw story | Comparing to refined version |
| `02_revision_audit_report.md` | Quality analysis | Understanding failures |
| `03_revised_story.txt` | Final story | **This is your output** |
| `04_change_implementation_log.md` | Revision details | Understanding what was fixed |
| `05_error_identification_log.md` | Debug info | Troubleshooting issues |
| `06_story_metadata.json` | Metadata | Tracking generation stats |

## 🔍 Audit Report Sections

Quick reference for understanding audit reports:

1. **Rule Logic Audit** - Rules must be enumerable and invariant
2. **Object Ontology Check** - Objects have stable roles
3. **Escalation Integrity** - Violations compound, never reset
4. **Ritual Integrity** - Warning → Choice → Cost → Persistence
5. **Resolution Discipline** - Endings resolve through transformation
6. **Thematic Payoff** - Theme enacted through structure
7. **AI Failure Scan** - Coherence bias, confabulation, hand-waving

## 💡 Best Practices

### For Best Quality
1. Start with clear, specific parameters
2. Use simpler configurations for testing
3. Review audit reports to learn patterns
4. Iterate on parameters based on results
5. Keep template modifications documented

### For Performance
1. Use caching in production (templates are cached automatically)
2. Clean up old generated files regularly
3. Monitor API usage and costs
4. Consider shorter stories for faster generation

### For Maintenance
1. Version templates before major changes
2. Test template changes thoroughly
3. Document all modifications in CHANGELOG.md
4. Keep backups of working template versions

## 📞 Quick Help

**Something not working?**
1. Check `SETUP_GUIDE.md` for configuration
2. Review `README.md` for usage details
3. Check console output for error messages
4. Verify `.env` file has API key
5. Ensure all dependencies installed (`npm install`)

**Want to customize?**
1. Edit templates in `templates/v1/`
2. Modify `config/config.json` for system settings
3. See template files for structure examples

**Ready to deploy?**
1. See "Production Deployment" in `SETUP_GUIDE.md`
2. Use PM2 or similar process manager
3. Set up HTTPS reverse proxy
4. Configure automated backups

---

**Quick Start**: `npm start` → Open `http://localhost:3000` → Generate! 🕯️
