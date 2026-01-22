/**
 * Revision Auditor Service
 * Performs post-generation structural audit of stories
 */

const ClaudeClient = require('../api/claudeClient');
const TemplateLoader = require('../utils/templateLoader');

class RevisionAuditor {
  constructor(claudeClient, templateLoader) {
    this.claudeClient = claudeClient;
    this.templateLoader = templateLoader;
  }

  /**
   * Perform comprehensive revision audit
   */
  async auditStory(story, parameters = {}) {
    console.log('Loading revision checklist...');
    const checklist = await this.templateLoader.loadRevisionChecklist();

    console.log('Performing structural audit...');
    const auditResult = await this.claudeClient.auditStory(story, checklist);

    console.log('Parsing audit report...');
    const parsedReport = this.parseAuditReport(auditResult.content);

    // Calculate scores
    const scores = this.calculateScores(parsedReport);

    return {
      rawReport: auditResult.content,
      parsedReport,
      scores,
      metadata: {
        usage: auditResult.usage,
        model: auditResult.model,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Parse audit report into structured format
   */
  parseAuditReport(reportText) {
    // This is a simplified parser - in production you might want more sophisticated parsing
    const report = {
      sections: [],
      summary: {
        overallScore: 0,
        criticalFailures: 0,
        majorFailures: 0,
        totalFailures: 0,
        recommendation: 'unknown'
      },
      failures: []
    };

    // Extract summary information using regex
    const scoreMatch = reportText.match(/Overall Score[:\s]+(\d+)/i);
    if (scoreMatch) {
      report.summary.overallScore = parseInt(scoreMatch[1]);
    }

    const criticalMatch = reportText.match(/Critical Failures[:\s]+(\d+)/i);
    if (criticalMatch) {
      report.summary.criticalFailures = parseInt(criticalMatch[1]);
    }

    const majorMatch = reportText.match(/Major Failures[:\s]+(\d+)/i);
    if (majorMatch) {
      report.summary.majorFailures = parseInt(majorMatch[1]);
    }

    const recommendationMatch = reportText.match(/Recommendation[:\s]+(\w+)/i);
    if (recommendationMatch) {
      report.summary.recommendation = recommendationMatch[1].toLowerCase();
    }

    // Extract individual failures
    const failurePatterns = [
      /Result[:\s]+FAIL/gi,
      /Result[:\s]+CONCERN/gi,
      /Severity[:\s]+(CRITICAL|MAJOR)/gi
    ];

    for (const pattern of failurePatterns) {
      const matches = reportText.match(pattern);
      if (matches) {
        report.summary.totalFailures += matches.length;
      }
    }

    return report;
  }

  /**
   * Calculate quality scores
   */
  calculateScores(parsedReport) {
    const { summary } = parsedReport;

    return {
      overallScore: summary.overallScore,
      grade: this.calculateGrade(summary.overallScore),
      criticalFailures: summary.criticalFailures,
      majorFailures: summary.majorFailures,
      totalFailures: summary.totalFailures,
      passRate: summary.overallScore > 0 ? summary.overallScore : 0,
      needsRevision: summary.criticalFailures > 0 || summary.overallScore < 75,
      recommendation: summary.recommendation
    };
  }

  /**
   * Calculate letter grade from score
   */
  calculateGrade(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'acceptable';
    if (score >= 40) return 'needs_work';
    return 'failed';
  }

  /**
   * Extract specific issues for refinement
   */
  extractIssues(reportText) {
    const issues = [];

    // Look for FAIL or CONCERN results with associated evidence
    const sections = reportText.split(/##\s+/);

    for (const section of sections) {
      if (section.includes('FAIL') || section.includes('CONCERN')) {
        const lines = section.split('\n');
        let currentIssue = {
          section: '',
          check: '',
          severity: 'moderate',
          evidence: [],
          notes: ''
        };

        for (const line of lines) {
          if (line.trim().startsWith('###')) {
            currentIssue.check = line.replace(/###\s+/, '').trim();
          } else if (line.includes('Severity:')) {
            const severityMatch = line.match(/Severity[:\s]+(\w+)/i);
            if (severityMatch) {
              currentIssue.severity = severityMatch[1].toLowerCase();
            }
          } else if (line.includes('Evidence:')) {
            currentIssue.evidence.push(line.replace(/[-*]\s*Evidence[:\s]*/i, '').trim());
          } else if (line.includes('Notes:')) {
            currentIssue.notes = line.replace(/[-*]\s*Notes[:\s]*/i, '').trim();
          }
        }

        if (currentIssue.check) {
          issues.push(currentIssue);
        }
      }
    }

    return issues;
  }

  /**
   * Determine if refinement is needed
   */
  needsRefinement(scores) {
    return scores.criticalFailures > 0 || scores.overallScore < 75;
  }

  /**
   * Generate refinement priorities
   */
  generateRefinementPriorities(parsedReport, reportText) {
    const issues = this.extractIssues(reportText);

    // Sort by severity
    const severityOrder = { critical: 0, major: 1, moderate: 2, minor: 3 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      critical: issues.filter(i => i.severity === 'critical'),
      major: issues.filter(i => i.severity === 'major'),
      moderate: issues.filter(i => i.severity === 'moderate'),
      minor: issues.filter(i => i.severity === 'minor')
    };
  }
}

module.exports = RevisionAuditor;
