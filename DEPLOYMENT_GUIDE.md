# Deployment Guide - Render

Complete guide for deploying the Rule-Based Horror Story Generator to Render.

---

## ✅ Pre-Deployment Checklist

Your application **already has everything needed**:

- ✅ **server.js** - Express server with all routes
- ✅ **package.json** - All dependencies specified
- ✅ **Backend services** - Complete API integration
- ✅ **Frontend** - Landing page + generator interface
- ✅ **Templates** - YAML template system (v1)
- ✅ **Configuration** - render.yaml for auto-deployment
- ✅ **Health check** - `/api/health` endpoint
- ✅ **Environment handling** - Reads from `process.env`

---

## 🚀 Deploy to Render (5 Minutes)

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (easiest option)
3. Authorize Render to access your repositories

### Step 2: Create New Web Service

1. **Click "New +"** → **"Web Service"**

2. **Connect Repository:**
   - Select: `l-87hjl/rule-based-horror`
   - Branch: `claude/horror-story-generator-DTAVx`
   - Click "Connect"

3. **Configure Service** (auto-filled from render.yaml):
   ```
   Name: rule-based-horror-generator
   Region: Oregon (US West)
   Branch: claude/horror-story-generator-DTAVx
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   Plan: Free
   ```

4. **Environment Variables** (CRITICAL):
   - Click "Environment" tab
   - Add variable:
     ```
     Key: ANTHROPIC_API_KEY
     Value: [Your Anthropic API key]
     ```
   - Click "Save Changes"

5. **Click "Create Web Service"**

### Step 3: Wait for Deployment

Render will:
- Clone your repository
- Run `npm install`
- Start server with `npm start`
- Health check at `/api/health`

**Time:** 2-3 minutes

### Step 4: Access Your App

Once deployed, you'll get a URL:
```
https://rule-based-horror-generator.onrender.com
```

Visit:
- **Landing page:** `https://your-app.onrender.com/`
- **Generator:** `https://your-app.onrender.com/generator`
- **Health check:** `https://your-app.onrender.com/api/health`

---

## 🔧 Configuration Details

### Environment Variables Needed

| Variable | Value | Where to Get |
|----------|-------|--------------|
| `ANTHROPIC_API_KEY` | Your API key | [console.anthropic.com](https://console.anthropic.com) |
| `NODE_ENV` | `production` | Auto-set by render.yaml |
| `PORT` | Auto-assigned | Render provides this |

### Port Configuration

The application correctly uses:
```javascript
const PORT = process.env.PORT || 3000;
```

Render automatically sets `PORT` - no changes needed.

### Health Check

Render pings `/api/health` to verify app is running:
```javascript
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```

---

## 📁 What Gets Deployed

Render deploys everything in your repository:

```
Deployed Files:
├── server.js                 ✅ Entry point
├── package.json             ✅ Dependencies
├── src/
│   ├── backend/             ✅ All services
│   └── frontend/            ✅ Web interface
├── templates/v1/            ✅ YAML templates
├── config/
│   └── config.json          ✅ System config
└── public/
    └── index.html           ✅ Landing page

NOT Deployed (in .gitignore):
├── node_modules/            ❌ Rebuilt on Render
├── generated/               ❌ Local only
├── data_private/            ❌ Copyright protected
└── config/.env              ❌ Secrets (use Render env vars)
```

---

## 🔒 Security Best Practices

### API Key Security

**✅ DO:**
- Set `ANTHROPIC_API_KEY` in Render dashboard only
- Never commit `.env` files to Git
- Use Render's environment variable encryption

**❌ DON'T:**
- Put API keys in code
- Commit secrets to GitHub
- Share environment variables publicly

### Verification

After deployment, verify API key is loaded:
```bash
# Check server logs in Render dashboard
# Should see: "API Key configured: ✅"
```

---

## 🐛 Troubleshooting

### Issue: "ANTHROPIC_API_KEY not found"

**Solution:**
1. Go to Render dashboard
2. Select your service
3. Click "Environment" tab
4. Add `ANTHROPIC_API_KEY` variable
5. Click "Save" (triggers redeploy)

### Issue: "Application failed to respond"

**Check:**
1. **Logs** - Render dashboard → "Logs" tab
2. **Build** - Did `npm install` succeed?
3. **Start** - Is server running on correct PORT?
4. **Health check** - Is `/api/health` responding?

**Common fixes:**
- Verify Node version ≥ 18 (specified in package.json)
- Check all dependencies installed
- Verify no syntax errors in server.js

### Issue: "Template files not found"

**Solution:**
- Verify `templates/v1/` folder committed to Git
- Check file paths in templateLoader.js
- Templates use relative paths from project root

### Issue: "Free tier goes to sleep"

**Behavior:**
- Free tier sleeps after 15 minutes of inactivity
- First request after sleep takes ~30 seconds
- Subsequent requests are fast

**Solutions:**
- Upgrade to paid tier ($7/month) for always-on
- Use external uptime monitor (UptimeRobot) to ping every 10 minutes
- Accept sleep behavior for low-traffic personal project

---

## 💰 Pricing

### Free Tier (Sufficient for Testing)
- ✅ 750 hours/month
- ✅ Auto-sleep after 15 min inactivity
- ✅ Custom domain support
- ✅ Automatic HTTPS
- ⚠️ Limited to 512MB RAM

### Starter Tier ($7/month)
- ✅ Always-on (no sleep)
- ✅ 1GB RAM
- ✅ Priority support

**Recommendation:** Start with free tier, upgrade if needed.

---

## 🔄 Automatic Deployments

Render auto-deploys when you push to GitHub:

```bash
# Make changes locally
git add .
git commit -m "Update feature"
git push origin claude/horror-story-generator-DTAVx

# Render automatically:
# 1. Detects push
# 2. Pulls latest code
# 3. Runs build
# 4. Deploys new version
```

**Time:** 2-3 minutes per deployment

---

## 📊 Monitoring

### Render Dashboard

Access at: [dashboard.render.com](https://dashboard.render.com)

**Monitor:**
- ✅ Deployment status
- ✅ Server logs (real-time)
- ✅ Resource usage (CPU, RAM)
- ✅ Request metrics
- ✅ Health check status

### Logs

View logs for debugging:
```
Dashboard → Your Service → Logs
```

Logs show:
- Server startup
- API requests
- Errors and warnings
- Story generation progress

---

## 🔗 Custom Domain (Optional)

### Add Your Domain

1. **Buy domain** (Namecheap, Google Domains, etc.)

2. **In Render:**
   - Dashboard → Your Service → "Settings"
   - Scroll to "Custom Domains"
   - Click "Add Custom Domain"
   - Enter: `your-domain.com`

3. **Update DNS:**
   - Add CNAME record: `www` → `your-app.onrender.com`
   - Or A record to Render's IP

4. **SSL Certificate:**
   - Render provides free automatic HTTPS
   - No configuration needed

---

## 🧪 Testing After Deployment

### 1. Health Check
```bash
curl https://your-app.onrender.com/api/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-22T...",
  "version": "1.0.0"
}
```

### 2. Landing Page
Visit: `https://your-app.onrender.com/`

Should see:
- Candle icon
- Title
- "Start Generating Stories" button

### 3. Generator
Click button or visit: `https://your-app.onrender.com/generator`

Should see:
- Story configuration form
- All dropdown options populated
- "Generate Story" button

### 4. Full Generation Test

1. Fill out form with test parameters
2. Click "Generate Story"
3. Wait 3-5 minutes
4. Download ZIP package
5. Verify all 7 files present

---

## 📈 Performance Optimization

### Current Setup (Good for Most Use)

- ✅ Node.js server
- ✅ Express routing
- ✅ Static file serving
- ✅ API caching (where appropriate)

### If You Need Better Performance

1. **CDN for Static Files:**
   - Move frontend to Cloudflare/Vercel
   - Keep backend on Render

2. **Database (if storing stories):**
   - Add PostgreSQL (Render provides free tier)
   - Store generated stories
   - Build story gallery

3. **Redis Caching:**
   - Cache template loads
   - Cache API responses
   - Reduce generation time

---

## 🆘 Getting Help

### Resources

- **Render Docs:** [render.com/docs](https://render.com/docs)
- **Render Status:** [status.render.com](https://status.render.com)
- **Support:** [community.render.com](https://community.render.com)

### Common Issues Documentation

See `TROUBLESHOOTING.md` (if created) or check:
- Server logs in Render dashboard
- GitHub repository issues
- This deployment guide

---

## 🎉 Success Checklist

After deployment, verify:

- [ ] App accessible at Render URL
- [ ] Landing page loads correctly
- [ ] Generator form loads and populates
- [ ] Health check returns healthy status
- [ ] Can generate a test story
- [ ] Downloaded ZIP contains all files
- [ ] No errors in Render logs
- [ ] API key working (see "API Key configured: ✅" in logs)

---

## 🔄 Updating Your Deployment

### To Deploy Changes:

```bash
# 1. Make changes locally
code server.js  # or any file

# 2. Commit and push
git add .
git commit -m "Describe your changes"
git push origin claude/horror-story-generator-DTAVx

# 3. Render auto-deploys (2-3 minutes)
# 4. Check dashboard for deployment status
```

### To Rollback:

If something breaks:
1. Go to Render dashboard
2. Click "Manual Deploy" → "Deploy commit"
3. Select previous working commit
4. Click "Deploy"

---

## 📝 Environment Variable Management

### Current Variables

| Variable | Set Where | Value |
|----------|-----------|-------|
| `ANTHROPIC_API_KEY` | Render dashboard | Your API key |
| `NODE_ENV` | render.yaml | `production` |
| `PORT` | Render (auto) | Assigned by Render |

### Adding New Variables

1. **Update code** to read from `process.env.NEW_VAR`
2. **Add to Render:**
   - Dashboard → Environment
   - Add new variable
   - Save (auto-redeploys)
3. **Document** in this file

---

## 🎯 Quick Start Summary

**Absolute fastest path to live deployment:**

```bash
1. Go to render.com
2. Sign in with GitHub
3. New Web Service → Connect rule-based-horror repo
4. Add environment variable: ANTHROPIC_API_KEY
5. Click "Create Web Service"
6. Wait 3 minutes
7. Visit your-app.onrender.com
8. Done! ✅
```

---

**Your app is ready to deploy!** All the code is complete and committed to your GitHub repository. Just follow the steps above to get it live on Render.
