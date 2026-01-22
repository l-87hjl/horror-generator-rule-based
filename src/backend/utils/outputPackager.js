/**
 * Output Packager
 * Creates comprehensive multi-file output packages (ZIP)
 */

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createWriteStream, createReadStream } = require('fs');

class OutputPackager {
  constructor(outputDir = 'generated') {
    this.outputDir = path.join(process.cwd(), outputDir);
  }

  /**
   * Create complete output package
   */
  async createPackage(sessionData) {
    const {
      sessionId,
      userInput,
      initialStory,
      auditReport,
      revisedStory,
      changeLog,
      metadata
    } = sessionData;

    // Create session directory
    const sessionDir = path.join(this.outputDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    console.log(`Creating output package in ${sessionDir}...`);

    // Generate all files
    const files = await this.generateFiles(sessionData, sessionDir);

    // Create ZIP archive
    const zipPath = await this.createZipArchive(sessionDir, sessionId, files);

    console.log(`Output package created: ${zipPath}`);

    return {
      sessionDir,
      zipPath,
      files
    };
  }

  /**
   * Generate all output files
   */
  async generateFiles(sessionData, sessionDir) {
    const {
      userInput,
      initialStory,
      auditReport,
      revisedStory,
      changeLog,
      metadata,
      errorLog
    } = sessionData;

    const files = [];

    // 1. User Input Log (JSON)
    const userInputPath = path.join(sessionDir, '00_user_input_log.json');
    await fs.writeFile(userInputPath, JSON.stringify(userInput, null, 2));
    files.push({ name: '00_user_input_log.json', path: userInputPath });

    // 2. Initial Generation (TXT)
    const initialStoryPath = path.join(sessionDir, '01_initial_generation.txt');
    await fs.writeFile(initialStoryPath, initialStory);
    files.push({ name: '01_initial_generation.txt', path: initialStoryPath });

    // 3. Revision Audit Report (MD)
    if (auditReport) {
      const auditReportPath = path.join(sessionDir, '02_revision_audit_report.md');
      await fs.writeFile(auditReportPath, this.formatAuditReport(auditReport));
      files.push({ name: '02_revision_audit_report.md', path: auditReportPath });
    }

    // 4. Revised Story (TXT)
    const revisedStoryPath = path.join(sessionDir, '03_revised_story.txt');
    const finalStory = revisedStory || initialStory;
    await fs.writeFile(revisedStoryPath, finalStory);
    files.push({ name: '03_revised_story.txt', path: revisedStoryPath });

    // 5. Change Implementation Log (MD)
    if (changeLog && changeLog.length > 0) {
      const changeLogPath = path.join(sessionDir, '04_change_implementation_log.md');
      await fs.writeFile(changeLogPath, this.formatChangeLog(changeLog));
      files.push({ name: '04_change_implementation_log.md', path: changeLogPath });
    }

    // 6. Error Identification Log (MD)
    const errorLogPath = path.join(sessionDir, '05_error_identification_log.md');
    await fs.writeFile(errorLogPath, this.formatErrorLog(errorLog, auditReport));
    files.push({ name: '05_error_identification_log.md', path: errorLogPath });

    // 7. Story Metadata (JSON)
    const metadataPath = path.join(sessionDir, '06_story_metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(this.buildMetadata(sessionData), null, 2));
    files.push({ name: '06_story_metadata.json', path: metadataPath });

    return files;
  }

  /**
   * Format audit report for markdown output
   */
  formatAuditReport(auditReport) {
    let output = `# Revision Audit Report\n\n`;
    output += `Generated: ${new Date().toISOString()}\n\n`;
    output += `---\n\n`;

    if (auditReport.rawReport) {
      output += auditReport.rawReport;
    }

    if (auditReport.scores) {
      output += `\n\n---\n\n## Summary Scores\n\n`;
      output += `- **Overall Score**: ${auditReport.scores.overallScore}/100\n`;
      output += `- **Grade**: ${auditReport.scores.grade}\n`;
      output += `- **Critical Failures**: ${auditReport.scores.criticalFailures}\n`;
      output += `- **Major Failures**: ${auditReport.scores.majorFailures}\n`;
      output += `- **Total Failures**: ${auditReport.scores.totalFailures}\n`;
      output += `- **Recommendation**: ${auditReport.scores.recommendation}\n`;
    }

    return output;
  }

  /**
   * Format change log for markdown output
   */
  formatChangeLog(changeLog) {
    let output = `# Change Implementation Log\n\n`;
    output += `Generated: ${new Date().toISOString()}\n\n`;
    output += `Total Rounds: ${changeLog.length}\n\n`;
    output += `---\n\n`;

    for (let i = 0; i < changeLog.length; i++) {
      const round = changeLog[i];
      output += `## Round ${round.round}\n\n`;
      output += `Timestamp: ${round.timestamp}\n\n`;

      if (round.changes && round.changes.length > 0) {
        output += `### Changes Made (${round.changes.length})\n\n`;

        for (let j = 0; j < round.changes.length; j++) {
          const change = round.changes[j];
          output += `#### ${j + 1}. ${change.description || 'Unnamed change'}\n\n`;

          if (change.location) {
            output += `**Location**: ${change.location}\n\n`;
          }

          if (change.original) {
            output += `**Original**:\n\`\`\`\n${change.original}\n\`\`\`\n\n`;
          }

          if (change.revised) {
            output += `**Revised**:\n\`\`\`\n${change.revised}\n\`\`\`\n\n`;
          }

          if (change.justification) {
            output += `**Justification**: ${change.justification}\n\n`;
          }

          output += `---\n\n`;
        }
      }

      if (round.usage) {
        output += `### API Usage\n\n`;
        output += `- Input Tokens: ${round.usage.inputTokens}\n`;
        output += `- Output Tokens: ${round.usage.outputTokens}\n\n`;
      }
    }

    return output;
  }

  /**
   * Format error log
   */
  formatErrorLog(errorLog, auditReport) {
    let output = `# Error Identification Log\n\n`;
    output += `Generated: ${new Date().toISOString()}\n\n`;
    output += `---\n\n`;

    output += `## Purpose\n\n`;
    output += `This log tracks:\n`;
    output += `- Unresolved structural issues\n`;
    output += `- Ambiguities in rule system (flagged but not errors)\n`;
    output += `- Potential improvements noted but not implemented\n`;
    output += `- Edge cases where revision checklist couldn't determine pass/fail\n`;
    output += `- API call metadata for debugging\n\n`;

    output += `---\n\n`;

    if (errorLog && errorLog.unresolvedIssues) {
      output += `## Unresolved Issues\n\n`;
      for (const issue of errorLog.unresolvedIssues) {
        output += `### ${issue.title}\n\n`;
        output += `${issue.description}\n\n`;
        if (issue.severity) {
          output += `**Severity**: ${issue.severity}\n\n`;
        }
      }
    }

    if (auditReport && auditReport.scores) {
      output += `## Audit Results Summary\n\n`;
      output += `- Final Score: ${auditReport.scores.overallScore}/100\n`;
      output += `- Critical Failures: ${auditReport.scores.criticalFailures}\n`;
      output += `- Major Failures: ${auditReport.scores.majorFailures}\n`;
      output += `- Needs Revision: ${auditReport.scores.needsRevision ? 'Yes' : 'No'}\n\n`;
    }

    if (errorLog && errorLog.apiCalls) {
      output += `## API Call Metadata\n\n`;
      for (const call of errorLog.apiCalls) {
        output += `### ${call.type}\n\n`;
        output += `- Model: ${call.model}\n`;
        output += `- Input Tokens: ${call.usage.inputTokens}\n`;
        output += `- Output Tokens: ${call.usage.outputTokens}\n`;
        output += `- Timestamp: ${call.timestamp}\n\n`;
      }
    }

    if (!errorLog || Object.keys(errorLog).length === 0) {
      output += `## Status\n\n`;
      output += `No errors or unresolved issues logged.\n\n`;
    }

    return output;
  }

  /**
   * Build comprehensive metadata
   */
  buildMetadata(sessionData) {
    const {
      userInput,
      initialStory,
      revisedStory,
      auditReport,
      changeLog,
      metadata
    } = sessionData;

    return {
      generation_date: new Date().toISOString(),
      word_count: (revisedStory || initialStory).split(/\s+/).length,
      parameters_used: userInput,
      inflection_points_selected: {
        entry_condition: userInput.entryCondition,
        discovery_method: userInput.discoveryMethod,
        completeness_pattern: userInput.completenessPattern,
        violation_response: userInput.violationResponse,
        exit_condition: userInput.endingType,
        thematic_focus: userInput.thematicFocus
      },
      rule_count: userInput.ruleCount || 7,
      revision_rounds: changeLog ? changeLog.length : 0,
      overall_quality_score: auditReport ? auditReport.scores.overallScore : null,
      quality_grade: auditReport ? auditReport.scores.grade : null,
      api_usage: metadata ? metadata.apiUsage : null,
      version: {
        templates: 'v1',
        system: '1.0.0'
      }
    };
  }

  /**
   * Create ZIP archive from session directory
   */
  async createZipArchive(sessionDir, sessionId, files) {
    const zipPath = path.join(this.outputDir, `${sessionId}.zip`);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        resolve(zipPath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add all files to archive
      for (const file of files) {
        archive.file(file.path, { name: file.name });
      }

      archive.finalize();
    });
  }

  /**
   * Get output directory
   */
  getOutputDir() {
    return this.outputDir;
  }

  /**
   * Clean up old session files (optional utility)
   */
  async cleanupOldSessions(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.setDate() - daysOld);

    const entries = await fs.readdir(this.outputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(this.outputDir, entry.name);
        const stats = await fs.stat(dirPath);

        if (stats.mtime < cutoffDate) {
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`Cleaned up old session: ${entry.name}`);
        }
      }
    }
  }
}

module.exports = OutputPackager;
