# Setup Guide - Rule-Based Horror Story Generator

Complete installation and configuration guide for getting the system running.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation Steps](#installation-steps)
3. [Configuration](#configuration)
4. [First Run](#first-run)
5. [Troubleshooting](#troubleshooting)
6. [Production Deployment](#production-deployment)

## System Requirements

### Minimum Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **RAM**: 2GB minimum, 4GB recommended
- **Disk Space**: 500MB for application, 5GB+ for generated content
- **Anthropic API Key**: Required (sign up at anthropic.com)

### Supported Platforms

- macOS 10.15+
- Ubuntu 20.04+ / Debian 10+
- Windows 10+ (with WSL2 recommended)

### Network Requirements

- Outbound HTTPS (443) access to api.anthropic.com
- Inbound access to localhost:3000 (or configured port)

## Installation Steps

### 1. Install Node.js

#### macOS (using Homebrew)
```bash
brew install node
```

#### Ubuntu/Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Windows
Download installer from [nodejs.org](https://nodejs.org/)

**Verify installation:**
```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be v8.0.0 or higher
```

### 2. Get Anthropic API Key

1. Visit [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create new API key
5. Copy and save securely (you won't see it again)

### 3. Clone/Extract Project

If you received this as a ZIP:
```bash
unzip rule-based-horror.zip
cd rule-based-horror
```

If from git:
```bash
git clone <repository-url>
cd rule-based-horror
```

### 4. Install Dependencies

```bash
npm install
```

This will install:
- Express.js (web server)
- Anthropic SDK (Claude API)
- YAML parser (template loading)
- Archiver (ZIP creation)
- Additional utilities

**Expected output:**
```
added 150 packages, and audited 151 packages in 15s
found 0 vulnerabilities
```

### 5. Configure Environment

```bash
# Copy example environment file
cp config/.env.example config/.env

# Edit with your favorite editor
nano config/.env  # or vim, code, etc.
```

**Add your API key:**
```env
ANTHROPIC_API_KEY=sk-ant-your-actual-api-key-here
NODE_ENV=development
PORT=3000
```

**⚠️ Important**: Never commit `.env` file to version control!

### 6. Verify Configuration

```bash
# Check that templates are accessible
ls -la templates/v1/

# Should see:
# inflection_points/
# schemas/
# locations.yaml
# thematic_elements.yaml
```

```bash
# Verify config file
cat config/config.json
```

## Configuration

### API Configuration (`config/config.json`)

```json
{
  "api": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 16000,
    "temperature": 0.7
  },
  "generation": {
    "default_word_count": 10000,
    "min_word_count": 5000,
    "max_word_count": 20000,
    "default_rule_count": 7,
    "min_rule_count": 3,
    "max_rule_count": 12
  },
  "templates": {
    "version": "v1",
    "base_path": "templates"
  },
  "output": {
    "generated_dir": "generated",
    "archive_format": "zip"
  },
  "revision": {
    "max_revision_rounds": 3,
    "critical_failure_threshold": 1,
    "auto_refine_on_failure": true
  }
}
```

### Environment Variables (`.env`)

**Required:**
- `ANTHROPIC_API_KEY` - Your Anthropic API key

**Optional:**
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `CLAUDE_MODEL` - Override model (default: claude-sonnet-4-5-20250929)
- `GENERATION_TEMPERATURE` - Override temperature (default: 0.7)

### Directory Structure Setup

The system creates directories automatically, but you can pre-create them:

```bash
mkdir -p generated
mkdir -p docs
```

## First Run

### 1. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

**Expected output:**
```
✅ Orchestrator initialized successfully

=================================
Rule-Based Horror Story Generator
=================================
Server running on http://localhost:3000
API Key configured: ✅
Model: claude-sonnet-4-5-20250929

Ready to generate stories! 👻
=================================
```

### 2. Access Web Interface

Open browser to: `http://localhost:3000`

You should see the form with all fields populated from templates.

### 3. Generate Test Story

Recommended first test:
- Word Count: 5000 (faster)
- Location: desert_diner
- Entry: new_hire
- Discovery: explicit_list
- Completeness: complete_but_misunderstood
- Violation: escalation
- Ending: true_exit_with_cost
- Theme: service_and_servitude
- Escalation: psychological

Click "Generate Story" and wait 2-3 minutes.

### 4. Verify Output

Check `generated/` directory:
```bash
ls -la generated/

# Should see:
# session-YYYY-MM-DD-HH-mm-ss-xxxxxxxx/
# session-YYYY-MM-DD-HH-mm-ss-xxxxxxxx.zip
```

Download and extract ZIP to verify all 7 files are present.

## Troubleshooting

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or change port in .env
echo "PORT=3001" >> config/.env
```

### API Key Issues

```
ERROR: ANTHROPIC_API_KEY not found in environment variables
```

**Solution:**
1. Verify `.env` file exists in `config/` directory
2. Check file is named `.env` exactly (not `.env.txt`)
3. Verify API key format: `sk-ant-...`
4. Restart server after adding key

### Template Loading Errors

```
Failed to load template inflection_points/entry_conditions.yaml
```

**Solution:**
```bash
# Verify YAML files exist
ls templates/v1/inflection_points/

# Check YAML syntax
npx js-yaml templates/v1/locations.yaml

# Verify file permissions
chmod 644 templates/v1/**/*.yaml
```

### Generation Timeout

**Solution:**
- Check internet connection to api.anthropic.com
- Verify API key is valid and has credits
- Try shorter word count (5000) for testing
- Check Anthropic status page

### Low Quality Scores

If consistently getting scores below 60:

1. Check that templates haven't been modified incorrectly
2. Try simpler parameters:
   - Lower rule count (3-5)
   - Explicit rule discovery
   - Clear violation responses
3. Review audit report for specific failures
4. Consider reporting patterns to improve templates

## Production Deployment

### Security Checklist

- [ ] API key stored securely (environment variable, not in code)
- [ ] `.env` file in `.gitignore`
- [ ] CORS configured appropriately
- [ ] Rate limiting implemented (if public-facing)
- [ ] HTTPS enabled (use reverse proxy like nginx)
- [ ] File upload limits set
- [ ] Output directory cleanup scheduled

### Recommended Setup

1. **Use Process Manager:**
   ```bash
   npm install -g pm2
   pm2 start server.js --name horror-generator
   pm2 save
   pm2 startup  # Follow instructions
   ```

2. **Enable HTTPS:**
   ```bash
   # Use nginx reverse proxy
   sudo apt install nginx
   # Configure SSL with Let's Encrypt
   ```

3. **Set Up Log Rotation:**
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   ```

4. **Schedule Cleanup:**
   ```bash
   # Add to crontab
   0 2 * * * find /path/to/generated -mtime +30 -delete
   ```

### Environment Variables (Production)

```env
ANTHROPIC_API_KEY=<your-key>
NODE_ENV=production
PORT=3000
```

### Monitoring

Monitor these metrics:
- API usage and costs (Anthropic dashboard)
- Disk space in `generated/` directory
- Server memory usage
- Generation success rate
- Average quality scores

### Scaling Considerations

For high-volume usage:
- Implement request queue (e.g., Bull, RabbitMQ)
- Add Redis for session management
- Use S3 or similar for generated file storage
- Consider multiple worker instances
- Implement caching for template loads

## Next Steps

After successful setup:

1. **Read Documentation**: Review `README.md` thoroughly
2. **Explore Templates**: Familiarize yourself with template structure
3. **Generate Stories**: Try various parameter combinations
4. **Review Outputs**: Study audit reports to understand quality metrics
5. **Customize**: Begin editing templates for your specific needs

## Getting Help

- Check `README.md` for usage documentation
- Review template files for parameter options
- Check `CHANGELOG.md` for version-specific information
- Enable debug logging: `DEBUG=* npm start`

---

**You're ready to generate structurally sound rule-based horror! 👻**
