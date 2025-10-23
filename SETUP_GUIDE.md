# 🚀 LMA Setup Guide - Soniox + Supabase

## Prerequisites

✅ Node.js 18+ installed  
✅ npm or yarn installed  
✅ Supabase account created  
✅ Soniox API account (https://soniox.com)  

## 📋 Step-by-Step Setup

### 1. Supabase Setup ✅ COMPLETED

Your Supabase project is already configured:
- **Project Name**: lma-transcribe-assistant
- **Project ID**: awihrdgxogqwabwnlezq
- **Region**: ap-southeast-1 (Singapore)
- **Status**: ✅ ACTIVE_HEALTHY
- **Project URL**: https://awihrdgxogqwabwnlezq.supabase.co

### 2. Get Missing API Keys 🔑

#### A. Supabase Service Role Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: **lma-transcribe-assistant**
3. Navigate to: **Settings** → **API**
4. Copy the `service_role` key (⚠️ This is a SECRET!)
5. Update in `.env` file:
   ```bash
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

#### B. Supabase Database Password

1. In Supabase Dashboard: **Settings** → **Database**
2. Copy your database password
3. Update in `.env` file:
   ```bash
   SUPABASE_DB_PASSWORD=your-password-here
   ```

#### C. Soniox API Key

1. Visit [Soniox.com](https://soniox.com)
2. Sign up / Log in
3. Go to your API dashboard
4. Copy your API key
5. Update in `.env` file:
   ```bash
   SONIOX_API_KEY=sk_test_...
   ```

### 3. Database Migration 🗄️

Run the database schema and seed data:

```bash
# Option 1: Using Supabase CLI (recommended)
cd supabase
supabase db reset

# Option 2: Manual SQL execution
# Go to Supabase Dashboard → SQL Editor
# Run the migration file: supabase/migrations/20250122_initial_schema.sql
```

### 4. Install Dependencies 📦

```bash
# Root dependencies (migration scripts)
npm install

# WebSocket Transcriber
cd lma-websocket-transcriber-stack/source/app
npm install

# Browser Extension
cd ../../../lma-browser-extension-stack
npm install

# Web UI
cd ../lma-ai-stack/source/ui
npm install
```

### 5. Build & Start 🏗️

#### WebSocket Server

```bash
cd lma-websocket-transcriber-stack/source/app
npm run build
npm start

# Should see:
# ✓ WebSocket server started on port 8080
# ✓ Connected to Supabase
# ✓ Soniox integration ready
```

#### Web UI

```bash
cd lma-ai-stack/source/ui
npm start

# Should open browser at http://localhost:3000
```

#### Browser Extension

```bash
cd lma-browser-extension-stack
npm run build

# Load unpacked extension in Chrome:
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `build` folder
```

### 6. Verify Setup ✅

#### Test WebSocket Connection

```bash
cd utilities/websocket-client
npm install
npm start

# Should connect successfully and show:
# ✓ Connected to ws://localhost:8080
```

#### Test Supabase Connection

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('Testing Supabase connection...');
supabase.from('calls').select('count').then(({ data, error }) => {
  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log('✅ Connected! Calls table accessible');
  }
});
"
```

### 7. Run Tests 🧪

```bash
# Unit tests
npm test

# Integration tests
cd lma-websocket-transcriber-stack/source/app
npm test

# Manual testing
# See TESTING_CHECKLIST.md for 57 manual test cases
```

## 🔐 Security Checklist

- [ ] `.env` files are in `.gitignore`
- [ ] `SUPABASE_SERVICE_KEY` is kept secret
- [ ] `SONIOX_API_KEY` is kept secret
- [ ] Database password is secure
- [ ] Row Level Security (RLS) is enabled in Supabase
- [ ] API keys are not hardcoded in source files

## 📁 Environment Files Summary

Created the following `.env` files:

1. **`.env`** (root) - Main configuration
2. **`lma-websocket-transcriber-stack/source/app/.env`** - WebSocket server
3. **`lma-browser-extension-stack/.env`** - Browser extension
4. **`lma-ai-stack/source/ui/.env`** - Web UI

## 🚦 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Supabase Project | ✅ Active | awihrdgxogqwabwnlezq |
| Database Schema | ⏳ Pending | Run migration SQL |
| WebSocket Server | ⏳ Pending | Need Soniox API key |
| Browser Extension | ⏳ Pending | Ready after deps install |
| Web UI | ⏳ Pending | Ready after deps install |

## 🆘 Troubleshooting

### Cannot connect to Supabase

```bash
# Check your SUPABASE_URL and keys
curl https://awihrdgxogqwabwnlezq.supabase.co/rest/v1/ \
  -H "apikey: YOUR_ANON_KEY"

# Should return API info
```

### WebSocket server won't start

1. Check if port 8080 is available:
   ```bash
   netstat -ano | findstr :8080  # Windows
   lsof -i :8080                 # macOS/Linux
   ```

2. Check `.env` file exists in `lma-websocket-transcriber-stack/source/app/`

3. Verify dependencies installed:
   ```bash
   npm list @supabase/supabase-js
   ```

### Soniox integration errors

1. Verify API key is valid:
   ```bash
   curl -X POST https://api.soniox.com/v1/transcribe \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json"
   ```

2. Check audio format (must be 16kHz mono PCM):
   ```bash
   ffprobe your-audio-file.wav
   # Should show: 16000 Hz, 1 channel
   ```

## 📚 Next Steps

1. ✅ Get Supabase service role key
2. ✅ Get Soniox API key  
3. ✅ Run database migration
4. ✅ Install all dependencies
5. ✅ Start WebSocket server
6. ✅ Start Web UI
7. ✅ Load browser extension
8. ✅ Run tests
9. ✅ Read [QUICK_START.md](QUICK_START.md) for usage
10. ✅ Check [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)

## 🎯 Quick Commands Reference

```bash
# Start everything (in separate terminals)
cd lma-websocket-transcriber-stack/source/app && npm start  # Terminal 1
cd lma-ai-stack/source/ui && npm start                      # Terminal 2

# Run tests
npm test                                                    # Root
cd lma-websocket-transcriber-stack/source/app && npm test  # WebSocket tests

# Check status
node utilities/check-env.js                                 # Verify all env vars
```

## 📖 Documentation

- [QUICK_START.md](QUICK_START.md) - 5-minute getting started
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - AWS → Soniox+Supabase migration
- [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) - 57 test cases
- [ENV_VARS_README.md](lma-websocket-transcriber-stack/ENV_VARS_README.md) - Environment variables

---

**Need Help?** Check the troubleshooting section or review the detailed documentation files.

✨ **You're almost there! Just need to fill in the API keys and you're ready to go!**

