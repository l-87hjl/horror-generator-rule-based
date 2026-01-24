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

    // Copyright protection: Define allowed and forbidden paths
    this.ALLOWED_OUTPUT_PATHS = [
      'generated/',
      this.outputDir,
      path.normalize(this.outputDir)
    ];

    this.FORBIDDEN_OUTPUT_PATHS = [
      'data_private/',
      'transcripts/',
      'copyrighted_examples/',
      'third_party_texts/',
      'reference_materials/',
      'source_materials/',
      '../',      // Prevent path traversal
      '../../',
      '..\\',     // Windows path traversal
      '..\\..\\',
      '..',       // Prevent any relative path escapes
    ];

    this.FORBIDDEN_EXTENSIONS = [
      '.srt',
      '.vtt',
      '.sbv',
      '.sub'
    ];
  }

  /**
   * Copyright Protection: Check if file is safe to package
   * Uses allowlist approach - file must be in allowed paths AND not in forbidden
   *
   * @param {string} filepath - Path to check
   * @returns {boolean} - True if safe to package
   */
  isSafeToPackage(filepath) {
    // Normalize the path to handle different separators and relative paths
    const normalizedPath = path.normalize(filepath);
    const absolutePath = path.resolve(filepath);

    // Check 1: FORBIDDEN PATHS (security - check first)
    for (const forbidden of this.FORBIDDEN_OUTPUT_PATHS) {
      if (normalizedPath.includes(forbidden) || absolutePath.includes(forbidden)) {
        console.warn(`⚠️  Copyright Protection: Blocking forbidden path: ${filepath}`);
        console.warn(`   Matched forbidden pattern: ${forbidden}`);
        return false;
      }
    }

    // Check 2: FORBIDDEN EXTENSIONS (transcript files)
    const ext = path.extname(normalizedPath).toLowerCase();
    if (this.FORBIDDEN_EXTENSIONS.includes(ext)) {
      console.warn(`⚠️  Copyright Protection: Blocking forbidden extension: ${filepath}`);
      console.warn(`   Extension ${ext} indicates transcript/caption file`);
      return false;
    }

    // Check 3: ALLOWED PATHS (must be in allowed directory)
    let isInAllowedPath = false;
    for (const allowed of this.ALLOWED_OUTPUT_PATHS) {
      const allowedAbsolute = path.resolve(allowed);
      if (absolutePath.startsWith(allowedAbsolute)) {
        isInAllowedPath = true;
        break;
      }
    }

    if (!isInAllowedPath) {
      console.warn(`⚠️  Copyright Protection: Blocking file outside allowed paths: ${filepath}`);
      console.warn(`   File must be in: ${this.ALLOWED_OUTPUT_PATHS.join(', ')}`);
      return false;
    }

    // Check 4: SPECIAL FILENAMES (additional protection)
    const basename = path.basename(normalizedPath).toLowerCase();
    const suspiciousPatterns = [
      'transcript',
      'copyrighted',
      'third_party',
      'source_material'
    ];

    for (const pattern of suspiciousPatterns) {
      if (basename.includes(pattern)) {
        console.warn(`⚠️  Copyright Protection: Blocking suspicious filename: ${filepath}`);
        console.warn(`   Filename contains protected pattern: ${pattern}`);
        return false;
      }
    }

    // All checks passed - safe to package
    return true;
  }

  /**
   * Verify all files in session directory are safe before packaging
   *
   * @param {Array} files - List of file objects with paths
   * @returns {Object} - Verification result with safe files and blocked files
   */
  verifySafetyBeforePackaging(files) {
    const safeFiles = [];
    const blockedFiles = [];

    for (const file of files) {
      if (this.isSafeToPackage(file.path)) {
        safeFiles.push(file);
      } else {
        blockedFiles.push(file);
        console.error(`❌ Copyright Protection: File blocked from package: ${file.path}`);
      }
    }

    if (blockedFiles.length > 0) {
      console.warn('');
      console.warn('⚠️  COPYRIGHT PROTECTION ALERT ⚠️');
      console.warn(`Blocked ${blockedFiles.length} file(s) from output package:`);
      blockedFiles.forEach(f => console.warn(`  - ${f.path}`));
      console.warn('');
      console.warn('These files may contain copyrighted material.');
      console.warn('See DATA_POLICY.md for details.');
      console.warn('');
    }

    return {
      safe: safeFiles,
      blocked: blockedFiles,
      allSafe: blockedFiles.length === 0
    };
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
      errorLog,
      stateFilePath,
      stateManager,
      status,
      currentStage
    } = sessionData;

    const files = [];

    // 0. README (TXT) - Always create status indicator
    const readmePath = path.join(sessionDir, 'README.txt');
    const readmeContent = this.buildReadme(sessionData);
    await fs.writeFile(readmePath, readmeContent);
    files.push({ name: 'README.txt', path: readmePath });

    // 0. Session State (JSON) - if available
    if (stateFilePath && stateManager) {
      // State file already saved by orchestrator, just add to files list
      files.push({ name: 'session_state.json', path: stateFilePath });
    }

    // 0.5. Checkpoint Files (JSON) - Phase 2
    if (sessionData.checkpoints && sessionData.checkpoints.length > 0) {
      const checkpointDir = path.join(sessionDir, 'checkpoints');

      for (const checkpoint of sessionData.checkpoints) {
        const checkpointPath = path.join(
          checkpointDir,
          `checkpoint_scene_${checkpoint.scene_number}.json`
        );
        files.push({
          name: `checkpoints/checkpoint_scene_${checkpoint.scene_number}.json`,
          path: checkpointPath
        });
      }

      console.log(`   Added ${sessionData.checkpoints.length} checkpoint files`);
    }

    // 0.6. Chunk Files (MD) - Phase 2 Independent Files Architecture
    if (sessionData.chunks && sessionData.chunks.length > 0) {
      console.log(`   Processing ${sessionData.chunks.length} chunk files...`);

      for (const chunk of sessionData.chunks) {
        if (chunk.filePath) {
          // Chunk file already exists, add to files list
          files.push({
            name: `chunks/${chunk.filename}`,
            path: chunk.filePath
          });
        }
      }

      console.log(`   Added ${sessionData.chunks.length} chunk files`);
    }

    // 0.7. Chunk Manifest (JSON) - Phase 2
    if (sessionData.manifestPath) {
      console.log(`   Adding chunk manifest...`);
      files.push({
        name: 'chunk_manifest.json',
        path: sessionData.manifestPath
      });
      console.log(`   Added chunk manifest`);
    }

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

    // Phase 4: Hard Constraint Check Results
    if (errorLog && errorLog.constraintViolations) {
      const cv = errorLog.constraintViolations;
      output += `## Hard Constraint Check Results (Phase 4)\n\n`;
      output += `**Overall Status:** ${cv.summary.totalViolations === 0 ? '✅ PASS' : '⚠️ FAIL'}\n\n`;
      output += `- Total Violations: ${cv.summary.totalViolations}\n`;
      output += `- Critical Violations: ${cv.summary.criticalViolations}\n`;
      output += `- Major Violations: ${cv.summary.majorViolations}\n\n`;

      // No-Retcon Rule
      output += `### No-Retcon Rule: ${cv.details.noRetcon.passed ? 'PASS' : 'FAIL'}\n\n`;
      if (cv.details.noRetcon.violations && cv.details.noRetcon.violations.length > 0) {
        output += `**Violations Detected:** ${cv.details.noRetcon.violations.length}\n\n`;
        for (const violation of cv.details.noRetcon.violations) {
          output += `- **Type:** ${violation.type}\n`;
          output += `  - **Severity:** ${violation.severity}\n`;
          output += `  - **Description:** ${violation.description}\n`;
          if (violation.detected_text) {
            output += `  - **Detected:** "${violation.detected_text}"\n`;
          }
          output += `\n`;
        }
      } else {
        output += `No violations detected.\n\n`;
      }

      // Knowledge Consistency
      output += `### Knowledge Consistency: ${cv.details.knowledge.passed ? 'PASS' : 'FAIL'}\n\n`;
      if (cv.details.knowledge.issues && cv.details.knowledge.issues.length > 0) {
        output += `**Issues Detected:** ${cv.details.knowledge.issues.length}\n\n`;
        for (const issue of cv.details.knowledge.issues) {
          output += `- **Type:** ${issue.type}\n`;
          output += `  - **Severity:** ${issue.severity}\n`;
          output += `  - **Description:** ${issue.description}\n`;
          if (issue.suggestion) {
            output += `  - **Suggestion:** ${issue.suggestion}\n`;
          }
          output += `\n`;
        }
      } else {
        output += `No issues detected.\n\n`;
      }

      // Escalation Traceability
      output += `### Escalation Traceability: ${cv.details.escalation.passed ? 'PASS' : 'FAIL'}\n\n`;
      if (cv.details.escalation.untracedEscalations && cv.details.escalation.untracedEscalations.length > 0) {
        output += `**Untraced Escalations:** ${cv.details.escalation.untracedEscalations.length}\n\n`;
        for (const escalation of cv.details.escalation.untracedEscalations) {
          output += `- **Type:** ${escalation.type}\n`;
          output += `  - **Severity:** ${escalation.severity}\n`;
          output += `  - **Description:** ${escalation.description}\n`;
          if (escalation.suggestion) {
            output += `  - **Suggestion:** ${escalation.suggestion}\n`;
          }
          output += `\n`;
        }
      } else {
        output += `No untraced escalations detected.\n\n`;
      }

      output += `---\n\n`;
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
      metadata,
      stateManager,
      constraintCheck,
      chunkMetadata,
      checkpoints,
      status,
      currentStage,
      errorLog
    } = sessionData;

    // Get state summary if available
    const stateSummary = stateManager ? stateManager.getSummary() : null;

    // Get constraint check summary if available (Phase 4)
    const constraintSummary = constraintCheck ? {
      passed: constraintCheck.passed,
      total_violations: constraintCheck.summary.totalViolations,
      critical_violations: constraintCheck.summary.criticalViolations,
      major_violations: constraintCheck.summary.majorViolations,
      checks: {
        no_retcon: constraintCheck.results.noRetcon.passed,
        knowledge_consistency: constraintCheck.results.knowledge.passed,
        escalation_traceability: constraintCheck.results.escalation.passed
      }
    } : null;

    return {
      generation_status: status || 'unknown',
      completion_stage: currentStage || 'unknown',
      generation_date: new Date().toISOString(),
      word_count: (revisedStory || initialStory) ? (revisedStory || initialStory).split(/\s+/).length : 0,
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
      state_tracking: stateSummary,
      constraint_enforcement: constraintSummary,
      chunked_generation: chunkMetadata ? {
        enabled: true,
        total_chunks: chunkMetadata.total_chunks,
        total_words: chunkMetadata.total_words,
        target_words: chunkMetadata.target_words,
        checkpoint_count: checkpoints ? checkpoints.length : 0,
        checkpoint_version: chunkMetadata.checkpoint_version
      } : {
        enabled: false
      },
      version: {
        templates: 'v1',
        system: '1.5.0' // Phase 2: Checkpoint Protocol
      }
    };
  }

  /**
   * Build README file with generation status
   */
  buildReadme(sessionData) {
    const {
      status,
      currentStage,
      errorLog,
      metadata,
      initialStory,
      auditReport,
      revisedStory,
      changeLog,
      stateManager,
      checkpoints,
      chunks
    } = sessionData;

    let readme = '';

    // Header
    readme += '═══════════════════════════════════════════════════════════════\n';
    readme += '  RULE-BASED HORROR STORY GENERATOR - OUTPUT PACKAGE\n';
    readme += '═══════════════════════════════════════════════════════════════\n\n';

    // Generation Status
    if (status === 'completed') {
      readme += 'GENERATION STATUS: ✅ COMPLETE\n\n';
      readme += 'This package contains a fully generated horror story with all\n';
      readme += 'supporting artifacts.\n\n';
    } else if (status === 'failed') {
      readme += '⚠️  GENERATION STATUS: INCOMPLETE (PARTIAL RECOVERY) ⚠️\n\n';
      readme += 'This generation failed to complete. However, partial artifacts\n';
      readme += 'have been recovered and packaged for your review.\n\n';

      // Failure details
      const failureError = errorLog.unresolvedIssues.find(issue => issue.severity === 'critical');
      if (failureError) {
        readme += `ERROR DETAILS:\n`;
        readme += `  Stage: ${failureError.stage}\n`;
        readme += `  Error: ${failureError.description}\n`;
        readme += `  Time: ${failureError.timestamp}\n\n`;
      }

      readme += '⚠️  WARNING: The story and other artifacts may be incomplete.\n';
      readme += 'Check the files below to see what was successfully generated.\n\n';
    } else {
      readme += `GENERATION STATUS: ${status.toUpperCase()}\n\n`;
    }

    // Available Artifacts
    readme += '───────────────────────────────────────────────────────────────\n';
    readme += 'ARTIFACTS INCLUDED IN THIS PACKAGE:\n';
    readme += '───────────────────────────────────────────────────────────────\n\n';

    if (initialStory) {
      readme += '  ✅ 01_initial_generation.txt\n';
      readme += '     Initial story generated by Claude AI\n\n';
    }

    if (auditReport) {
      readme += '  ✅ 02_revision_audit_report.md\n';
      readme += '     Structural integrity audit with 30+ checks\n\n';
    }

    if (revisedStory) {
      readme += '  ✅ 03_revised_story.txt\n';
      readme += '     Final story with refinements applied\n\n';
    } else if (initialStory) {
      readme += '  ⚠️  03_revised_story.txt (copy of initial)\n';
      readme += '     Refinement not completed\n\n';
    }

    if (changeLog && changeLog.length > 0) {
      readme += `  ✅ 04_change_implementation_log.md\n`;
      readme += `     ${changeLog.length} refinement rounds documented\n\n`;
    }

    readme += '  ✅ 05_error_identification_log.md\n';
    readme += '     Error logs and API call history\n\n';

    readme += '  ✅ 06_story_metadata.json\n';
    readme += '     Technical metadata and statistics\n\n';

    if (stateManager) {
      readme += '  ✅ session_state.json\n';
      readme += '     Canonical state tracking (Phase 1-5)\n\n';
    }

    if (checkpoints && checkpoints.length > 0) {
      readme += `  ✅ checkpoints/ (${checkpoints.length} files)\n`;
      readme += '     Phase 2: Checkpoint protocol data\n\n';
    }

    if (chunks && chunks.length > 0) {
      readme += `  ✅ Story generated in ${chunks.length} chunks\n`;
      readme += '     Phase 2: Chunked generation enabled\n\n';
    }

    // System Information
    readme += '───────────────────────────────────────────────────────────────\n';
    readme += 'SYSTEM INFORMATION:\n';
    readme += '───────────────────────────────────────────────────────────────\n\n';
    readme += `  Generator Version: v1.5.0 (Phase 2)\n`;
    readme += `  Template Version: v1\n`;
    readme += `  Model: Claude Sonnet 4.5\n`;

    if (metadata) {
      readme += `  Generated: ${metadata.startTime}\n`;
      if (metadata.duration) {
        readme += `  Duration: ${metadata.duration}\n`;
      }
    }

    readme += '\n';

    // Additional Notes
    if (status === 'failed') {
      readme += '───────────────────────────────────────────────────────────────\n';
      readme += 'RECOVERY NOTES:\n';
      readme += '───────────────────────────────────────────────────────────────\n\n';
      readme += 'Even though generation failed, the partial artifacts may still\n';
      readme += 'be valuable. The initial story (if present) represents the raw\n';
      readme += 'output before the failure occurred.\n\n';
      readme += 'To retry generation:\n';
      readme += '  1. Review the error in 05_error_identification_log.md\n';
      readme += '  2. Adjust parameters if needed\n';
      readme += '  3. Submit a new generation request\n\n';
    }

    readme += '───────────────────────────────────────────────────────────────\n';
    readme += 'For support or questions, see documentation at:\n';
    readme += 'https://github.com/anthropics/claude-code\n';
    readme += '───────────────────────────────────────────────────────────────\n';

    return readme;
  }

  /**
   * Create ZIP archive from session directory
   * Includes copyright protection checks
   */
  async createZipArchive(sessionDir, sessionId, files) {
    const zipPath = path.join(this.outputDir, `${sessionId}.zip`);

    // COPYRIGHT PROTECTION: Verify all files are safe before packaging
    console.log('🔒 Running copyright protection checks...');
    const verification = this.verifySafetyBeforePackaging(files);

    if (!verification.allSafe) {
      console.error('');
      console.error('❌ COPYRIGHT PROTECTION: Cannot create package');
      console.error(`Blocked ${verification.blocked.length} file(s) containing copyrighted material`);
      console.error('See console output above for details');
      console.error('');

      // Still create the package with safe files only
      console.warn('⚠️  Creating package with safe files only');
    }

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        if (verification.allSafe) {
          console.log(`✅ Package created successfully with all ${verification.safe.length} files`);
        } else {
          console.warn(`⚠️  Package created with ${verification.safe.length} safe files (${verification.blocked.length} blocked)`);
        }
        resolve(zipPath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('Archiver warning:', err);
        } else {
          reject(err);
        }
      });

      archive.pipe(output);

      // Add ONLY safe files to archive
      for (const file of verification.safe) {
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
