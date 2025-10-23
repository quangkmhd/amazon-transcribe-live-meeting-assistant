# AWS to Soniox + Supabase Migration Guide

## Overview

This guide documents the migration from AWS services (Transcribe, S3, DynamoDB, Kinesis, Lambda, AppSync) to Soniox + Supabase stack.

## Phase 1: Prerequisites

### 1.1 Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Apply the database schema:
   ```bash
   cd supabase
   supabase db push
   ```
3. Obtain your credentials from Supabase Dashboard > Settings > API:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

### 1.2 Soniox Setup

1. Register for Soniox API at https://soniox.com
2. Obtain your `SONIOX_API_KEY`
3. Test the WebSocket endpoint: `wss://stt-rt.soniox.com/transcribe-websocket`

## Phase 2: Environment Configuration

### WebSocket Transcriber Stack

Create `.env` file in `lma-websocket-transcriber-stack/source/app/`:

```bash
# Supabase
SUPABASE_URL=https://[your-project-id].supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Soniox
SONIOX_API_KEY=your-soniox-api-key

# Audio
AUDIO_SAMPLE_RATE=16000
AUDIO_CHANNELS=1

# Recording
SHOULD_RECORD_CALL=true
LOCAL_TEMP_DIR=/tmp/

# Server
WS_LOG_LEVEL=debug
WS_LOG_INTERVAL=120
CPU_HEALTH_THRESHOLD=50
```

## Phase 3: Install Dependencies

```bash
cd lma-websocket-transcriber-stack/source/app
npm install
```

## Phase 4: Deploy Supabase Edge Functions

```bash
cd supabase
supabase functions deploy process-transcripts
```

Setup the cron job in Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'process-transcripts',
  '*/5 * * * * *',  -- Every 5 seconds
  $$
  SELECT net.http_post(
    url := 'https://[your-project].supabase.co/functions/v1/process-transcripts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
  );
  $$
);
```

## Phase 5: Build and Test

### Local Testing

```bash
cd lma-websocket-transcriber-stack/source/app
npm start
```

Test the WebSocket connection using the browser extension.

### Build for Production

```bash
npm run build
```

## Key Architecture Changes

### Audio Processing

**Before (AWS Transcribe):**
- Sample Rate: 8000 Hz
- Channels: 2 (stereo) - Left=Mic, Right=Display
- Channel-based speaker separation (100% accuracy)

**After (Soniox):**
- Sample Rate: 16000 Hz
- Channels: 1 (mono merged)
- AI-based speaker diarization (~90-95% accuracy)
- Supports 3+ speakers

### Data Flow

**Before:**
```
Browser → WebSocket → Fargate → AWS Transcribe → Kinesis → Lambda → DynamoDB → AppSync → UI
```

**After:**
```
Browser → WebSocket → Fargate → Soniox API → Supabase PostgreSQL → Supabase Realtime → UI
                                      ↓
                              transcript_events (buffer)
                                      ↓
                              Edge Function (processor)
                                      ↓
                              transcripts (final)
```

### Storage

**Before:**
- Recordings: S3
- Metadata: DynamoDB
- Real-time: AppSync GraphQL

**After:**
- Recordings: Supabase Storage
- Metadata: Supabase PostgreSQL
- Real-time: Supabase Realtime (Postgres Changes)

## Features Comparison

| Feature | AWS Transcribe | Soniox |
|---------|----------------|--------|
| **Speaker Detection** | Channel-based (2 speakers) | AI diarization (3-10+ speakers) |
| **Accuracy** | 100% channel separation | 90-95% speaker detection |
| **Language Detection** | ✅ Supported | ✅ Supported |
| **Custom Vocabulary** | ✅ Supported | ✅ Supported (contextual biasing) |
| **PII Redaction** | ✅ Built-in | ❌ Requires custom implementation |
| **Post-Call Analytics** | ✅ Built-in | ❌ Requires custom implementation |

## Removed AWS Dependencies

The following AWS SDK packages have been removed:

- `@aws-sdk/client-dynamodb` → Replaced by `@supabase/supabase-js`
- `@aws-sdk/client-kinesis` → Replaced by direct DB inserts
- `@aws-sdk/client-s3` → Replaced by Supabase Storage
- `@aws-sdk/client-transcribe-streaming` → Replaced by Soniox WebSocket API
- `aws-jwt-verify` → Can use Supabase Auth (optional)

## New Files Created

1. `lma-websocket-transcriber-stack/source/app/src/supabase-client.ts` - Supabase integration
2. `lma-websocket-transcriber-stack/source/app/src/calleventdata/soniox.ts` - Soniox integration
3. `supabase/functions/process-transcripts/index.ts` - Edge Function for batch processing
4. `supabase/migrations/001_initial_schema.sql` - Database schema (already existed)

## Modified Files

1. `lma-websocket-transcriber-stack/source/app/package.json` - Updated dependencies
2. `lma-websocket-transcriber-stack/source/app/src/index.ts` - Replaced AWS calls
3. `lma-websocket-transcriber-stack/source/app/src/calleventdata/eventtypes.ts` - Added sonioxWs field
4. `lma-browser-extension-stack/public/content_scripts/recorder/recorder.js` - Updated to 16kHz mono

## Testing Checklist

- [ ] Start new meeting → verify meeting record created in Supabase
- [ ] Stream audio → verify real-time transcripts appear
- [ ] Multi-speaker audio → verify speaker detection works
- [ ] End meeting → verify recording uploaded to Supabase Storage
- [ ] Check public URL works and recording is playable
- [ ] Verify duplicate prevention (run same audio twice)

## Rollback Plan

If issues occur:

1. Keep the AWS infrastructure running for 30 days
2. Revert to previous package.json and code
3. Redeploy old AWS-based version
4. DNS/Load Balancer can switch between old and new endpoints

## Cost Comparison

**AWS (30min meeting x 100/month):**
- Transcribe: $72
- Kinesis: $11
- Lambda: $2-20
- DynamoDB: $5-50
- AppSync: $5-15
- S3: $5
- **Total: ~$100-173/month**

**Soniox + Supabase (30min meeting x 100/month):**
- Soniox: $90 (transcription)
- Supabase: $25 (Pro tier) or $0 (Free tier)
- Frontend Hosting: $0 (Vercel/Netlify free)
- **Total: ~$90-115/month**

**Savings: 20-50%**

## Support

For issues:
1. Check Supabase logs in Dashboard
2. Check Soniox API status
3. Review WebSocket server logs
4. Verify environment variables

## Next Steps

1. Migrate remaining Lambda functions to Edge Functions
2. Update UI to use Supabase Realtime (Phase 5)
3. Implement speaker identity management UI
4. Add custom analytics (to replace AWS Call Analytics)

