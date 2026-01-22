/**
 * Express Server
 * Web server for Rule-Based Horror Story Generator
 */

require('dotenv').config({ path: './config/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const Orchestrator = require('./src/backend/services/orchestrator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
 * Generate a new story
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

    // Execute workflow (this will take a while)
    const result = await orchestrator.executeWorkflow(userInput);

    if (result.success) {
      res.json({
        success: true,
        sessionId: result.sessionId,
        summary: result.summary,
        downloadUrl: `/api/download/${result.sessionId}`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error during generation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/download/:sessionId
 * Download the generated story package
 */
app.get('/api/download/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const zipPath = path.join(__dirname, 'generated', `${sessionId}.zip`);

    res.download(zipPath, `${sessionId}.zip`, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        if (!res.headersSent) {
          res.status(404).json({
            success: false,
            error: 'File not found'
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
