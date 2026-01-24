/**
 * Frontend Application
 * Handles form submission, progress tracking, and results display
 */

// State
let currentSessionId = null;
let downloadUrl = null;
let currentJobId = null;
let statusPollInterval = null;

/**
 * Safely parse a fetch Response as JSON.
 * If the server returns HTML (common when a route 404s or a proxy serves an error page),
 * this produces a readable error instead of "Unexpected token <".
 */
async function safeReadJson(response) {
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (isJson) {
        return await response.json();
    }

    const text = await response.text();
    // Try JSON anyway (some servers mislabel content-type)
    try {
        return JSON.parse(text);
    } catch {
        const preview = text.slice(0, 300).replace(/\s+/g, ' ').trim();
        const statusLine = `${response.status} ${response.statusText}`.trim();
        throw new Error(`Server did not return JSON (${statusLine}). Preview: ${preview}`);
    }
}

function stopStatusPolling() {
    if (statusPollInterval) {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
    }
}

// Initialize app on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Rule-Based Horror Story Generator...');

    try {
        await loadFormOptions();
        setupEventListeners();
        setupCostEstimator();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showError('Failed to load form options. Please refresh the page.');
    }
});

/**
 * Load options for all form select fields
 */
async function loadFormOptions() {
    try {
        const response = await fetch('/api/options');
        const data = await response.json();

        if (!data.success) {
            throw new Error('Failed to fetch options');
        }

        const { options } = data;

        // Populate select fields
        populateSelect('location', options.locations, formatOptionLabel);
        populateSelect('entryCondition', options.entryConditions, formatOptionLabel);
        populateSelect('discoveryMethod', options.discoveryMethods, formatOptionLabel);
        populateSelect('completenessPattern', options.completenessPatterns, formatOptionLabel);
        populateSelect('violationResponse', options.violationResponses, formatOptionLabel);
        populateSelect('endingType', options.exitConditions, formatOptionLabel);
        populateSelect('thematicFocus', options.themes, formatOptionLabel);

    } catch (error) {
        console.error('Error loading options:', error);
        throw error;
    }
}

/**
 * Populate a select element with options
 */
function populateSelect(elementId, options, formatter) {
    const select = document.getElementById(elementId);
    if (!select) return;

    // Clear existing options
    select.innerHTML = '<option value="">Select an option...</option>';

    // Add new options
    for (const option of options) {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = formatter(option);
        select.appendChild(optionElement);
    }
}

/**
 * Format option label (convert snake_case to Title Case)
 */
function formatOptionLabel(value) {
    return value
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const form = document.getElementById('generation-form');
    form.addEventListener('submit', handleFormSubmit);

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.addEventListener('click', handleDownload);

    const newStoryBtn = document.getElementById('new-story-btn');
    newStoryBtn.addEventListener('click', handleNewStory);

    const retryBtn = document.getElementById('retry-btn');
    retryBtn.addEventListener('click', handleRetry);

    const viewLogsBtn = document.getElementById('view-logs-btn');
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', handleViewLogs);
    }
}

/**
 * Setup cost estimator with live updates
 */
function setupCostEstimator() {
    // Initial calculation
    updateCostEstimate();

    // List of form inputs that affect cost
    const costRelevantInputs = [
        'wordCount',
        'ruleCount'
    ];

    // Attach listeners to relevant inputs
    costRelevantInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', updateCostEstimate);
            element.addEventListener('change', updateCostEstimate);
        }
    });
}

/**
 * Update cost estimate based on current form values
 */
function updateCostEstimate() {
    const wordCount = parseInt(document.getElementById('wordCount')?.value || 10000);
    const ruleCount = parseInt(document.getElementById('ruleCount')?.value || 7);

    // Get user params for estimation
    const userParams = {
        wordCount: wordCount,
        ruleCount: ruleCount,
        autoRefine: true  // Auto-refine is enabled by default
    };

    // Get estimate from TokenEstimator
    const estimate = TokenEstimator.estimate(userParams);

    // Update display elements
    const tokenEl = document.getElementById('token-estimate');
    const costEl = document.getElementById('cost-estimate');
    const methodEl = document.getElementById('generation-method');

    if (tokenEl) {
        tokenEl.textContent = TokenEstimator.formatTokens(estimate.totalTokens);
    }

    if (costEl) {
        costEl.textContent = `${TokenEstimator.formatCost(estimate.estimatedCost)} ±20%`;
    }

    if (methodEl) {
        if (estimate.metadata.useChunkedGeneration) {
            methodEl.textContent = `Chunked (${estimate.metadata.chunkCount} chunks)`;
            methodEl.title = 'Story will be generated in multiple chunks due to length';
        } else {
            methodEl.textContent = 'Single-call';
            methodEl.title = 'Story will be generated in a single API call';
        }
    }
}

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const userInput = {
        wordCount: parseInt(formData.get('wordCount')),
        ruleCount: parseInt(formData.get('ruleCount')),
        location: formData.get('location'),
        customLocation: formData.get('customLocation'),
        entryCondition: formData.get('entryCondition'),
        discoveryMethod: formData.get('discoveryMethod'),
        completenessPattern: formData.get('completenessPattern'),
        violationResponse: formData.get('violationResponse'),
        endingType: formData.get('endingType'),
        thematicFocus: formData.get('thematicFocus'),
        escalationStyle: formData.get('escalationStyle'),
        ambiguityLevel: formData.get('ambiguityLevel')
    };

    console.log('Submitting generation request:', userInput);

    // Show progress section
    showSection('progress-section');

    // Initialize progress display
    initializeProgressDisplay();

    try {
        // Kick off an async generation job
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userInput)
        });

        const startData = await safeReadJson(response);

        if (!startData.success) {
            throw new Error(startData.error || 'Generation failed to start');
        }

        // New backend returns 202 + jobId/statusUrl (async)
        if (startData.jobId && startData.statusUrl) {
            currentJobId = startData.jobId;
            currentSessionId = startData.sessionId || null;
            downloadUrl = null;

            // Poll until the job is complete
            await pollJobUntilComplete(startData.statusUrl);
            return;
        }

        // Backward-compat: if backend returns a completed payload immediately
        finalizeSuccessfulGeneration(startData);

    } catch (error) {
        console.error('Generation error:', error);
        if (window.progressInterval) {
            clearInterval(window.progressInterval);
        }
        stopStatusPolling();
        showError(error.message);
    }
}

async function pollJobUntilComplete(statusUrl) {
    stopStatusPolling();

    // Update UI hint while we poll
    const progressStatus = document.getElementById('progress-status');
    if (progressStatus) progressStatus.textContent = 'Working… (waiting for server)';

    // Poll every ~1.5s
    return await new Promise((resolve, reject) => {
        statusPollInterval = setInterval(async () => {
            try {
                const resp = await fetch(statusUrl, { method: 'GET' });
                const data = await safeReadJson(resp);

                if (!data.success) {
                    stopStatusPolling();
                    reject(new Error(data.error || 'Generation failed'));
                    return;
                }

                if (data.status === 'complete') {
                    stopStatusPolling();
                    finalizeSuccessfulGeneration(data);
                    resolve();
                    return;
                }

                if (data.status === 'failed') {
                    stopStatusPolling();
                    reject(new Error(data.error || 'Generation failed'));
                    return;
                }

                // Keep the progress bar moving but do not force 100% until complete
                const pf = document.getElementById('progress-fill');
                if (pf && pf.style.width === '100%') {
                    pf.style.width = '95%';
                }
            } catch (err) {
                stopStatusPolling();
                reject(err);
            }
        }, 1500);
    });
}

function finalizeSuccessfulGeneration(data) {
    // Stop any progress simulation
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
    }

    // Only mark progress as complete once the server has actually completed
    const progressFill = document.getElementById('progress-fill');
    const progressStatus = document.getElementById('progress-status');
    if (progressFill) progressFill.style.width = '100%';
    if (progressStatus) progressStatus.textContent = 'Complete!';

    console.log('Generation successful:', data);

    currentSessionId = data.sessionId || currentSessionId;
    downloadUrl = data.downloadUrl || downloadUrl;

    displayResults(data);
}

/**
 * Initialize progress display with session ID and timing
 */
function initializeProgressDisplay() {
    // Generate a client-side session ID for display
    const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('Z', '')
        .substring(0, 19);
    const displaySessionId = `job-${timestamp}`;

    // Set session ID
    const sessionIdEl = document.getElementById('progress-session-id');
    if (sessionIdEl) {
        sessionIdEl.textContent = displaySessionId;
    }

    // Set start time
    const startTime = new Date();
    const startTimeEl = document.getElementById('progress-start-time');
    if (startTimeEl) {
        startTimeEl.textContent = startTime.toLocaleTimeString();
    }

    // Start elapsed time tracker
    startElapsedTimeTracker(startTime);

    // Start progress simulation
    simulateProgress();
}

/**
 * Track elapsed time during generation
 */
function startElapsedTimeTracker(startTime) {
    const elapsedEl = document.getElementById('progress-elapsed');

    if (!elapsedEl) return;

    const STALL_WARNING_TIME = 180000; // 3 minutes
    const STALL_ERROR_TIME = 300000;   // 5 minutes

    // Update elapsed time every second
    const elapsedInterval = setInterval(() => {
        const now = new Date();
        const elapsedMs = now - startTime;
        const minutes = Math.floor(elapsedMs / 60000);
        const seconds = Math.floor((elapsedMs % 60000) / 1000);

        elapsedEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Detect stalls
        const progressStatus = document.getElementById('progress-status');
        if (elapsedMs > STALL_ERROR_TIME) {
            if (progressStatus) {
                progressStatus.textContent = '⚠️ Generation appears to be stalled (5+ min). See logs or retry.';
                progressStatus.style.color = '#ff4444';
            }
        } else if (elapsedMs > STALL_WARNING_TIME) {
            if (progressStatus && !progressStatus.textContent.includes('⚠️')) {
                const currentText = progressStatus.textContent;
                progressStatus.textContent = `⚠️ ${currentText} (taking longer than expected)`;
                progressStatus.style.color = '#ffaa00';
            }
        }
    }, 1000);

    // Store interval ID for cleanup
    window.elapsedTimeInterval = elapsedInterval;
}

/**
 * Simulate progress bar (since we can't get real-time updates easily)
 */
function simulateProgress() {
    const progressFill = document.getElementById('progress-fill');
    const progressStatus = document.getElementById('progress-status');

    const stages = [
        { percent: 10, message: 'Loading templates and validating parameters...' },
        { percent: 20, message: 'Building generation prompts...' },
        { percent: 40, message: 'Generating initial story (this takes the longest)...' },
        { percent: 60, message: 'Performing structural audit...' },
        { percent: 75, message: 'Analyzing audit results...' },
        { percent: 85, message: 'Applying refinements (if needed)...' },
        { percent: 95, message: 'Packaging output files...' }
    ];

    let currentStage = 0;

    const interval = setInterval(() => {
        // Hold at 95% until the server responds; do not claim completion here.
        if (currentStage >= stages.length) {
            if (progressFill) progressFill.style.width = '95%';
            if (progressStatus) progressStatus.textContent = 'Still working...';
            return;
        }

        const stage = stages[currentStage];
        if (progressFill) progressFill.style.width = `${stage.percent}%`;
        if (progressStatus) progressStatus.textContent = stage.message;

        currentStage++;
    }, 15000); // Update every 15 seconds (adjust based on expected duration)

    // Store interval ID so we can clear it if generation completes early
    window.progressInterval = interval;
}

/**
 * Display generation results
 */
function displayResults(data) {
    // Clear progress intervals if running
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
    }
    if (window.elapsedTimeInterval) {
        clearInterval(window.elapsedTimeInterval);
    }

    const { sessionId, summary } = data;

    // Update result fields
    document.getElementById('result-session-id').textContent = sessionId;
    document.getElementById('result-word-count').textContent = summary.wordCount.toLocaleString();
    document.getElementById('result-quality-score').textContent = `${summary.qualityScore}/100`;
    document.getElementById('result-grade').textContent = formatGrade(summary.grade);
    document.getElementById('result-revisions').textContent = summary.revisionsApplied;
    document.getElementById('result-duration').textContent = summary.duration;

    // Show results section
    showSection('results-section');
}

/**
 * Format grade for display
 */
function formatGrade(grade) {
    const gradeMap = {
        'excellent': '⭐ Excellent',
        'good': '✅ Good',
        'acceptable': '👍 Acceptable',
        'needs_work': '⚠️ Needs Work',
        'failed': '❌ Failed'
    };

    return gradeMap[grade] || grade;
}

/**
 * Handle download button click
 */
function handleDownload() {
    if (!downloadUrl) {
        showError('No download URL was returned. The server may not have created a ZIP package.');
        return;
    }

    window.location.href = downloadUrl;
}

/**
 * Handle "Generate Another Story" button
 */
function handleNewStory() {
    // Reset state
    currentSessionId = null;
    downloadUrl = null;

    // Reset form
    document.getElementById('generation-form').reset();

    // Show form section
    showSection('form-section');
}

/**
 * Handle retry after error
 */
function handleRetry() {
    showSection('form-section');
}

/**
 * Handle view logs button - opens logs in new window
 */
function handleViewLogs() {
    // Open Render logs in new window
    const renderUrl = 'https://dashboard.render.com';
    window.open(renderUrl, '_blank', 'noopener,noreferrer');

    // Show instructions
    alert(
        '📋 Debug Logs Access:\n\n' +
        '1. The Render dashboard will open in a new tab\n' +
        '2. Navigate to: My project → Production → rule-based-horror\n' +
        '3. Click "Logs" in the left sidebar\n' +
        '4. Look for the most recent API call logs\n' +
        '5. Screenshot any errors for diagnosis\n\n' +
        'Look for lines containing:\n' +
        '- "Calling Claude API..." (shows request start)\n' +
        '- "API error after Xs" (shows timeout/errors)\n' +
        '- "Refinement round X" (shows current stage)'
    );
}

/**
 * Show specific section, hide others
 */
function showSection(sectionId) {
    const sections = ['form-section', 'progress-section', 'results-section', 'error-section'];

    for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
            if (section === sectionId) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        }
    }
}

/**
 * Show error message
 */
function showError(message) {
    // Clear progress intervals if running
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
    }
    if (window.elapsedTimeInterval) {
        clearInterval(window.elapsedTimeInterval);
    }

    document.getElementById('error-text').textContent = message;
    showSection('error-section');
}

/**
 * Utility: Format number with commas
 */
function formatNumber(num) {
    return num.toLocaleString();
}
