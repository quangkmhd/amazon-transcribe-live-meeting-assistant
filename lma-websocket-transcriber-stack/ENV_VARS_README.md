# Environment Variables Configuration

This document describes all environment variables needed for the WebSocket Transcriber after Soniox + Supabase migration.

## Required Variables

### Supabase Configuration

```bash
# Your Supabase project URL
SUPABASE_URL=https://[your-project-id].supabase.co

# Supabase anonymous key (public, safe for client-side)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase service role key (SECRET! Server-side only)
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find:**
- Supabase Dashboard → Settings → API
- Project URL and API Keys are shown there

### Soniox API Configuration

```bash
# Your Soniox API key
SONIOX_API_KEY=your-soniox-api-key-here
```

**Where to find:**
- Register at https://soniox.com
- Get API key from your account dashboard

## Optional Variables

### Audio Configuration

```bash
# Sample rate for audio processing (default: 16000)
AUDIO_SAMPLE_RATE=16000

# Number of audio channels (default: 1 for mono)
AUDIO_CHANNELS=1
```

### Recording Configuration

```bash
# Enable/disable call recording (default: false)
SHOULD_RECORD_CALL=true

# Temporary directory for audio files (default: /tmp/)
LOCAL_TEMP_DIR=/tmp/
```

### Server Configuration

```bash
# Logging level: debug, info, warn, error (default: debug)
WS_LOG_LEVEL=debug

# Health check log interval in seconds (default: 120)
WS_LOG_INTERVAL=120

# CPU health threshold percentage (default: 50)
CPU_HEALTH_THRESHOLD=50
```

## Removed AWS Variables

The following AWS environment variables are **NO LONGER NEEDED**:

```bash
# ❌ REMOVED
AWS_REGION
KINESIS_STREAM_NAME
RECORDINGS_BUCKET_NAME
RECORDING_FILE_PREFIX
TCA_DATA_ACCESS_ROLE_ARN
CALL_ANALYTICS_FILE_PREFIX
TRANSCRIBE_API_MODE
TRANSCRIBE_LANGUAGE_CODE
TRANSCRIBE_LANGUAGE_OPTIONS
TRANSCRIBE_PREFERRED_LANGUAGE
CUSTOM_VOCABULARY_NAME
CUSTOM_LANGUAGE_MODEL_NAME
IS_CONTENT_REDACTION_ENABLED
CONTENT_REDACTION_TYPE
TRANSCRIBE_PII_ENTITY_TYPES
IS_TCA_POST_CALL_ANALYTICS_ENABLED
POST_CALL_CONTENT_REDACTION_OUTPUT
SHOW_SPEAKER_LABEL
```

## Example .env File

Create a `.env` file in `lma-websocket-transcriber-stack/source/app/` with these values:

```bash
# Supabase
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Nzk0MDMwMDAsImV4cCI6MTk5NDk3OTAwMH0.XXXXXXXXXXXXXXXXXXXXXXXXXXXX
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY3OTQwMzAwMCwiZXhwIjoxOTk0OTc5MDAwfQ.XXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Soniox
SONIOX_API_KEY=sk_test_1234567890abcdef

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

## Security Notes

⚠️ **IMPORTANT:**

1. **NEVER** commit `.env` files to version control
2. **NEVER** share your `SUPABASE_SERVICE_KEY` publicly
3. **NEVER** share your `SONIOX_API_KEY` publicly
4. The `SUPABASE_ANON_KEY` is safe to use in client-side code (browser extension)
5. Use Row Level Security (RLS) in Supabase to protect data

## Deployment

### Local Development

1. Copy `.env.example` to `.env`
2. Fill in your actual values
3. Run `npm start`

### Docker

Pass environment variables using `-e` flag or `--env-file`:

```bash
docker run -e SUPABASE_URL=... -e SONIOX_API_KEY=... your-image
```

Or use `--env-file`:

```bash
docker run --env-file .env your-image
```

### Kubernetes

Create a Secret:

```bash
kubectl create secret generic lma-secrets \
  --from-literal=SUPABASE_URL=... \
  --from-literal=SUPABASE_SERVICE_KEY=... \
  --from-literal=SONIOX_API_KEY=...
```

Reference in deployment:

```yaml
envFrom:
  - secretRef:
      name: lma-secrets
```

### AWS ECS/Fargate

Define environment variables in task definition:

```json
{
  "environment": [
    { "name": "SUPABASE_URL", "value": "https://..." },
    { "name": "SONIOX_API_KEY", "value": "sk_..." }
  ],
  "secrets": [
    {
      "name": "SUPABASE_SERVICE_KEY",
      "valueFrom": "arn:aws:secretsmanager:..."
    }
  ]
}
```

## Validation

To verify your environment variables are correctly set:

```bash
cd lma-websocket-transcriber-stack/source/app
node -e "
require('dotenv').config();
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Missing');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✓ Set' : '✗ Missing');
console.log('SONIOX_API_KEY:', process.env.SONIOX_API_KEY ? '✓ Set' : '✗ Missing');
"
```

Expected output:
```
SUPABASE_URL: ✓ Set
SUPABASE_SERVICE_KEY: ✓ Set
SONIOX_API_KEY: ✓ Set
```

