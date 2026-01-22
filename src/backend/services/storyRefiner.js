/**
 * Story Refiner Service
 * Performs surgical fixes to stories based on audit findings
 */

const ClaudeClient = require('../api/claudeClient');

class StoryRefiner {
  constructor(claudeClient) {
    this.claudeClient = claudeClient;
  }

  /**
   * Refine story based on audit report
   */
  async refineStory(originalStory, auditReport, options = {}) {
    const maxRounds = options.maxRounds || 3;
    let currentStory = originalStory;
    let currentRound = 0;
    const changeLog = [];

    console.log(`Starting refinement (max ${maxRounds} rounds)...`);

    while (currentRound < maxRounds) {
      currentRound++;
      console.log(`Refinement round ${currentRound}/${maxRounds}...`);

      const refinementResult = await this.claudeClient.refineStory(
        currentStory,
        auditReport
      );

      // Parse the result to extract story and changes
      const { story, changes } = this.parseRefinementResult(refinementResult.content);

      if (!changes || changes.length === 0) {
        console.log('No more changes needed.');
        break;
      }

      currentStory = story;
      changeLog.push({
        round: currentRound,
        changes: changes,
        usage: refinementResult.usage,
        timestamp: new Date().toISOString()
      });

      // If no critical issues remain, we can stop
      if (this.shouldStopRefining(changes)) {
        console.log('Critical issues resolved.');
        break;
      }
    }

    return {
      refinedStory: currentStory,
      changeLog,
      rounds: currentRound,
      metadata: {
        originalLength: originalStory.length,
        refinedLength: currentStory.length,
        totalChanges: changeLog.reduce((sum, log) => sum + log.changes.length, 0)
      }
    };
  }

  /**
   * Parse refinement result to extract story and change log
   */
  parseRefinementResult(resultText) {
    // Look for common separators between story and change log
    const separators = [
      /\n---+\s*CHANGE LOG/i,
      /\n---+\s*CHANGES/i,
      /\n#+\s*Change Log/i,
      /\n#+\s*Changes Made/i,
      /\n---+\n/
    ];

    let story = resultText;
    let changeLogText = '';

    for (const separator of separators) {
      const parts = resultText.split(separator);
      if (parts.length > 1) {
        story = parts[0].trim();
        changeLogText = parts.slice(1).join('').trim();
        break;
      }
    }

    const changes = this.parseChangeLog(changeLogText);

    return { story, changes };
  }

  /**
   * Parse change log text into structured changes
   */
  parseChangeLog(changeLogText) {
    if (!changeLogText) return [];

    const changes = [];
    const changeBlocks = changeLogText.split(/\n(?=\d+\.|\*|-|#{2,3})/);

    for (const block of changeBlocks) {
      if (block.trim().length === 0) continue;

      const change = {
        description: '',
        original: '',
        revised: '',
        justification: '',
        location: ''
      };

      const lines = block.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.match(/^(Original|Before)[:]/i)) {
          change.original = trimmed.replace(/^(Original|Before)[:]\s*/i, '');
        } else if (trimmed.match(/^(Revised|After|New)[:]/i)) {
          change.revised = trimmed.replace(/^(Revised|After|New)[:]\s*/i, '');
        } else if (trimmed.match(/^(Justification|Reason|Why)[:]/i)) {
          change.justification = trimmed.replace(/^(Justification|Reason|Why)[:]\s*/i, '');
        } else if (trimmed.match(/^(Location|Where|Section)[:]/i)) {
          change.location = trimmed.replace(/^(Location|Where|Section)[:]\s*/i, '');
        } else if (!change.description && trimmed.length > 0) {
          change.description = trimmed.replace(/^\d+\.\s*/, '').replace(/^[*-]\s*/, '');
        }
      }

      if (change.description || change.revised) {
        changes.push(change);
      }
    }

    return changes;
  }

  /**
   * Determine if refinement should stop
   */
  shouldStopRefining(changes) {
    // Stop if no changes or only minor changes
    if (!changes || changes.length === 0) {
      return true;
    }

    // Check if changes are all minor (heuristic: short descriptions, no critical keywords)
    const criticalKeywords = ['rule', 'violation', 'consequence', 'object', 'reset', 'arbitrary'];
    const hasCriticalChanges = changes.some(change => {
      const text = (change.description + ' ' + change.justification).toLowerCase();
      return criticalKeywords.some(keyword => text.includes(keyword));
    });

    return !hasCriticalChanges;
  }

  /**
   * Generate change summary
   */
  generateChangeSummary(changeLog) {
    const allChanges = changeLog.flatMap(log => log.changes);

    return {
      totalRounds: changeLog.length,
      totalChanges: allChanges.length,
      changeTypes: this.categorizeChanges(allChanges),
      summary: this.summarizeChanges(allChanges)
    };
  }

  /**
   * Categorize changes by type
   */
  categorizeChanges(changes) {
    const categories = {
      rule_consistency: 0,
      object_ontology: 0,
      escalation: 0,
      resolution: 0,
      theme: 0,
      other: 0
    };

    for (const change of changes) {
      const text = (change.description + ' ' + change.justification).toLowerCase();

      if (text.includes('rule')) categories.rule_consistency++;
      else if (text.includes('object') || text.includes('ticket')) categories.object_ontology++;
      else if (text.includes('escalat') || text.includes('violation') || text.includes('consequence')) categories.escalation++;
      else if (text.includes('resolution') || text.includes('ending') || text.includes('exit')) categories.resolution++;
      else if (text.includes('theme')) categories.theme++;
      else categories.other++;
    }

    return categories;
  }

  /**
   * Summarize changes in human-readable format
   */
  summarizeChanges(changes) {
    return changes.map((change, index) => ({
      number: index + 1,
      description: change.description,
      justification: change.justification,
      location: change.location
    }));
  }
}

module.exports = StoryRefiner;
