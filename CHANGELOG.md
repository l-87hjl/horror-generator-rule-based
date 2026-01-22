# Changelog

All notable changes to the Rule-Based Horror Story Generator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-22

### Added - Initial Release

#### Core System
- Complete modular architecture with versioned templates
- Web-based interface for story generation
- Express.js server with REST API
- Comprehensive folder structure with separation of concerns

#### Template System (v1)
- **Inflection Point Templates**:
  - Entry Conditions (7 types: new_hire, returner, proxy, inherited_obligation, investigator, accidental_arrival, summoned)
  - Rule Discovery Methods (7 types: explicit_list, environmental_discovery, oral_tradition, fragmented_discovery, behavioral_inference, contradictory_sources, experiential_learning)
  - Rule Completeness Patterns (7 types: complete_but_misunderstood, complete_but_seemingly_arbitrary, deliberately_incomplete, accidentally_incomplete, evolving_incompleteness, contradictory_completeness, strategically_obscured)
  - Rule Interaction Types (8 types: dependency, threshold, conflict, contextual_drift, mutual_exclusion, amplification, temporal_sequencing, conditional_activation)
  - Violation Response Models (8 types: contamination, reclassification, escalation, immediate_catastrophic, accumulation_threshold, attention_attraction, environmental_response, binding_intensification)
  - Exit Condition Structures (8 types: true_exit_with_cost, conditional_exit, false_exit, deferred_exit, impossible_exit, exit_through_completion, exit_through_refusal, ambiguous_exit)

- **Location Database**: 24 predefined locations across categories:
  - Transit & Passage (ferry_terminal, highway_rest_stop, airport_after_hours)
  - Hospitality & Service (desert_diner, roadside_motel, mountain_lodge)
  - Employment & Industrial (warehouse_night_shift, research_station, fire_watch_tower)
  - Residential & Domestic (inherited_estate, apartment_building, family_farm)
  - Institutional (hospital_night_wing, library_archive, school_after_hours)
  - Natural & Wilderness (cave_system, forest_boundary, coastal_facility)
  - Liminal & Specialized (storage_facility, service_tunnel_network, parking_structure)

- **Thematic Elements**: 8 core themes with rule-system mappings:
  - Grief and Avoidance
  - Complicity and Participation
  - Contamination and Corruption
  - Forgotten Obligation
  - Surveillance and Visibility
  - Temporal Binding
  - Spatial Wrongness
  - Service and Servitude

- **Rule Grammar Templates**: 10 construction patterns with examples and anti-patterns
- **Revision Checklist**: 7-section comprehensive audit framework with 30+ checks

#### Backend Services
- **StoryGenerator**: Orchestrates generation with template-based prompt engineering
- **RevisionAuditor**: Performs structural integrity audits against checklist
- **StoryRefiner**: Applies surgical fixes based on audit findings
- **Orchestrator**: Manages complete workflow from input to packaged output
- **ClaudeClient**: Handles all Anthropic API interactions with retry logic
- **TemplateLoader**: Loads and caches versioned YAML templates
- **OutputPackager**: Creates comprehensive ZIP packages with 7 files per generation

#### Frontend Interface
- Clean, dark-themed web interface
- Form validation for all parameters
- Real-time progress tracking (simulated)
- Results display with quality scoring
- One-click ZIP download
- Responsive design for mobile/tablet

#### Output Package System
- **00_user_input_log.json**: Complete parameter record
- **01_initial_generation.txt**: Raw generated story
- **02_revision_audit_report.md**: Structural audit with detailed findings
- **03_revised_story.txt**: Final story after refinement
- **04_change_implementation_log.md**: All revisions with justifications
- **05_error_identification_log.md**: Debugging and API metadata
- **06_story_metadata.json**: Comprehensive metadata including scores

#### Quality Assurance
- 100-point scoring system with letter grades
- Critical failure detection (6 types)
- Automated refinement (up to 3 rounds)
- Pass rate: Target ≥85% checklist items on first generation

#### Configuration & Environment
- JSON-based configuration system
- Environment variable support (.env)
- Template versioning (v1)
- Configurable API parameters (model, temperature, max_tokens)

#### Documentation
- Comprehensive README with quick start guide
- Inline code documentation (JSDoc-style)
- Template usage notes and examples
- Anti-pattern documentation
- Troubleshooting guide

### Technical Details

#### Dependencies
- `@anthropic-ai/sdk` ^0.32.0 - Claude API integration
- `express` ^4.21.2 - Web server
- `js-yaml` ^4.1.0 - Template parsing
- `archiver` ^7.0.1 - ZIP packaging
- `uuid` ^11.0.4 - Session ID generation
- `dotenv` ^16.4.7 - Environment configuration
- `cors` ^2.8.5 - CORS support

#### API Endpoints
- `GET /` - Serve web interface
- `GET /api/options` - Get available template options
- `POST /api/generate` - Generate new story
- `GET /api/download/:sessionId` - Download story package
- `GET /api/health` - Health check

#### Performance
- Average generation time: 3-5 minutes (10,000 words)
- Template caching for faster subsequent loads
- Efficient ZIP compression (level 9)

### Design Principles

This release embodies:
1. **Modularity**: Easy to update templates without touching core logic
2. **Versioning**: Safe template evolution with backward compatibility
3. **Documentation**: Comprehensive logging for debugging and improvement
4. **Structural Rigor**: Treats generation as constrained problem-solving
5. **User Transparency**: Complete visibility into generation process

### Known Limitations

- No real-time progress updates (simulated progress bar)
- Single concurrent generation per server instance
- No user authentication/session management
- Output files stored indefinitely (manual cleanup required)

### Future Considerations

- Real-time progress via WebSockets
- Multiple template versions selectable by user
- Batch generation support
- Advanced analytics dashboard
- User accounts and generation history
- Template editing interface

---

## Template Version History

### v1 (2026-01-22)
- Initial template release
- 24 locations
- 8 themes
- 6 inflection point categories with 40+ total options
- Comprehensive revision checklist (30+ checks)
- Rule grammar patterns (10 types)

---

**Note**: This changelog documents both system changes and template changes. Template changes are particularly important as they directly affect story generation quality and options.

For template-specific changes, see section headers marked "Template Version History" above.
