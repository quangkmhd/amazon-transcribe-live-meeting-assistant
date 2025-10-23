# Live Meeting Assistant - Architecture Documentation

## Executive Summary

**Project:** Live Meeting Assistant (LMA)  
**Architecture:** Real-time Audio Transcription System  
**Migration:** AWS Stack → Soniox + Supabase Stack

### Key Features
- ✅ Real-time speech-to-text via Soniox API
- ✅ Multi-speaker diarization
- ✅ WebSocket-based bidirectional communication
- ✅ PostgreSQL storage with Supabase
- ✅ Audio recording in WAV format
- ✅ Multi-tenancy with Row Level Security (RLS)
- ✅ Browser extension for audio capture

---

## Technology Stack

### Backend
- **Runtime:** Node.js 16+ with TypeScript 4.6+
- **Framework:** Fastify 3.27 + @fastify/websocket 5.0
- **Speech-to-Text:** Soniox Real-time API
- **Database:** Supabase PostgreSQL
- **Storage:** Supabase Storage (WAV files)
- **Realtime:** Supabase Realtime (WebSocket subscriptions)

### Frontend
- **Framework:** React 18.2 with TypeScript 4.9
- **UI Library:** @cloudscape-design/components
- **WebSocket:** react-use-websocket 4.7
- **Extension:** Chrome Manifest V3

### Audio Processing
- **Format:** PCM 16-bit signed integer
- **Sample Rate:** 16kHz
- **Channels:** 1 (mono merged)
- **API:** Web Audio API, MediaStream API

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    HIGH-LEVEL ARCHITECTURE                   │
└──────────────────────────────────────────────────────────────┘

Browser Extension (Chrome)
   ├── Audio Capture (Web Audio API)
   ├── PCM Encoding (16-bit, 16kHz)
   └── WebSocket Client
       │
       │ wss://server/api/v1/ws
       │ Binary PCM + JSON metadata
       ▼
WebSocket Server (Fastify + Node.js)
   ├── JWT Authentication
   ├── Session Management
   ├── Audio Routing
   └── Recording to /tmp/*.raw
       │
       ├──────────────────┬───────────────────┐
       │                  │                   │
       ▼                  ▼                   ▼
   Soniox API      Supabase DB        Supabase Storage
   (STT + Diar.)   (PostgreSQL)       (WAV files)
       │                  │
       │                  │
       ▼                  ▼
   Transcripts ──────► Edge Function ─────► Processed Transcripts
                       (Batch processor)           │
                                                   │
                                                   ▼
                                            Supabase Realtime
                                                   │
                                                   ▼
                                            React UI (Live updates)
```

---

## Component Structure

### 1. WebSocket Transcriber Stack

**Location:** `lma-websocket-transcriber-stack/source/app/`

**Key Files:**
- `src/index.ts` - Main server, WebSocket handling, routing
- `src/supabase-client.ts` - Supabase SDK wrapper
- `src/calleventdata/soniox.ts` - Soniox API integration
- `src/utils/jwt-verifier.ts` - JWT authentication
- `src/utils/index.ts` - Audio utilities (WAV header, etc.)

**Responsibilities:**
- Accept WebSocket connections from browser extension
- Authenticate using JWT tokens
- Forward audio to Soniox API
- Save transcripts to Supabase
- Record audio to local files
- Convert RAW PCM to WAV format
- Upload recordings to Supabase Storage

### 2. Browser Extension Stack

**Location:** `lma-browser-extension-stack/`

**Key Components:**
- `public/manifest.json` - Extension configuration
- `public/content_scripts/audioCapturer.js` - Audio capture logic
- `src/components/screens/Capture.tsx` - Recording UI
- `src/components/screens/Meeting.tsx` - Transcript display
- `src/context/` - React Context providers

**Responsibilities:**
- Capture tab audio (meeting participants)
- Capture microphone audio (user)
- Merge audio streams into mono
- Encode to PCM 16-bit
- Send to WebSocket server
- Display real-time transcripts
- Handle authentication

### 3. Supabase Configuration

**Location:** `supabase/`

**Migrations:**
- `001_initial_schema.sql` - Tables, indexes, storage bucket
- `002_fix_speaker_identity_rls.sql` - RLS for speaker_identity
- `003_fix_multi_tenancy_rls.sql` - Multi-tenancy RLS policies
- `004_fix_existing_owner_emails.sql` - Data migration

**Edge Functions:**
- `process-transcripts/index.ts` - Batch processor (polls every 5s)

---

## Database Schema

### Tables

**meetings**
```sql
id UUID PRIMARY KEY
meeting_id TEXT UNIQUE
title TEXT
status TEXT (started/ended)
recording_url TEXT
recording_size BIGINT
recording_duration INTEGER
owner_email TEXT
started_at TIMESTAMPTZ
ended_at TIMESTAMPTZ
```

**transcript_events** (Staging buffer)
```sql
id BIGSERIAL PRIMARY KEY
meeting_id TEXT
transcript TEXT
start_time INTEGER
end_time INTEGER
processed BOOLEAN DEFAULT false
UNIQUE(meeting_id, start_time, end_time)
```

**transcripts** (Final processed)
```sql
id BIGSERIAL PRIMARY KEY
meeting_id TEXT
transcript TEXT
speaker_number TEXT
speaker_name TEXT
start_time INTEGER
end_time INTEGER
sentiment TEXT
owner_email TEXT
UNIQUE(meeting_id, start_time, end_time)
```

**speaker_identity**
```sql
id BIGSERIAL PRIMARY KEY
meeting_id TEXT
speaker_number TEXT
speaker_name TEXT
UNIQUE(meeting_id, speaker_number)
```

### Storage Bucket

**meeting-recordings**
- Public read access
- Authenticated uploads
- 100MB file size limit
- Allowed types: audio/wav, audio/mpeg

---

## Data Flow

### Meeting Lifecycle

```
1. START Event
   Browser → Server: {callEvent: "START", callId: "uuid", ...}
   Server → Supabase: INSERT INTO meetings
   Server → Soniox: Connect WebSocket + send config

2. Audio Streaming
   Browser → Server: Binary PCM chunks (continuous)
   Server → Soniox: Forward PCM
   Server → /tmp/*.raw: Write for recording
   Soniox → Server: Transcript tokens (partial + final)
   Server → Supabase: INSERT INTO transcript_events (final only)
   Server → Browser: Forward transcripts for real-time display

3. END Event
   Browser → Server: {callEvent: "END"}
   Server: Close Soniox WebSocket
   Server: Create WAV header + convert /tmp/*.raw → /tmp/*.wav
   Server → Supabase Storage: Upload WAV file
   Server → Supabase: UPDATE meetings (recording_url, status)

4. Background Processing
   Edge Function: Poll transcript_events WHERE processed=false
   Edge Function: INSERT INTO transcripts
   Edge Function: UPDATE transcript_events SET processed=true

5. Realtime Updates
   Supabase Realtime: Detect INSERT in transcripts
   Supabase Realtime → React UI: postgres_changes event
   React UI: Append new transcript to display
```

---

## API Interactions

### Soniox Real-time API

**Endpoint:** `wss://stt-rt.soniox.com/transcribe-websocket`

**Start Request:**
```json
{
  "api_key": "sk_...",
  "audio_format": "pcm_s16le",
  "sample_rate": 16000,
  "num_channels": 1,
  "model": "stt-rt-preview-v2",
  "enable_speaker_diarization": true,
  "language_hints": ["en", "vi"]
}
```

**Audio Chunks:** Binary PCM data (continuous stream)

**Response Format:**
```json
{
  "tokens": [
    {
      "text": "Hello",
      "start_ms": 100,
      "end_ms": 500,
      "is_final": true,
      "speaker": "1"
    }
  ]
}
```

### Supabase API

**Client Initialization:**
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
```

**Insert Transcript:**
```typescript
await supabase.from('transcript_events').insert({
  meeting_id: "uuid",
  transcript: "Hello world",
  speaker_number: "1",
  start_time: 100,
  end_time: 500,
  is_final: true
});
```

**Realtime Subscription:**
```typescript
supabase
  .channel('transcripts:meeting-id')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'transcripts'
  }, (payload) => {
    // Handle new transcript
  })
  .subscribe();
```

---

## Design Patterns

### 1. Publisher-Subscriber Pattern
- **Soniox → Server:** Subscribe to transcript events
- **Supabase Realtime → UI:** Subscribe to database changes

### 2. Buffering Pattern (Staging Table)
- **transcript_events** acts as Kinesis replacement
- Batch processing every 5 seconds
- Prevents data loss during processing

### 3. Dual WebSocket Architecture
- **Browser ↔ Server:** Client WebSocket
- **Server ↔ Soniox:** Backend WebSocket
- Decouples client from STT provider

### 4. Repository Pattern
- `supabase-client.ts` abstracts database operations
- Functions: `insertTranscriptEvent`, `upsertMeeting`, `uploadRecording`

### 5. Strategy Pattern (Speaker Detection)
- Soniox: AI-based speaker diarization
- Fallback: Map speaker numbers to channels

### 6. Observer Pattern
- WebSocket event handlers (`on('message')`, `on('close')`)
- Server monitors multiple connections via `Map<WebSocket, SocketCallData>`

---

## Optimization Opportunities

### Performance

**1. Connection Pooling**
- Current: New Supabase client per request
- Optimized: Reuse single client instance
- Impact: Reduce connection overhead

**2. Batch Insert Optimization**
- Current: Individual INSERT per transcript segment
- Optimized: Batch INSERT (100-200 rows)
- Impact: 5-10x faster writes

**3. Edge Function Concurrency**
- Current: Sequential processing
- Optimized: Parallel batch processing
- Impact: 2-3x throughput

**4. Audio Buffer Size Tuning**
- Current: 4096 samples
- Optimized: Dynamic based on network latency
- Impact: Reduce audio dropouts

### Scalability

**1. Horizontal Scaling**
- Add load balancer for WebSocket server
- Session affinity for sticky connections
- Redis for shared session state

**2. Database Indexing**
- Add composite index: `(meeting_id, start_time)`
- Partial index: `WHERE processed=false`
- Impact: Faster queries on large datasets

**3. Storage Optimization**
- Compress WAV files (FLAC/Opus)
- Auto-delete recordings after 30 days
- CDN for recording playback

### Cost Reduction

**1. Soniox API Usage**
- Implement silence detection
- Skip sending silent audio chunks
- Impact: 20-30% API cost reduction

**2. Supabase Storage**
- Use lifecycle policies
- Archive old recordings to cheaper storage
- Impact: 40-50% storage cost reduction

### Architecture Improvements

**1. Circular Dependency Issue**
- Current: Duplicate AWS SDK dependencies
- Fix: Remove unused AWS imports
- Impact: Smaller bundle size

**2. Error Handling**
- Add circuit breaker for Soniox API
- Implement exponential backoff
- Add dead letter queue for failed transcripts

**3. Monitoring & Observability**
- Add metrics: latency, throughput, error rate
- Implement distributed tracing
- Log aggregation (ELK/Datadog)

### Security

**1. JWT Validation**
- Current: Basic Bearer token check
- Improved: Verify signature, expiry, issuer
- Add refresh token rotation

**2. Rate Limiting**
- Implement per-user rate limits
- Protect against DDoS
- Use Fastify rate-limit plugin

**3. RLS Policy Audit**
- Review all policies for least privilege
- Add audit logging for sensitive operations

---

## Migration Impact Analysis

### AWS → Soniox/Supabase

**Removed Components:**
- ❌ Amazon Transcribe
- ❌ Kinesis Data Streams
- ❌ AWS Lambda
- ❌ DynamoDB
- ❌ AppSync (GraphQL)
- ❌ S3 (for recordings)

**New Components:**
- ✅ Soniox Real-time API
- ✅ Supabase PostgreSQL
- ✅ Supabase Storage
- ✅ Supabase Realtime
- ✅ Supabase Edge Functions

**Cost Comparison:**
- AWS: $18-81/month (variable)
- Soniox + Supabase: $0-25/month (predictable)

**Latency:**
- AWS Transcribe: 2-3 seconds
- Soniox: 0.5-1.5 seconds (40% faster)

**Setup Time:**
- AWS: 2-4 hours (CDK deployment, IAM setup)
- Soniox/Supabase: 10 minutes (SQL migrations, env vars)

---

## Deployment Guide

### Prerequisites
- Node.js 16+
- Supabase account
- Soniox API key

### Quick Start

1. **Deploy Database**
```bash
cd supabase
supabase link --project-ref your-project
supabase db push
```

2. **Configure Environment**
```bash
cd lma-websocket-transcriber-stack/source/app
cp .env.example .env
# Edit .env with your keys
```

3. **Start Server**
```bash
npm install
npm start
```

4. **Load Extension**
- Open Chrome → Extensions → Developer mode
- Load unpacked: `lma-browser-extension-stack/public/`

### Production Deployment
- Use Docker for WebSocket server
- Enable SSL/TLS (wss://)
- Setup domain with reverse proxy (nginx)
- Configure CORS properly
- Enable Supabase RLS policies
- Setup monitoring and alerts

---

## Testing Strategy

### Unit Tests (Vitest)
- Audio encoding/decoding functions
- WAV header creation
- JWT verification logic

### Integration Tests (Playwright)
- End-to-end meeting flow
- Multi-tenancy isolation
- Speaker identity assignment

### Manual Testing
- Audio quality verification
- Latency measurements
- Browser compatibility (Chrome, Firefox)

---

## Conclusion

This architecture provides a modern, cost-effective solution for real-time meeting transcription with speaker diarization. The migration from AWS to Soniox/Supabase reduces complexity, cost, and setup time while improving latency and developer experience.

**Key Strengths:**
- Simple WebSocket-based architecture
- Reliable speech-to-text with speaker detection
- Multi-tenancy support via RLS
- Real-time UI updates
- Audio recording with WAV format

**Next Steps:**
- Implement monitoring and alerting
- Add sentiment analysis
- Integrate with calendar APIs
- Add export functionality (PDF, DOCX)
- Mobile app support
