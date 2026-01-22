/**
 * Frontend Application
 * Handles form submission, progress tracking, and results display
 */

// State
let currentSessionId = null;
let downloadUrl = null;

// Initialize app on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Rule-Based Horror Story Generator...');

    try {
        await loadFormOptions();
        setupEventListeners();
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

    // Start progress simulation
    simulateProgress();

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userInput)
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Generation failed');
        }

        
        // Only mark progress as complete once the server has actually responded successfully
        const progressFill = document.getElementById('progress-fill');
        const progressStatus = document.getElementById('progress-status');
        if (progressFill) progressFill.style.width = '100%';
        if (progressStatus) progressStatus.textContent = 'Complete!';

console.log('Generation successful:', data);

        // Store session info
        currentSessionId = data.sessionId;
        downloadUrl = data.downloadUrl;

        // Show results
        displayResults(data);

    } catch (error) {
        console.error('Generation error:', error);
        if (window.progressInterval) {
            clearInterval(window.progressInterval);
        }
        showError(error.message);
    }
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
    // Clear progress interval if running
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
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
    document.getElementById('error-text').textContent = message;
    showSection('error-section');
}

/**
 * Utility: Format number with commas
 */
function formatNumber(num) {
    return num.toLocaleString();
}
