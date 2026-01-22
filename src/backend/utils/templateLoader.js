/**
 * Template Loader Utility
 * Loads and parses YAML template files with version support
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class TemplateLoader {
  constructor(basePath = 'templates', version = 'v1') {
    this.basePath = basePath;
    this.version = version;
    this.templateCache = new Map();
  }

  /**
   * Get the full path to a template file
   */
  getTemplatePath(category, filename) {
    return path.join(process.cwd(), this.basePath, this.version, category, filename);
  }

  /**
   * Load and parse a YAML template file
   */
  async loadTemplate(category, filename) {
    const cacheKey = `${category}/${filename}`;

    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey);
    }

    try {
      const templatePath = this.getTemplatePath(category, filename);
      const fileContent = await fs.readFile(templatePath, 'utf8');
      const parsed = yaml.load(fileContent);

      // Cache the parsed template
      this.templateCache.set(cacheKey, parsed);

      return parsed;
    } catch (error) {
      throw new Error(`Failed to load template ${category}/${filename}: ${error.message}`);
    }
  }

  /**
   * Load all inflection point templates
   */
  async loadInflectionPoints() {
    const templates = {
      entryConditions: await this.loadTemplate('inflection_points', 'entry_conditions.yaml'),
      ruleDiscovery: await this.loadTemplate('inflection_points', 'rule_discovery.yaml'),
      ruleCompleteness: await this.loadTemplate('inflection_points', 'rule_completeness.yaml'),
      ruleInteractions: await this.loadTemplate('inflection_points', 'rule_interactions.yaml'),
      violationResponses: await this.loadTemplate('inflection_points', 'violation_responses.yaml'),
      exitConditions: await this.loadTemplate('inflection_points', 'exit_conditions.yaml')
    };

    return templates;
  }

  /**
   * Load locations database
   */
  async loadLocations() {
    return await this.loadTemplate('', 'locations.yaml');
  }

  /**
   * Load thematic elements
   */
  async loadThematicElements() {
    return await this.loadTemplate('', 'thematic_elements.yaml');
  }

  /**
   * Load rule grammar templates
   */
  async loadRuleGrammar() {
    return await this.loadTemplate('schemas', 'rule_grammar.yaml');
  }

  /**
   * Load revision checklist
   */
  async loadRevisionChecklist() {
    return await this.loadTemplate('schemas', 'revision_checklist.yaml');
  }

  /**
   * Get specific inflection point by type and key
   */
  async getInflectionPoint(type, key) {
    const templates = await this.loadInflectionPoints();
    const typeMap = {
      'entry': templates.entryConditions.entry_conditions,
      'discovery': templates.ruleDiscovery.discovery_methods,
      'completeness': templates.ruleCompleteness.completeness_patterns,
      'interaction': templates.ruleInteractions.interaction_types,
      'violation': templates.violationResponses.response_models,
      'exit': templates.exitConditions.exit_structures
    };

    if (!typeMap[type]) {
      throw new Error(`Unknown inflection point type: ${type}`);
    }

    const result = typeMap[type][key];
    if (!result) {
      throw new Error(`Unknown ${type} key: ${key}`);
    }

    return result;
  }

  /**
   * Get location by key
   */
  async getLocation(locationKey) {
    const locations = await this.loadLocations();
    const location = locations.locations[locationKey];

    if (!location) {
      throw new Error(`Unknown location: ${locationKey}`);
    }

    return location;
  }

  /**
   * Get theme by key
   */
  async getTheme(themeKey) {
    const themes = await this.loadThematicElements();
    const theme = themes.themes[themeKey];

    if (!theme) {
      throw new Error(`Unknown theme: ${themeKey}`);
    }

    return theme;
  }

  /**
   * Clear template cache (useful for development/hot reload)
   */
  clearCache() {
    this.templateCache.clear();
  }

  /**
   * List all available options for a given category
   */
  async listOptions(category) {
    switch(category) {
      case 'locations': {
        const locations = await this.loadLocations();
        return Object.keys(locations.locations);
      }
      case 'themes': {
        const themes = await this.loadThematicElements();
        return Object.keys(themes.themes);
      }
      case 'entry_conditions': {
        const templates = await this.loadInflectionPoints();
        return Object.keys(templates.entryConditions.entry_conditions);
      }
      case 'discovery_methods': {
        const templates = await this.loadInflectionPoints();
        return Object.keys(templates.ruleDiscovery.discovery_methods);
      }
      case 'completeness_patterns': {
        const templates = await this.loadInflectionPoints();
        return Object.keys(templates.ruleCompleteness.completeness_patterns);
      }
      case 'violation_responses': {
        const templates = await this.loadInflectionPoints();
        return Object.keys(templates.violationResponses.response_models);
      }
      case 'exit_conditions': {
        const templates = await this.loadInflectionPoints();
        return Object.keys(templates.exitConditions.exit_structures);
      }
      default:
        throw new Error(`Unknown category: ${category}`);
    }
  }
}

module.exports = TemplateLoader;
