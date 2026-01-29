/**
 * Debug Logger Module
 * Structured logging to both console AND files for comprehensive debugging
 *
 * Purpose: Eliminate screenshot dependency for debugging by creating
 * downloadable, structured log files alongside console output.
 *
 * Log Levels:
 * - START: Generation workflow started
 * - CHUNK_BEGIN: Starting to generate a chunk
 * - CHUNK_COMPLETE: Chunk successfully generated
 * - STATE_UPDATE: State was modified
 * - ERROR: An error occurred
 * - COMPLETE: Generation workflow completed
 * - INFO: General informational message
 * - WARN: Warning (non-fatal issue)
 */

const fs = require('fs').promises;
const path = require('path');

// Log level constants
const LEVELS = {
  START: 'START',
  CHUNK_BEGIN: 'CHUNK_BEGIN',
  CHUNK_COMPLETE: 'CHUNK_COMPLETE',
  STATE_UPDATE: 'STATE_UPDATE',
  ERROR: 'ERROR',
  COMPLETE: 'COMPLETE',
  INFO: 'INFO',
  WARN: 'WARN'
};

class DebugLogger {
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.baseDir = options.baseDir || process.env.SESSIONS_DIR || path.join(process.cwd(), 'generated');
    this.logBuffer = []; // Buffer for batched writes
    this.writeInterval = options.writeInterval || 1000; // Write buffer every 1s
    this.isInitialized = false;
    this.startTime = Date.now();

    // File paths
    this.sessionDir = path.join(this.baseDir, sessionId);
    this.jsonlPath = path.join(this.sessionDir, 'debug_log.jsonl');
    this.txtPath = path.join(this.sessionDir, 'debug_log.txt');

    // Start buffer flush interval
    this._flushIntervalId = null;
  }

  /**
   * Initialize the logger (create directories and files)
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      await fs.mkdir(this.sessionDir, { recursive: true });

      // Create initial log files with headers
      const header = `=== Debug Log for Session: ${this.sessionId} ===\n`;
      const started = `Started: ${new Date().toISOString()}\n`;
      const separator = '='.repeat(60) + '\n\n';

      await fs.writeFile(this.txtPath, header + started + separator, 'utf-8');
      await fs.writeFile(this.jsonlPath, '', 'utf-8'); // Empty JSONL file

      this.isInitialized = true;

      // Start periodic buffer flush
      this._flushIntervalId = setInterval(() => {
        this.flushBuffer().catch(err => {
          console.error('[DebugLogger] Buffer flush error:', err.message);
        });
      }, this.writeInterval);

    } catch (error) {
      console.error('[DebugLogger] Failed to initialize:', error.message);
    }
  }

  /**
   * Create a structured log entry
   *
   * @param {string} level - Log level (from LEVELS)
   * @param {string} stage - Current stage (e.g., 'generation', 'extraction', 'audit')
   * @param {string} message - Human-readable message
   * @param {object} data - Additional data for the log entry
   * @returns {object} The log entry
   */
  createEntry(level, stage, message, data = {}) {
    const elapsed = Date.now() - this.startTime;

    return {
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsed,
      elapsed_formatted: this.formatElapsed(elapsed),
      sessionId: this.sessionId,
      level: level,
      stage: stage,
      message: message,
      chunk: data.chunk || null,
      data: {
        ...data,
        chunk: undefined // Don't duplicate
      }
    };
  }

  /**
   * Format elapsed time as human readable
   *
   * @param {number} ms - Milliseconds elapsed
   * @returns {string} Formatted time string
   */
  formatElapsed(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  /**
   * Convert entry to human-readable text format
   *
   * @param {object} entry - Log entry
   * @returns {string} Formatted text
   */
  entryToText(entry) {
    const timeStr = entry.timestamp.replace('T', ' ').replace('Z', '');
    const lines = [
      `[${timeStr}] ${entry.level} | ${entry.stage}${entry.chunk ? ` | chunk=${entry.chunk}` : ''}`,
      `  Message: ${entry.message}`
    ];

    // Add relevant data fields
    if (entry.data) {
      const dataEntries = Object.entries(entry.data).filter(([k, v]) => v !== null && v !== undefined);
      for (const [key, value] of dataEntries) {
        if (typeof value === 'object') {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        } else {
          lines.push(`  ${key}: ${value}`);
        }
      }
    }

    lines.push(''); // Empty line between entries
    return lines.join('\n');
  }

  /**
   * Log a message (writes to console immediately, buffers for file)
   *
   * @param {string} level - Log level
   * @param {string} stage - Current stage
   * @param {string} message - Log message
   * @param {object} data - Additional data
   */
  async log(level, stage, message, data = {}) {
    const entry = this.createEntry(level, stage, message, data);

    // Console output (immediate)
    const consolePrefix = this.getConsolePrefix(level);
    console.log(`${consolePrefix}[${stage}] ${message}`);
    if (Object.keys(data).length > 0 && level !== LEVELS.INFO) {
      console.log(`   Data:`, JSON.stringify(data, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    }

    // Buffer for file write
    this.logBuffer.push(entry);

    // Force flush on errors or completion
    if (level === LEVELS.ERROR || level === LEVELS.COMPLETE) {
      await this.flushBuffer();
    }

    return entry;
  }

  /**
   * Get console prefix for log level
   *
   * @param {string} level - Log level
   * @returns {string} Console prefix with emoji
   */
  getConsolePrefix(level) {
    const prefixes = {
      [LEVELS.START]: '[DEBUG] [START] ',
      [LEVELS.CHUNK_BEGIN]: '[DEBUG] [CHUNK] ',
      [LEVELS.CHUNK_COMPLETE]: '[DEBUG] [CHUNK] ',
      [LEVELS.STATE_UPDATE]: '[DEBUG] [STATE] ',
      [LEVELS.ERROR]: '[DEBUG] [ERROR] ',
      [LEVELS.COMPLETE]: '[DEBUG] [DONE] ',
      [LEVELS.INFO]: '[DEBUG] [INFO] ',
      [LEVELS.WARN]: '[DEBUG] [WARN] '
    };
    return prefixes[level] || '[DEBUG] ';
  }

  /**
   * Flush buffer to files
   */
  async flushBuffer() {
    if (this.logBuffer.length === 0) return;
    if (!this.isInitialized) {
      await this.initialize();
    }

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Append to JSONL file
      const jsonlContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(this.jsonlPath, jsonlContent, 'utf-8');

      // Append to text file
      const txtContent = entries.map(e => this.entryToText(e)).join('\n');
      await fs.appendFile(this.txtPath, txtContent, 'utf-8');

    } catch (error) {
      console.error('[DebugLogger] Failed to flush buffer:', error.message);
      // Put entries back in buffer to try again
      this.logBuffer = [...entries, ...this.logBuffer];
    }
  }

  // Convenience methods for each log level

  async start(message, data = {}) {
    return this.log(LEVELS.START, 'initialization', message, data);
  }

  async chunkBegin(chunkNumber, data = {}) {
    return this.log(LEVELS.CHUNK_BEGIN, 'generation', `Beginning chunk ${chunkNumber}`, {
      chunk: chunkNumber,
      ...data
    });
  }

  async chunkComplete(chunkNumber, wordCount, data = {}) {
    return this.log(LEVELS.CHUNK_COMPLETE, 'generation', `Chunk ${chunkNumber} completed`, {
      chunk: chunkNumber,
      wordCount: wordCount,
      ...data
    });
  }

  async stateUpdate(message, data = {}) {
    return this.log(LEVELS.STATE_UPDATE, 'state', message, data);
  }

  async error(message, data = {}) {
    return this.log(LEVELS.ERROR, data.stage || 'unknown', message, data);
  }

  async complete(message, data = {}) {
    return this.log(LEVELS.COMPLETE, 'workflow', message, data);
  }

  async info(stage, message, data = {}) {
    return this.log(LEVELS.INFO, stage, message, data);
  }

  async warn(stage, message, data = {}) {
    return this.log(LEVELS.WARN, stage, message, data);
  }

  /**
   * Finalize logging and flush all remaining entries
   */
  async finalize() {
    if (this._flushIntervalId) {
      clearInterval(this._flushIntervalId);
      this._flushIntervalId = null;
    }

    await this.flushBuffer();

    // Write final summary to text file
    const summary = `\n${'='.repeat(60)}\nSession completed at: ${new Date().toISOString()}\nTotal elapsed: ${this.formatElapsed(Date.now() - this.startTime)}\n${'='.repeat(60)}\n`;

    try {
      await fs.appendFile(this.txtPath, summary, 'utf-8');
    } catch (error) {
      console.error('[DebugLogger] Failed to write summary:', error.message);
    }
  }

  /**
   * Get paths to log files
   *
   * @returns {object} Object with log file paths
   */
  getLogPaths() {
    return {
      jsonl: this.jsonlPath,
      txt: this.txtPath,
      sessionDir: this.sessionDir
    };
  }

  /**
   * Load log entries from JSONL file
   *
   * @returns {Promise<Array>} Array of log entries
   */
  async loadLogs() {
    try {
      const content = await fs.readFile(this.jsonlPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get log summary for API response
   *
   * @returns {Promise<object>} Log summary object
   */
  async getSummary() {
    const logs = await this.loadLogs();

    const summary = {
      sessionId: this.sessionId,
      totalEntries: logs.length,
      levels: {},
      stages: {},
      errors: [],
      chunks: {
        started: 0,
        completed: 0
      },
      firstEntry: logs[0]?.timestamp || null,
      lastEntry: logs[logs.length - 1]?.timestamp || null
    };

    for (const entry of logs) {
      // Count by level
      summary.levels[entry.level] = (summary.levels[entry.level] || 0) + 1;

      // Count by stage
      summary.stages[entry.stage] = (summary.stages[entry.stage] || 0) + 1;

      // Track chunks
      if (entry.level === LEVELS.CHUNK_BEGIN) summary.chunks.started++;
      if (entry.level === LEVELS.CHUNK_COMPLETE) summary.chunks.completed++;

      // Collect errors
      if (entry.level === LEVELS.ERROR) {
        summary.errors.push({
          timestamp: entry.timestamp,
          message: entry.message,
          stage: entry.stage,
          data: entry.data
        });
      }
    }

    return summary;
  }
}

// Export class and constants
module.exports = DebugLogger;
module.exports.LEVELS = LEVELS;
