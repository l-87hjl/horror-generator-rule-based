/**
 * Express Server
 * Web server for Rule-Based Horror Story Generator
 */

require('dotenv').config({ path: './config/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const basicAuth = require('express-basic-auth');
const Orchestrator = require('./src/backend/services/orchestrator');
const DebugLogger = require('./src/utils/debugLogger');
const ChunkPersistence = require('./src/generators/chunkPersistence');
const StageOrchestrator = require('./src/generators/stageOrchestrator');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory job store (for async generation / polling)
// NOTE: Render instances can restart; for durable storage, use a DB or object storage.
const jobs = new Map(); // jobId -> { status, createdAt, updatedAt, userInput, result, error }

function createJobId() {
  // Example: job-2026-01-22T23-10-27-1620f69a (similar shape to session ids)
  const iso = new Date().toISOString()
    .replace(/[:.]/g, '-')      // avoid filename/URL awkwardness
    .replace('Z', '');
  const rand = Math.random().toString(16).slice(2, 10);
  return `job-${iso}-${rand}`;
}

// Middleware
app.use(cors());
app.use(express.json());

// Password Protection
// Protect all routes except /api/health (needed for Render health checks)
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  console.error('WARNING: ADMIN_PASSWORD not set - application will be publicly accessible!');
  console.error('Set ADMIN_PASSWORD environment variable to enable password protection');
} else {
  console.log('✅ Password protection enabled');

  app.use((req, res, next) => {
    // Skip authentication for health check endpoint
    if (req.path === '/api/health') {
      return next();
    }

    // Apply basic auth to all other routes
    return basicAuth({
      users: { 'admin': adminPassword },
      challenge: true,
      realm: 'Rule-Based Horror Story Generator'
    })(req, res, next);
  });
}

// Serve static files from multiple directories
app.use('/generator', express.static(path.join(__dirname, 'src/frontend')));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize orchestrator
let orchestrator;
try {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY not found in environment variables');
    console.error('Please create config/.env file with your API key');
    process.exit(1);
  }

  orchestrator = new Orchestrator(apiKey, {
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
    temperature: parseFloat(process.env.GENERATION_TEMPERATURE || '0.7'),
    outputDir: 'generated',
    autoRefine: true,
    maxRevisionRounds: 3
  });

  console.log('✅ Orchestrator initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize orchestrator:', error.message);
  process.exit(1);
}

// Routes

/**
 * GET /
 * Serve landing page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

/**
 * GET /generator
 * Serve story generator application
 */
app.get('/generator', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/frontend/index.html'));
});

/**
 * GET /api/options
 * Get available options for form fields
 */
app.get('/api/options', async (req, res) => {
  try {
    const options = await orchestrator.getAvailableOptions();
    res.json({ success: true, options });
  } catch (error) {
    console.error('Error fetching options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available options'
    });
  }
});

/**
 * POST /api/generate
 * Generate a new story (async)
 *
 * Why async?
 * Hosted environments often time out long HTTP requests (your workflow can take minutes).
 * This endpoint returns quickly with a jobId, then the client polls /api/status/:jobId.
 */
app.post('/api/generate', async (req, res) => {
  try {
    const userInput = req.body;

    // Validate input
    const validation = orchestrator.validateInput(userInput);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }

    console.log('\n--- New Generation Request ---');
    console.log('User Input:', JSON.stringify(userInput, null, 2));

    // Create job and respond immediately
    const jobId = createJobId();
    const createdAt = new Date().toISOString();

    jobs.set(jobId, {
      status: 'running',
      createdAt,
      updatedAt: createdAt,
      userInput
    });

    // Kick off workflow in background (do NOT await)
    (async () => {
      try {
        const result = await orchestrator.executeWorkflow(userInput);

        const updatedAt = new Date().toISOString();
        if (result && result.success) {
          jobs.set(jobId, {
            status: 'complete',
            createdAt,
            updatedAt,
            userInput,
            result
          });
        } else {
          jobs.set(jobId, {
            status: 'failed',
            createdAt,
            updatedAt,
            userInput,
            error: (result && result.error) ? result.error : 'Unknown generation error'
          });
        }
      } catch (err) {
        const updatedAt = new Date().toISOString();
        jobs.set(jobId, {
          status: 'failed',
          createdAt,
          updatedAt,
          userInput,
          error: err?.message || String(err)
        });
        console.error('Async generation failed:', err);
      }
    })();

    // IMPORTANT: return immediately so the client doesn't time out
    res.status(202).json({
      success: true,
      jobId,
      statusUrl: `/api/status/${jobId}`
    });
  } catch (error) {
    console.error('Error during generation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * POST /api/generate-stream
 * Generate a story with Server-Sent Events (SSE) for real-time progress
 *
 * This endpoint streams progress events during generation, solving the timeout issue
 * by maintaining an active connection with heartbeats.
 */
app.post('/api/generate-stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Helper to send SSE event
  function sendEvent(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      ...data
    };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Send initial connection event
  sendEvent('connected', { message: 'SSE connection established' });

  try {
    const userInput = req.body;

    // Validate input
    const validation = orchestrator.validateInput(userInput);
    if (!validation.valid) {
      sendEvent('error', { errors: validation.errors });
      res.end();
      return;
    }

    console.log('\n--- New SSE Generation Request ---');
    console.log('User Input:', JSON.stringify(userInput, null, 2));

    // Create job for tracking
    const jobId = createJobId();
    const createdAt = new Date().toISOString();

    jobs.set(jobId, {
      status: 'running',
      createdAt,
      updatedAt: createdAt,
      userInput
    });

    sendEvent('job_created', { jobId, statusUrl: `/api/status/${jobId}` });

    // Create stage orchestrator with progress callback
    const stageOrchestrator = new StageOrchestrator({
      storyGenerator: orchestrator.storyGenerator,
      stateManager: orchestrator.stateManager,
      claudeClient: orchestrator.claudeClient,
      revisionAuditor: orchestrator.revisionAuditor,
      storyRefiner: orchestrator.storyRefiner,
      constraintEnforcer: orchestrator.constraintEnforcer,
      outputPackager: orchestrator.outputPackager,
      chunkSize: 2000, // Safe chunk size
      heartbeatInterval: 10000, // 10 second heartbeats
      onProgress: (event) => {
        // Stream progress to client
        sendEvent(event.type, event);
      }
    });

    // Generate session ID
    const sessionId = orchestrator.generateSessionId();

    // Initialize state manager for this session
    orchestrator.stateManager.initializeState(sessionId, userInput);

    sendEvent('generation_start', {
      sessionId,
      targetWords: userInput.wordCount,
      estimatedChunks: Math.ceil(userInput.wordCount / 2000)
    });

    // Run staged generation
    const result = await stageOrchestrator.generateInStages(sessionId, {
      wordCount: userInput.wordCount,
      userParams: userInput,
      runAudit: true,
      runRefinement: true
    });

    // Update job status
    const updatedAt = new Date().toISOString();
    if (result.success) {
      jobs.set(jobId, {
        status: 'complete',
        createdAt,
        updatedAt,
        userInput,
        result: {
          sessionId,
          success: true,
          summary: {
            wordCount: result.totalWords,
            qualityScore: result.stages.audit?.score || 0,
            grade: result.stages.audit?.grade || 'unknown',
            revisionsApplied: result.stages.refinement?.rounds || 0,
            duration: `${Math.round((Date.now() - new Date(createdAt).getTime()) / 1000)}s`
          },
          downloadUrl: result.downloadUrl
        }
      });

      sendEvent('complete', {
        sessionId,
        jobId,
        totalWords: result.totalWords,
        totalChunks: result.totalChunks,
        downloadUrl: result.downloadUrl,
        summary: jobs.get(jobId).result.summary
      });
    } else {
      jobs.set(jobId, {
        status: 'failed',
        createdAt,
        updatedAt,
        userInput,
        error: result.errors?.[0]?.message || 'Generation failed'
      });

      sendEvent('error', {
        sessionId,
        jobId,
        error: result.errors?.[0]?.message || 'Generation failed',
        partialResult: {
          chunksCompleted: result.totalChunks,
          wordsGenerated: result.totalWords
        }
      });
    }

  } catch (error) {
    console.error('SSE generation error:', error);
    sendEvent('error', {
      error: error.message || 'An unexpected error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    // End the SSE stream
    sendEvent('stream_end', { message: 'Stream closing' });
    res.end();
  }
});

/**
 * GET /api/status/:jobId
 * Poll job status for an async generation request
 */
app.get('/api/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status === 'complete') {
      const sessionId = job.result.sessionId;
      return res.json({
        success: true,
        status: job.status,
        jobId,
        sessionId,
        summary: job.result.summary,
        downloadUrl: `/api/download/${jobId}`, // download by jobId (server maps to session zip)
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      });
    }

    if (job.status === 'failed') {
      return res.status(500).json({
        success: false,
        status: job.status,
        jobId,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      });
    }

    // running
    return res.json({
      success: true,
      status: job.status,
      jobId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (error) {
    console.error('Error in status endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status'
    });
  }
});

/**
 * GET /api/download/:id
 * Download the generated story package.
 *
 * Accepts either:
 * - a jobId (recommended with async flow), OR
 * - a sessionId (legacy / direct).
 */
app.get('/api/download/:id', (req, res) => {
  try {
    const { id } = req.params;

    // If it's a jobId and completed, map to the real sessionId zip
    const job = jobs.get(id);
    let zipName = id;

    if (job && job.status === 'complete' && job.result?.sessionId) {
      zipName = job.result.sessionId;
    }

    const zipPath = path.join(__dirname, 'generated', `${zipName}.zip`);

    res.download(zipPath, `${zipName}.zip`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        if (!res.headersSent) {
          res.status(404).json({
            success: false,
            error: 'File not found (it may have been cleared by a redeploy/restart)'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error in download endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file'
    });
  }
});

/**
 * GET /api/session/:sessionId/debug-logs
 * Returns JSON with download URLs for debug logs and related files
 * Works even if generation is incomplete/failed
 */
app.get('/api/session/:sessionId/debug-logs', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDir = path.join(__dirname, 'generated', sessionId);

    // Check if session directory exists
    try {
      await fs.access(sessionDir);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const files = {};
    const downloads = [];

    // Check for debug log files
    const debugJsonlPath = path.join(sessionDir, 'debug_log.jsonl');
    const debugTxtPath = path.join(sessionDir, 'debug_log.txt');
    const stateFilePath = path.join(sessionDir, 'session_state.json');
    const manifestPath = path.join(sessionDir, 'chunk_manifest.json');
    const chunksDir = path.join(sessionDir, 'chunks');

    // Check each file
    try {
      await fs.access(debugJsonlPath);
      files.debugLogJsonl = `/api/session/${sessionId}/file/debug_log.jsonl`;
      downloads.push({ name: 'debug_log.jsonl', type: 'jsonl', url: files.debugLogJsonl });
    } catch { /* File doesn't exist */ }

    try {
      await fs.access(debugTxtPath);
      files.debugLogTxt = `/api/session/${sessionId}/file/debug_log.txt`;
      downloads.push({ name: 'debug_log.txt', type: 'text', url: files.debugLogTxt });
    } catch { /* File doesn't exist */ }

    try {
      await fs.access(stateFilePath);
      files.sessionState = `/api/session/${sessionId}/file/session_state.json`;
      downloads.push({ name: 'session_state.json', type: 'json', url: files.sessionState });
    } catch { /* File doesn't exist */ }

    try {
      await fs.access(manifestPath);
      files.chunkManifest = `/api/session/${sessionId}/file/chunk_manifest.json`;
      downloads.push({ name: 'chunk_manifest.json', type: 'json', url: files.chunkManifest });
    } catch { /* File doesn't exist */ }

    // List chunk files
    try {
      const chunkFiles = await fs.readdir(chunksDir);
      const chunks = chunkFiles
        .filter(f => f.startsWith('chunk_') && f.endsWith('.txt'))
        .sort()
        .map(f => ({
          name: f,
          type: 'chunk',
          url: `/api/session/${sessionId}/file/chunks/${f}`
        }));

      files.chunks = chunks.map(c => c.url);
      downloads.push(...chunks);
    } catch { /* Chunks directory doesn't exist */ }

    // Try to get log summary if debug logger was used
    let summary = null;
    try {
      const debugLogger = new DebugLogger(sessionId);
      summary = await debugLogger.getSummary();
    } catch { /* No summary available */ }

    res.json({
      success: true,
      sessionId,
      files,
      downloads,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching debug logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/session/:sessionId/file/*
 * Download individual files from a session
 */
app.get('/api/session/:sessionId/file/*', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const filePath = req.params[0]; // Everything after /file/

    // Security: Prevent directory traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file path'
      });
    }

    const fullPath = path.join(__dirname, 'generated', sessionId, filePath);

    // Verify the file is within the session directory
    const sessionDir = path.join(__dirname, 'generated', sessionId);
    if (!fullPath.startsWith(sessionDir)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.json': 'application/json',
      '.jsonl': 'application/jsonl',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);

    const content = await fs.readFile(fullPath);
    res.send(content);

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/session/:sessionId/raw-chunks
 * Returns array of chunk files for inspection before assembly
 */
app.get('/api/session/:sessionId/raw-chunks', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const chunkPersistence = new ChunkPersistence();

    const result = await chunkPersistence.loadAllChunks(sessionId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error || 'Failed to load chunks'
      });
    }

    res.json({
      success: true,
      sessionId,
      totalChunks: result.totalChunks,
      totalWords: result.totalWords,
      chunks: result.chunks.map(c => ({
        filename: c.filename,
        wordCount: c.wordCount,
        metadata: c.metadata,
        url: `/api/session/${sessionId}/file/chunks/${c.filename}`,
        preview: c.text.substring(0, 200) + '...'
      }))
    });

  } catch (error) {
    console.error('Error fetching raw chunks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/session/:sessionId/partial
 * Returns partial output for failed/incomplete generations
 */
app.get('/api/session/:sessionId/partial', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDir = path.join(__dirname, 'generated', sessionId);

    // Check if session directory exists
    try {
      await fs.access(sessionDir);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const partialOutput = {
      sessionId,
      status: 'partial',
      timestamp: new Date().toISOString(),
      artifacts: {}
    };

    // Load chunks if available
    const chunkPersistence = new ChunkPersistence();
    const chunksResult = await chunkPersistence.loadAllChunks(sessionId);
    if (chunksResult.success && chunksResult.chunks.length > 0) {
      partialOutput.artifacts.chunks = {
        count: chunksResult.totalChunks,
        totalWords: chunksResult.totalWords,
        files: chunksResult.chunks.map(c => c.filename)
      };
    }

    // Load state if available
    const stateFilePath = path.join(sessionDir, 'session_state.json');
    try {
      const stateContent = await fs.readFile(stateFilePath, 'utf-8');
      partialOutput.artifacts.state = JSON.parse(stateContent);
    } catch { /* State file doesn't exist */ }

    // Load debug logs summary if available
    try {
      const debugLogger = new DebugLogger(sessionId);
      partialOutput.artifacts.logSummary = await debugLogger.getSummary();
    } catch { /* No logs */ }

    // Load error report if exists
    const errorReportPath = path.join(sessionDir, 'error_report.json');
    try {
      const errorContent = await fs.readFile(errorReportPath, 'utf-8');
      partialOutput.errorReport = JSON.parse(errorContent);
    } catch { /* No error report */ }

    // Provide download URLs
    partialOutput.downloads = {
      debugLogs: `/api/session/${sessionId}/debug-logs`,
      rawChunks: `/api/session/${sessionId}/raw-chunks`,
      fullPackage: `/api/download/${sessionId}`
    };

    // Suggest recovery steps
    partialOutput.recovery = {
      message: 'Partial generation output available',
      suggestions: [
        'Download debug logs to identify failure point',
        'Check raw chunks for successfully generated content',
        'Review session state for tracking information'
      ]
    };

    res.json({
      success: true,
      ...partialOutput
    });

  } catch (error) {
    console.error('Error fetching partial output:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/refine
 * Refine an existing generated story (separate from initial generation)
 *
 * This allows users to download after generation, then optionally refine later.
 */
app.post('/api/refine', async (req, res) => {
  try {
    const { sessionId, story } = req.body;

    if (!sessionId && !story) {
      return res.status(400).json({
        success: false,
        error: 'Either sessionId or story text is required'
      });
    }

    console.log(`\n--- Refinement Request ---`);
    console.log(`Session ID: ${sessionId || 'none (using provided story)'}`);

    // Load story from session or use provided story
    let storyText = story;
    let sourceSessionId = sessionId;

    if (!storyText && sessionId) {
      // Load story from session directory
      const storyPath = path.join(__dirname, 'generated', sessionId, 'full_story.md');
      try {
        storyText = await fs.readFile(storyPath, 'utf-8');
      } catch (e) {
        // Try alternative filenames
        const altPath = path.join(__dirname, 'generated', sessionId, 'final_story.txt');
        try {
          storyText = await fs.readFile(altPath, 'utf-8');
        } catch (e2) {
          return res.status(404).json({
            success: false,
            error: 'Could not find story file for session'
          });
        }
      }
    }

    // Create new session for refined version
    const refinedSessionId = sourceSessionId
      ? `${sourceSessionId}-refined`
      : orchestrator.generateSessionId() + '-refined';

    console.log(`Refined Session ID: ${refinedSessionId}`);

    // Perform audit first
    console.log('🔍 Running audit...');
    const auditResult = await orchestrator.revisionAuditor.auditStory(storyText, {});

    console.log(`   Audit Score: ${auditResult.scores.overallScore}/100`);
    console.log(`   Grade: ${auditResult.scores.grade}`);

    // Refine based on audit
    if (orchestrator.revisionAuditor.needsRefinement(auditResult.scores)) {
      console.log('🔧 Applying refinement...');

      const refinementResult = await orchestrator.storyRefiner.refineStory(
        storyText,
        auditResult.rawReport,
        { maxRounds: 2 }
      );

      // Save refined story
      const refinedDir = path.join(__dirname, 'generated', refinedSessionId);
      await fs.mkdir(refinedDir, { recursive: true });
      await fs.writeFile(
        path.join(refinedDir, 'refined_story.txt'),
        refinementResult.refinedStory,
        'utf-8'
      );
      await fs.writeFile(
        path.join(refinedDir, 'refinement_changelog.json'),
        JSON.stringify(refinementResult.changeLog, null, 2),
        'utf-8'
      );

      console.log(`✅ Refinement complete - ${refinementResult.rounds} rounds`);

      res.json({
        success: true,
        sessionId: refinedSessionId,
        originalSessionId: sourceSessionId,
        downloadUrl: `/api/session/${refinedSessionId}/file/refined_story.txt`,
        auditScore: auditResult.scores.overallScore,
        refinementRounds: refinementResult.rounds,
        changeCount: refinementResult.metadata?.totalChanges || refinementResult.changeLog.length
      });
    } else {
      console.log('✅ No refinement needed');
      res.json({
        success: true,
        sessionId: sourceSessionId,
        message: 'Story passed audit, no refinement needed',
        auditScore: auditResult.scores.overallScore,
        grade: auditResult.scores.grade
      });
    }

  } catch (error) {
    console.error('Refinement error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/polish
 * Polish story for sensory detail, dialogue, and prose quality
 *
 * This is a separate pass focused on literary quality rather than structural fixes.
 */
app.post('/api/polish', async (req, res) => {
  try {
    const { sessionId, story, polishOptions = {} } = req.body;

    if (!sessionId && !story) {
      return res.status(400).json({
        success: false,
        error: 'Either sessionId or story text is required'
      });
    }

    console.log(`\n--- Polish Request ---`);
    console.log(`Session ID: ${sessionId || 'none (using provided story)'}`);
    console.log(`Options:`, polishOptions);

    // Load story from session or use provided story
    let storyText = story;
    let sourceSessionId = sessionId;

    if (!storyText && sessionId) {
      const storyPath = path.join(__dirname, 'generated', sessionId, 'full_story.md');
      try {
        storyText = await fs.readFile(storyPath, 'utf-8');
      } catch (e) {
        const altPath = path.join(__dirname, 'generated', sessionId, 'refined_story.txt');
        try {
          storyText = await fs.readFile(altPath, 'utf-8');
        } catch (e2) {
          const altPath2 = path.join(__dirname, 'generated', sessionId, 'final_story.txt');
          try {
            storyText = await fs.readFile(altPath2, 'utf-8');
          } catch (e3) {
            return res.status(404).json({
              success: false,
              error: 'Could not find story file for session'
            });
          }
        }
      }
    }

    // Create new session for polished version
    const polishedSessionId = sourceSessionId
      ? `${sourceSessionId}-polished`
      : orchestrator.generateSessionId() + '-polished';

    console.log(`Polished Session ID: ${polishedSessionId}`);

    // Build polish prompt based on options
    const polishFocus = [];
    if (polishOptions.sensoryDetail !== false) {
      polishFocus.push('SENSORY DETAIL: Add specific sounds, textures, temperatures, smells. Use physical sensations (breath, heartbeat, skin crawling). Include onomatopoeia sparingly but effectively.');
    }
    if (polishOptions.dialoguePolish !== false) {
      polishFocus.push('DIALOGUE: Make dialogue feel natural and character-specific. Use minimal tags. Ensure voices are distinct.');
    }
    if (polishOptions.emotionalInteriority !== false) {
      polishFocus.push('EMOTIONAL INTERIORITY: Deepen the narrator\'s fear responses, doubt, mounting dread. Show physical manifestations of emotion.');
    }
    if (polishOptions.atmosphericDread !== false) {
      polishFocus.push('ATMOSPHERE: Build dread through accumulation of detail. Use subtle foreshadowing. Maintain tension through pacing.');
    }

    const polishPrompt = `You are a prose polish pass for a horror story. Enhance the literary quality while preserving ALL events, plot points, and structural elements exactly.

POLISH FOCUS:
${polishFocus.join('\n\n')}

CRITICAL RULES:
1. DO NOT change any events, actions, or plot points
2. DO NOT add new information or lore
3. DO NOT change POV or tense
4. DO NOT use meta-language (avoid: threshold, mechanism, system, protocol)
5. Preserve the exact sequence of events
6. Only enhance the prose quality within each scene

Return ONLY the polished story, no commentary.

STORY TO POLISH:
${storyText}`;

    console.log('✨ Running polish pass...');

    const claudeClient = orchestrator.claudeClient;
    const response = await claudeClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: Math.min(storyText.length * 2, 64000),
      temperature: 0.4,
      messages: [{
        role: 'user',
        content: polishPrompt
      }]
    });

    const polishedStory = response.content[0].text;

    // Save polished story
    const polishedDir = path.join(__dirname, 'generated', polishedSessionId);
    await fs.mkdir(polishedDir, { recursive: true });
    await fs.writeFile(
      path.join(polishedDir, 'polished_story.txt'),
      polishedStory,
      'utf-8'
    );
    await fs.writeFile(
      path.join(polishedDir, 'polish_options.json'),
      JSON.stringify(polishOptions, null, 2),
      'utf-8'
    );

    console.log(`✅ Polish complete`);
    console.log(`   Input words: ${storyText.split(/\s+/).length}`);
    console.log(`   Output words: ${polishedStory.split(/\s+/).length}`);

    res.json({
      success: true,
      sessionId: polishedSessionId,
      originalSessionId: sourceSessionId,
      downloadUrl: `/api/session/${polishedSessionId}/file/polished_story.txt`,
      inputWords: storyText.split(/\s+/).length,
      outputWords: polishedStory.split(/\s+/).length,
      polishOptions
    });

  } catch (error) {
    console.error('Polish error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.1.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n=================================`);
  console.log(`Rule-Based Horror Story Generator`);
  console.log(`=================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API Key configured: ✅`);
  console.log(`Model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929'}`);
  console.log(`\nReady to generate stories! 👻`);
  console.log(`=================================\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});
