# Quick Start Guide - Soniox + Supabase Stack

## Prerequisites

- Node.js 16+ installed
- Supabase account (free tier works)
- Soniox API account

## 5-Minute Setup

### Step 1: Supabase Setup (2 minutes)

1. Go to https://supabase.com and create a new project
2. Wait for project to initialize (~2 minutes)
3. Go to **Settings → API** and copy:
   - `Project URL` → This is your `SUPABASE_URL`
   - `anon public` key → This is your `SUPABASE_ANON_KEY`
   - `service_role` key → This is your `SUPABASE_SERVICE_KEY` (keep secret!)

4. Apply database schema:
```bash
cd supabase
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

5. Verify storage bucket exists:
   - Go to **Storage** in Supabase Dashboard
   - You should see `meeting-recordings` bucket
   - If not, run the SQL from `supabase/migrations/001_initial_schema.sql`

### Step 2: Soniox API Key (1 minute)

1. Go to https://soniox.com
2. Create account / Sign in
3. Go to Dashboard → API Keys
4. Copy your API key

### Step 3: Configure Environment (1 minute)

Create `.env` file in `lma-websocket-transcriber-stack/source/app/`:

```bash
# Supabase (from Step 1)
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Soniox (from Step 2)
SONIOX_API_KEY=sk_...

# Defaults (can customize later)
SHOULD_RECORD_CALL=true
WS_LOG_LEVEL=debug
```

### Step 4: Install & Run (1 minute)

```bash
cd lma-websocket-transcriber-stack/source/app
npm install
npm start
```

You should see:
```
Server listening at http://0.0.0.0:8080
```

### Step 5: Test with Browser Extension

1. Load the browser extension from `lma-browser-extension-stack/public/`
2. Open a Google Meet/Zoom/Teams meeting
3. Click "Start Recording" in the extension
4. Speak and watch transcripts appear in real-time!

## Verify It's Working

### Check Supabase

1. Go to **Table Editor** in Supabase Dashboard
2. Open `meetings` table → Should see a new row when you start a meeting
3. Open `transcript_events` table → Should see transcripts appearing
4. Open `transcripts` table → Should see processed transcripts (after a few seconds)

### Check Logs

**Server logs:**
```
[SONIOX]: [<meeting-id>] - Connected to Soniox API
[SONIOX]: [<meeting-id>] - Saved transcript for speaker 1
[MEETING]: [<meeting-id>] - Meeting started
```

**Supabase logs:**
- Dashboard → Logs → Database → Check for INSERT operations

## Deploy Edge Function (Optional)

For automatic transcript processing:

```bash
cd supabase
supabase functions deploy process-transcripts
```

Then setup cron job in Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'process-transcripts',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/process-transcripts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR-SERVICE-KEY"}'::jsonb
  );
  $$
);
```

## Common Issues

### "Cannot find module @supabase/supabase-js"
**Solution:** Run `npm install` in the app directory

### "SUPABASE_URL is not defined"
**Solution:** Create `.env` file with your credentials

### "Failed to connect to Soniox"
**Solution:** Check your `SONIOX_API_KEY` is correct

### "No transcripts appearing"
**Solution:** 
1. Check server logs for errors
2. Verify Soniox API key is valid
3. Check Supabase table for inserts

### "Recording not saved"
**Solution:**
1. Verify `SHOULD_RECORD_CALL=true` in `.env`
2. Check Supabase Storage bucket exists
3. Check storage policies allow uploads

## Next Steps

- Read `MIGRATION_GUIDE.md` for full details
- Read `ENV_VARS_README.md` for all configuration options
- Read `IMPLEMENTATION_SUMMARY.md` for architecture details

## Production Deployment

For production, you'll need to:

1. Use production Supabase project (not test project)
2. Setup proper authentication (JWT verification)
3. Configure CORS properly
4. Setup monitoring and alerts
5. Enable RLS (Row Level Security) in Supabase
6. Use environment-specific API keys

See `MIGRATION_GUIDE.md` section 8 for full deployment instructions.

## Support

If you encounter issues:

1. Check the logs (server + Supabase)
2. Review `MIGRATION_GUIDE.md` troubleshooting section
3. Verify all environment variables are set correctly
4. Test Supabase connection: `https://YOUR-PROJECT.supabase.co/rest/v1/`

## Architecture Overview

```
Browser (16kHz mono audio)
    ↓ WebSocket
WebSocket Server (Fastify)
    ↓ WebSocket  
Soniox API (Speech-to-Text + Speaker Detection)
    ↓ Save
Supabase PostgreSQL
    ↓ Process
Edge Function (batch processor)
    ↓ Store
Final Transcripts + Realtime
```

**That's it!** You should now have a working Soniox + Supabase-based transcription system.

