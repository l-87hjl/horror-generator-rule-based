# Rule-Based Horror Story Generator

A web-based procedural horror story generator that creates, refines, and validates rule-based horror stories following established structural principles. The system maintains strict rule integrity, performs post-generation revision audits, and outputs comprehensive documentation of the entire process.

## 🎯 Overview

This system generates structurally sound rule-based horror fiction by:

1. **Generating** stories using Claude API with strict structural constraints
2. **Auditing** generated stories against a comprehensive revision checklist
3. **Refining** stories with surgical fixes to address structural failures
4. **Packaging** complete documentation including all intermediate outputs

### Core Principles

- **Rule Logic**: Rules behave as laws, not suggestions, remaining invariant throughout
- **Object Ontology**: Important objects have single, stable roles (symbolic OR operative)
- **Escalation Integrity**: Violations escalate, transform, or contaminate—never reset
- **Ritual Integrity**: Stories require warning, meaningful choice, and persistent cost
- **Resolution Discipline**: Endings resolve through cost/transformation, not convenience

## 📁 Project Structure

```
rule-based-horror/
├── config/                    # Configuration files
│   ├── config.json           # System configuration
│   └── .env.example          # Environment variables template
├── templates/                 # Modular template system (versioned)
│   └── v1/                   # Version 1 templates
│       ├── inflection_points/ # Story structure templates
│       │   ├── entry_conditions.yaml
│       │   ├── rule_discovery.yaml
│       │   ├── rule_completeness.yaml
│       │   ├── rule_interactions.yaml
│       │   ├── violation_responses.yaml
│       │   └── exit_conditions.yaml
│       ├── schemas/          # Validation and grammar schemas
│       │   ├── revision_checklist.yaml
│       │   └── rule_grammar.yaml
│       ├── locations.yaml    # Location database
│       └── thematic_elements.yaml
├── src/
│   ├── backend/
│   │   ├── api/              # Claude API integration
│   │   │   └── claudeClient.js
│   │   ├── audit/            # Revision audit system
│   │   │   └── revisionAuditor.js
│   │   ├── services/         # Core services
│   │   │   ├── storyGenerator.js
│   │   │   ├── storyRefiner.js
│   │   │   └── orchestrator.js
│   │   └── utils/            # Utilities
│   │       ├── templateLoader.js
│   │       └── outputPackager.js
│   └── frontend/
│       ├── index.html        # Web interface
│       ├── css/styles.css    # Styling
│       └── js/app.js         # Frontend logic
├── generated/                 # Output directory (created at runtime)
├── docs/                      # Additional documentation
├── server.js                  # Express server
├── package.json              # Dependencies
└── README.md                 # This file
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **Anthropic API Key** (Claude API access)

### Installation

1. **Clone or navigate to the repository:**
   ```bash
   cd rule-based-horror
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp config/.env.example config/.env
   ```

4. **Add your Anthropic API key to `config/.env`:**
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

6. **Open your browser:**
   Navigate to `http://localhost:3000`

### Development Mode

For auto-reload during development:
```bash
npm run dev
```

## 📖 Usage Guide

### Web Interface

1. **Configure Story Parameters:**
   - Set target word count (5,000-20,000 words)
   - Choose location type or provide custom setting
   - Select inflection points (entry, discovery, completeness, etc.)
   - Choose thematic focus and escalation style

2. **Generate Story:**
   - Click "Generate Story"
   - Wait 3-5 minutes for complete workflow
   - System will generate, audit, and refine automatically

3. **Download Results:**
   - Review quality score and summary
   - Download ZIP package containing all outputs

### Output Package Contents

Each generation creates a ZIP file containing:

1. **`00_user_input_log.json`** - Complete parameter record
2. **`01_initial_generation.txt`** - Raw generated story
3. **`02_revision_audit_report.md`** - Structural audit with scores
4. **`03_revised_story.txt`** - Final story (after refinement)
5. **`04_change_implementation_log.md`** - All revisions applied
6. **`05_error_identification_log.md`** - Debugging information
7. **`06_story_metadata.json`** - Complete metadata

## 🎨 Template System

### Version Control

Templates are versioned (`v1`, `v2`, etc.) to allow:
- Safe updates without breaking existing workflows
- A/B testing of template changes
- Rollback capability

### Editing Templates

Templates are YAML files in `templates/v1/`. To modify:

1. Edit the desired template file
2. System automatically loads changes (no restart needed in dev mode)
3. Test thoroughly before deploying

### Adding New Templates

1. Create new YAML file in appropriate directory
2. Follow existing structure and documentation
3. Update `templateLoader.js` if adding new categories
4. Document changes in `CHANGELOG.md`

## 🔧 Configuration

### API Configuration (`config/config.json`)

```json
{
  "api": {
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 16000,
    "temperature": 0.7
  },
  "generation": {
    "default_word_count": 10000,
    "default_rule_count": 7
  },
  "revision": {
    "max_revision_rounds": 3,
    "auto_refine_on_failure": true
  }
}
```

### Environment Variables

- `ANTHROPIC_API_KEY` - Required: Your Anthropic API key
- `PORT` - Optional: Server port (default: 3000)
- `NODE_ENV` - Optional: Environment mode (development/production)

## 📊 Quality Scoring

Stories are evaluated on a 100-point scale:

- **90-100**: Excellent (ready for publication)
- **75-89**: Good (minor revisions needed)
- **60-74**: Acceptable (moderate revisions needed)
- **40-59**: Needs Work (major revisions needed)
- **0-39**: Failed (structural failure, needs rewrite)

### Critical Failure Modes Detected

1. Rule invariance violations
2. Object ontology failures ("ticket problem")
3. Violation consequence resets
4. Convenience resolutions
5. AI confabulation (inventing solutions)

## 🛠️ Advanced Usage

### Programmatic API

```javascript
const Orchestrator = require('./src/backend/services/orchestrator');

const orchestrator = new Orchestrator(apiKey, {
  model: 'claude-sonnet-4-5-20250929',
  autoRefine: true,
  maxRevisionRounds: 3
});

const result = await orchestrator.executeWorkflow({
  wordCount: 10000,
  location: 'desert_diner',
  entryCondition: 'new_hire',
  discoveryMethod: 'explicit_list',
  completenessPattern: 'complete_but_misunderstood',
  violationResponse: 'escalation',
  endingType: 'true_exit_with_cost',
  thematicFocus: 'service_and_servitude',
  escalationStyle: 'psychological',
  ruleCount: 7
});
```

### Custom Template Loading

```javascript
const TemplateLoader = require('./src/backend/utils/templateLoader');

const loader = new TemplateLoader('templates', 'v1');
const locations = await loader.loadLocations();
const theme = await loader.getTheme('contamination_and_corruption');
```

## 📝 Development

### Adding New Inflection Points

1. Edit relevant template file in `templates/v1/inflection_points/`
2. Follow YAML structure of existing entries
3. Include: description, characteristics, requirements, examples
4. Test with generation workflow

### Extending Revision Checklist

1. Edit `templates/v1/schemas/revision_checklist.yaml`
2. Add new check under appropriate section
3. Include: question, pass_criteria, fail_indicators, severity
4. Update scoring if adding critical checks

### Contributing

When making changes:
1. Test thoroughly with multiple generations
2. Document changes in `CHANGELOG.md`
3. Update relevant documentation
4. Ensure backward compatibility or version increment

## 🐛 Troubleshooting

### Common Issues

**"ANTHROPIC_API_KEY not found"**
- Ensure `config/.env` exists with your API key
- Verify the file is named `.env` exactly

**"Failed to load template"**
- Check template file exists in correct directory
- Verify YAML syntax is valid
- Check file permissions

**Generation takes very long**
- Normal for 10,000+ word stories (3-5 minutes)
- Check API rate limits if consistently failing
- Monitor console for progress updates

**Low quality scores**
- Review audit report for specific failures
- Consider adjusting parameters (simpler interactions, clearer theme)
- Check that templates haven't been corrupted

## 📚 Additional Documentation

- **Template Versioning**: See `docs/template-versioning.md`
- **Revision Checklist**: Detailed in `templates/v1/schemas/revision_checklist.yaml`
- **API Reference**: See inline JSDoc comments in source files

## 🔄 Version History

See `CHANGELOG.md` for detailed version history and template changes.

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Credits

Built with:
- Claude API (Anthropic)
- Express.js
- js-yaml
- archiver

Designed based on research into rule-based horror storytelling structural principles.

---

**Production Tool for Structurally Sound Rule-Based Horror**

This system treats story generation as a constrained structural problem, not free-form creative writing. Procedural generation + rigorous revision = reliable quality output.
