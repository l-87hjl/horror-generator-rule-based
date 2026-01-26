/**
 * Narrative Firewall
 * Prevents meta-language from leaking into prose
 *
 * Purpose: Scan generated text for forbidden terminology that reveals
 * the procedural nature of the story, and optionally rewrite to remove it.
 */

// Banned lexemes - terms that break immersion by revealing structure
const BANNED_LEXEMES = [
  // Structural terms
  'threshold',
  'failure state',
  'accumulation',
  'mechanic',
  'mechanism',
  'system',
  'protocol',
  'parameter',
  'variable',
  'trigger',
  'condition',
  'ruleset',
  'algorithm',
  'procedural',

  // Game-like terms
  'checkpoint',
  'save point',
  'level',
  'stage',
  'phase',
  'progression',
  'unlock',
  'achievement',

  // Meta-awareness terms
  'narrative',
  'story beat',
  'arc',
  'pacing',
  'climax',
  'resolution',
  'denouement',
  'foreshadowing',
  'callback',

  // Rule-system terms (when used structurally)
  'rule violation',
  'rule enforcement',
  'consequence trigger',
  'state change',
  'flag',
  'counter',
  'increment',
  'escalation level'
];

// Patterns that indicate meta-awareness
const BANNED_PATTERNS = [
  // Direct rule references
  /I realized the rules were (interacting|connected|linked)/i,
  /the rules (seemed|appeared) to (work|function|operate)/i,
  /I understood (the|this) system/i,
  /the mechanism behind/i,
  /how (the|this) (system|place|thing) (worked|functioned|operated)/i,

  // Game-like awareness
  /it was like a (game|puzzle|test|trial)/i,
  /I had (failed|passed|completed|beaten)/i,
  /this was (the|my) (punishment|reward|consequence)/i,
  /as if following (a|some) (script|program|pattern)/i,

  // Structural awareness
  /I (noticed|observed|saw) a pattern/i,
  /the (entity|thing|it) (was|seemed) (bound|limited|constrained) by/i,
  /there (were|must be) rules governing/i,
  /I (began|started) to understand the (rules|logic|pattern)/i,

  // Meta-narrative
  /this (story|tale|account|narrative)/i,
  /if (I|you|one) were (reading|writing|telling)/i,
  /like (a|some) (horror|scary) (story|movie|film)/i,

  // Direct consequence awareness
  /because I (broke|violated|disobeyed) the rule/i,
  /the consequence (for|of) (my|the) (action|violation)/i,
  /I had (triggered|activated|caused) (the|a)/i,

  // Procedural language
  /step (one|two|three|1|2|3)/i,
  /in (order|sequence)/i,
  /the (first|second|third|next|final) (rule|step|phase)/i
];

// Context-sensitive terms (allowed in some contexts, banned in others)
const CONTEXT_SENSITIVE = {
  'rule': {
    allowed: ['rule of thumb', 'golden rule', 'unspoken rule', 'house rules'],
    banned: ['rule violation', 'rule system', 'this rule', 'the rule states']
  },
  'system': {
    allowed: ['nervous system', 'sound system', 'solar system', 'immune system'],
    banned: ['the system works', 'understand the system', 'system of rules']
  },
  'trigger': {
    allowed: ['trigger finger', 'hair trigger', 'emotional trigger'],
    banned: ['trigger the', 'triggered by', 'trigger mechanism']
  }
};

class NarrativeFirewall {
  constructor(claudeClient = null) {
    this.claudeClient = claudeClient;
    this.violations = [];
  }

  /**
   * Scan text for meta-language violations
   *
   * @param {string} text - Text to scan
   * @returns {object} Scan result with violations
   */
  scanForMetaLanguage(text) {
    this.violations = [];
    const lines = text.split('\n');

    // Check banned lexemes
    for (const lexeme of BANNED_LEXEMES) {
      const regex = new RegExp(`\\b${this.escapeRegex(lexeme)}\\b`, 'gi');
      let match;

      while ((match = regex.exec(text)) !== null) {
        // Find line number
        const lineNum = this.getLineNumber(text, match.index);

        // Check if it's a context-sensitive term
        if (!this.isAllowedContext(lexeme, text, match.index)) {
          this.violations.push({
            type: 'banned_lexeme',
            term: lexeme,
            match: match[0],
            position: match.index,
            lineNumber: lineNum,
            context: this.getContext(text, match.index),
            severity: this.getSeverity(lexeme)
          });
        }
      }
    }

    // Check banned patterns
    for (const pattern of BANNED_PATTERNS) {
      let match;
      const globalPattern = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));

      while ((match = globalPattern.exec(text)) !== null) {
        const lineNum = this.getLineNumber(text, match.index);

        this.violations.push({
          type: 'banned_pattern',
          pattern: pattern.source,
          match: match[0],
          position: match.index,
          lineNumber: lineNum,
          context: this.getContext(text, match.index),
          severity: 'high'
        });
      }
    }

    // Sort by position
    this.violations.sort((a, b) => a.position - b.position);

    return {
      clean: this.violations.length === 0,
      violationCount: this.violations.length,
      violations: this.violations,
      summary: this.getSummary()
    };
  }

  /**
   * Check if term is used in an allowed context
   */
  isAllowedContext(term, text, position) {
    const lowerTerm = term.toLowerCase();
    const contextInfo = CONTEXT_SENSITIVE[lowerTerm];

    if (!contextInfo) return false;

    const context = this.getContext(text, position, 50).toLowerCase();

    // Check if any allowed patterns match
    for (const allowed of contextInfo.allowed) {
      if (context.includes(allowed.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get surrounding context for a match
   */
  getContext(text, position, radius = 30) {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.slice(start, end).replace(/\s+/g, ' ');
  }

  /**
   * Get line number for a position
   */
  getLineNumber(text, position) {
    return text.slice(0, position).split('\n').length;
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get severity level for a term
   */
  getSeverity(term) {
    const highSeverity = ['system', 'mechanism', 'procedural', 'rule violation', 'failure state'];
    const mediumSeverity = ['threshold', 'trigger', 'condition', 'parameter'];

    if (highSeverity.some(t => term.toLowerCase().includes(t))) {
      return 'high';
    }
    if (mediumSeverity.some(t => term.toLowerCase().includes(t))) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get summary of violations
   */
  getSummary() {
    if (this.violations.length === 0) {
      return 'No meta-language detected';
    }

    const high = this.violations.filter(v => v.severity === 'high').length;
    const medium = this.violations.filter(v => v.severity === 'medium').length;
    const low = this.violations.filter(v => v.severity === 'low').length;

    return `${this.violations.length} violations: ${high} high, ${medium} medium, ${low} low`;
  }

  /**
   * Rewrite text to remove meta-language violations
   * Uses Claude API for intelligent rewriting
   *
   * @param {string} text - Text to rewrite
   * @param {Array} violations - Violations to fix
   * @returns {Promise<object>} Rewrite result
   */
  async rewriteToRemoveMeta(text, violations = null) {
    if (!this.claudeClient) {
      throw new Error('Claude client required for rewriting');
    }

    // Use provided violations or scan for them
    const violationsToFix = violations || this.scanForMetaLanguage(text).violations;

    if (violationsToFix.length === 0) {
      return {
        success: true,
        text: text,
        changesApplied: 0,
        message: 'No violations to fix'
      };
    }

    // Build rewrite prompt
    const violationList = violationsToFix.map(v =>
      `- Line ${v.lineNumber}: "${v.match}" (${v.type})`
    ).join('\n');

    const prompt = `Rewrite the following text to remove meta-language that reveals the procedural/structural nature of the story.

VIOLATIONS TO FIX:
${violationList}

RULES:
1. Keep ALL events, actions, and plot points EXACTLY the same
2. ONLY change the language/phrasing that reveals structure
3. Replace with natural, immersive alternatives
4. Maintain the character's voice and POV
5. Do not add explanations or commentary

TEXT TO REWRITE:
${text}

Return ONLY the rewritten text, no explanations.`;

    try {
      const response = await this.claudeClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: Math.min(text.length * 2, 16000),
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const rewrittenText = response.content[0].text;

      // Verify the rewrite
      const verifyResult = this.scanForMetaLanguage(rewrittenText);

      return {
        success: true,
        text: rewrittenText,
        changesApplied: violationsToFix.length,
        remainingViolations: verifyResult.violations.length,
        clean: verifyResult.clean,
        usage: response.usage
      };

    } catch (error) {
      return {
        success: false,
        text: text,
        error: error.message,
        changesApplied: 0
      };
    }
  }

  /**
   * Get forbidden words list for prompts
   */
  static getForbiddenWordsList() {
    return BANNED_LEXEMES.slice();
  }

  /**
   * Get forbidden patterns for validation
   */
  static getForbiddenPatterns() {
    return BANNED_PATTERNS.map(p => p.source);
  }
}

module.exports = NarrativeFirewall;
