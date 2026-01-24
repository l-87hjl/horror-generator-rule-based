/**
 * Chunk Persistence Module
 * Ensures every generated chunk is saved immediately with atomic writes
 *
 * Purpose: Prevent data loss during chunked generation by saving each chunk
 * as soon as it's generated, using atomic write operations.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ChunkPersistence {
  constructor(options = {}) {
    // Base directory for sessions - works on both local and Render
    this.baseDir = options.baseDir || process.env.SESSIONS_DIR || path.join(process.cwd(), 'generated');
    this.tempDir = options.tempDir || os.tmpdir();
  }

  /**
   * Get the session directory path
   *
   * @param {string} sessionId - Session identifier
   * @returns {string} Full path to session directory
   */
  getSessionDir(sessionId) {
    return path.join(this.baseDir, sessionId);
  }

  /**
   * Get the chunks directory path for a session
   *
   * @param {string} sessionId - Session identifier
   * @returns {string} Full path to chunks directory
   */
  getChunksDir(sessionId) {
    return path.join(this.getSessionDir(sessionId), 'chunks');
  }

  /**
   * Save a chunk immediately with atomic write
   *
   * Uses a temp file + rename strategy to ensure no partial writes corrupt the file.
   *
   * @param {string} sessionId - Session identifier
   * @param {number} chunkNumber - Chunk sequence number (1-indexed)
   * @param {string} chunkText - The generated chunk text
   * @param {number} wordCount - Word count of the chunk
   * @returns {Promise<{success: boolean, filepath: string, error?: string}>}
   */
  async saveChunkImmediately(sessionId, chunkNumber, chunkText, wordCount) {
    const startTime = Date.now();
    const chunksDir = this.getChunksDir(sessionId);
    const paddedNum = chunkNumber.toString().padStart(3, '0');
    const filename = `chunk_${paddedNum}.txt`;
    const filepath = path.join(chunksDir, filename);

    // Create temp file path
    const tempFilename = `.chunk_${paddedNum}_${Date.now()}.tmp`;
    const tempPath = path.join(chunksDir, tempFilename);

    try {
      // Ensure chunks directory exists
      await fs.mkdir(chunksDir, { recursive: true });

      // Build chunk content with metadata header
      const metadata = {
        chunk_number: chunkNumber,
        word_count: wordCount,
        saved_at: new Date().toISOString(),
        session_id: sessionId
      };

      const content = [
        `<!-- CHUNK METADATA`,
        JSON.stringify(metadata, null, 2),
        `-->`,
        '',
        chunkText
      ].join('\n');

      // Step 1: Write to temp file
      await fs.writeFile(tempPath, content, 'utf-8');

      // Step 2: Atomic rename (this is the atomic operation on most filesystems)
      await fs.rename(tempPath, filepath);

      const duration = Date.now() - startTime;

      return {
        success: true,
        filepath: filepath,
        filename: filename,
        wordCount: wordCount,
        chunkNumber: chunkNumber,
        duration: duration
      };

    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      return {
        success: false,
        filepath: filepath,
        error: error.message,
        errorType: error.code || error.constructor.name
      };
    }
  }

  /**
   * Save chunk manifest with current generation progress
   *
   * @param {string} sessionId - Session identifier
   * @param {Array} chunks - Array of chunk metadata objects
   * @param {object} state - Current generation state
   * @returns {Promise<{success: boolean, filepath: string, error?: string}>}
   */
  async saveChunkManifest(sessionId, chunks, state = {}) {
    const sessionDir = this.getSessionDir(sessionId);
    const filepath = path.join(sessionDir, 'chunk_manifest.json');
    const tempPath = path.join(sessionDir, `.chunk_manifest_${Date.now()}.tmp`);

    const manifest = {
      version: '2.1.0',
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      total_chunks: chunks.length,
      total_words: chunks.reduce((sum, c) => sum + (c.wordCount || 0), 0),
      chunks: chunks.map((c, i) => ({
        number: c.chunkNumber || i + 1,
        filename: c.filename || `chunk_${(c.chunkNumber || i + 1).toString().padStart(3, '0')}.txt`,
        word_count: c.wordCount || 0,
        saved_at: c.savedAt || new Date().toISOString()
      })),
      state_summary: {
        rules_active: state.activeRules || 0,
        rules_violated: state.violatedRules || 0,
        entity_capabilities: state.entityCapabilities || 0
      }
    };

    try {
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf-8');
      await fs.rename(tempPath, filepath);

      return {
        success: true,
        filepath: filepath,
        manifest: manifest
      };
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore
      }

      return {
        success: false,
        filepath: filepath,
        error: error.message
      };
    }
  }

  /**
   * Load all chunks for a session
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<{success: boolean, chunks: Array, error?: string}>}
   */
  async loadAllChunks(sessionId) {
    const chunksDir = this.getChunksDir(sessionId);

    try {
      const files = await fs.readdir(chunksDir);
      const chunkFiles = files
        .filter(f => f.startsWith('chunk_') && f.endsWith('.txt'))
        .sort();

      const chunks = [];
      for (const file of chunkFiles) {
        const filepath = path.join(chunksDir, file);
        const content = await fs.readFile(filepath, 'utf-8');

        // Extract metadata if present
        let metadata = {};
        let text = content;

        const metadataMatch = content.match(/<!-- CHUNK METADATA\n([\s\S]*?)\n-->/);
        if (metadataMatch) {
          try {
            metadata = JSON.parse(metadataMatch[1]);
            text = content.slice(metadataMatch[0].length).trim();
          } catch (e) {
            // Ignore metadata parse errors
          }
        }

        chunks.push({
          filename: file,
          filepath: filepath,
          metadata: metadata,
          text: text,
          wordCount: metadata.word_count || this.countWords(text)
        });
      }

      return {
        success: true,
        chunks: chunks,
        totalChunks: chunks.length,
        totalWords: chunks.reduce((sum, c) => sum + c.wordCount, 0)
      };

    } catch (error) {
      return {
        success: false,
        chunks: [],
        error: error.message
      };
    }
  }

  /**
   * Get chunk file paths for a session
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<{success: boolean, files: Array, error?: string}>}
   */
  async getChunkFiles(sessionId) {
    const chunksDir = this.getChunksDir(sessionId);

    try {
      const files = await fs.readdir(chunksDir);
      const chunkFiles = files
        .filter(f => f.startsWith('chunk_') && f.endsWith('.txt'))
        .sort()
        .map(f => ({
          filename: f,
          filepath: path.join(chunksDir, f)
        }));

      return {
        success: true,
        files: chunkFiles,
        count: chunkFiles.length,
        chunksDir: chunksDir
      };
    } catch (error) {
      return {
        success: false,
        files: [],
        error: error.message
      };
    }
  }

  /**
   * Count words in text
   *
   * @param {string} text - Text to count
   * @returns {number} Word count
   */
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Combine all chunks into a single story
   *
   * @param {string} sessionId - Session identifier
   * @param {string} separator - Separator between chunks (default: scene break)
   * @returns {Promise<{success: boolean, story: string, filepath: string, error?: string}>}
   */
  async combineChunks(sessionId, separator = '\n\n---\n\n') {
    const sessionDir = this.getSessionDir(sessionId);
    const filepath = path.join(sessionDir, '00_combined_draft.txt');

    try {
      const loadResult = await this.loadAllChunks(sessionId);
      if (!loadResult.success) {
        return {
          success: false,
          error: loadResult.error
        };
      }

      const story = loadResult.chunks.map(c => c.text).join(separator);

      // Save combined story
      await fs.writeFile(filepath, story, 'utf-8');

      return {
        success: true,
        story: story,
        filepath: filepath,
        totalChunks: loadResult.totalChunks,
        totalWords: loadResult.totalWords
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ChunkPersistence;
