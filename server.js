/**
 * Express Server
 * Web server for Rule-Based Horror Story Generator
 */

require('dotenv').config({ path: './config/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const basicAuth = require('express-basic-auth');
const Orchestrator = require('./src/backend/services/orchestrator');

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
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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
