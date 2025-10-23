# Dependency Analysis & Class Relationships

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                      DEPENDENCY TREE                            │
└─────────────────────────────────────────────────────────────────┘

lma-websocket-transcriber-stack
│
├── src/index.ts (Main Entry Point)
│   │
│   ├── Dependencies:
│   │   ├── fastify (HTTP/WebSocket server)
│   │   ├── @fastify/websocket (WebSocket plugin)
│   │   ├── dotenv (Environment variables)
│   │   ├── ws (WebSocket client for Soniox)
│   │   ├── fs (File system)
│   │   ├── crypto (UUID generation)
│   │   └── block-stream2 (Audio buffering)
│   │
│   ├── Internal Imports:
│   │   ├── ./calleventdata (Event types & Soniox integration)
│   │   ├── ./supabase-client (Database operations)
│   │   └── ./utils (Helper functions)
│   │
│   └── Exports: None (executable)
│
├── src/calleventdata/
│   │
│   ├── index.ts
│   │   └── Exports: CallMetaData, SocketCallData
│   │
│   ├── eventtypes.ts
│   │   └── Defines TypeScript interfaces
│   │
│   └── soniox.ts
│       ├── Dependencies:
│       │   ├── ws (WebSocket client)
│       │   └── fastify (Logger)
│       ├── Internal Imports:
│       │   ├── ./eventtypes
│       │   └── ../supabase-client
│       └── Exports:
│           ├── startSonioxTranscription()
│           ├── writeMeetingStartEvent()
│           └── writeMeetingEndEvent()
│
├── src/supabase-client.ts
│   ├── Dependencies:
│   │   └── @supabase/supabase-js (Supabase SDK)
│   ├── Exports:
│   │   ├── supabase (client instance)
│   │   ├── insertTranscriptEvent()
│   │   ├── upsertMeeting()
│   │   ├── updateMeetingRecording()
│   │   ├── uploadRecording()
│   │   └── getSpeakerName()
│   └── Used by:
│       ├── index.ts (main server)
│       └── calleventdata/soniox.ts
│
└── src/utils/
    ├── index.ts
    │   ├── Exports: createWavHeader(), normalizeErrorForLogging(), ...
    │   └── Used by: index.ts
    │
    └── jwt-verifier.ts
        ├── Dependencies: aws-jwt-verify
        ├── Exports: jwtVerifier()
        └── Used by: index.ts (auth middleware)

lma-browser-extension-stack
│
├── src/App.tsx (Root Component)
│   ├── Dependencies:
│   │   ├── react, react-dom
│   │   └── @cloudscape-design/components
│   ├── Imports:
│   │   ├── ./components/screens/*
│   │   └── ./context/*
│   └── Renders: Router with screens
│
├── src/components/
│   ├── screens/
│   │   ├── Capture.tsx (Recording UI)
│   │   ├── Meeting.tsx (Transcript display)
│   │   └── Login.tsx (Authentication)
│   └── views/
│       ├── UserMessage.tsx
│       └── OtherMessage.tsx
│
└── src/context/
    ├── AuthContext (JWT management)
    ├── WebSocketContext (Connection state)
    └── MeetingContext (Current meeting)

supabase/
│
├── migrations/ (SQL files)
│   └── Applied in order: 001 → 002 → 003 → 004
│
└── functions/
    └── process-transcripts/
        ├── index.ts (Deno runtime)
        └── Dependencies:
            └── @supabase/supabase-js (ESM import)
```

## Critical Paths Analysis

### Path 1: Audio Capture to Database

```
Browser Extension
  └─ audioCapturer.js (Capture & encode PCM)
      └─ WebSocket.send(binaryData)
          └─ Server: index.ts
              └─ onBinaryMessage()
                  ├─ audioInputStream.write() → Soniox
                  └─ writeRecordingStream.write() → /tmp/*.raw

Duration: ~50ms (network latency)
Bottleneck: Network bandwidth (256 kbps)
```

### Path 2: Speech-to-Text Processing

```
Server audioInputStream
  └─ Soniox WebSocket
      └─ AI Processing (cloud)
          └─ Server onMessage()
              └─ soniox.ts: Group by speaker
                  └─ supabase-client.ts: insertTranscriptEvent()
                      └─ PostgreSQL INSERT

Duration: 0.5-1.5s (Soniox processing)
Bottleneck: AI model inference
```

### Path 3: Batch Processing to UI

```
pg_cron trigger (every 5s)
  └─ Edge Function: process-transcripts
      └─ SELECT unprocessed events
          └─ INSERT INTO transcripts
              └─ Supabase Realtime
                  └─ WebSocket broadcast
                      └─ React UI update

Duration: 5-10s (batch delay + processing)
Bottleneck: 5-second polling interval
Optimization: Reduce to 2s or use triggers
```

## Circular Dependency Check

**Result: No circular dependencies detected**

- `index.ts` imports `supabase-client.ts` ✓
- `soniox.ts` imports `supabase-client.ts` ✓
- `supabase-client.ts` has no internal imports ✓
- `utils/` modules are independent ✓

## Unused Dependencies

**WebSocket Transcriber:**
```
Unused AWS SDKs (legacy imports, can be removed):
- @aws-sdk/client-dynamodb
- @aws-sdk/client-kinesis
- @aws-sdk/client-s3
- @aws-sdk/client-transcribe-streaming

These are still in package.json but not imported in code.
Recommendation: Remove to reduce bundle size (saves ~15MB).
```

**Browser Extension:**
```
All dependencies actively used.
No unused packages detected.
```

## Type Dependencies

### TypeScript Interfaces

**CallMetaData** (calleventdata/eventtypes.ts)
```typescript
interface CallMetaData {
  callId: string;
  callEvent: 'START' | 'END' | 'SPEAKER_CHANGE';
  fromNumber?: string;
  toNumber?: string;
  activeSpeaker?: string;
  agentId?: string;
  samplingRate: number;
  channels: number;
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  shouldRecordCall?: boolean;
}
```

**SocketCallData** (calleventdata/eventtypes.ts)
```typescript
interface SocketCallData {
  callMetadata: CallMetaData;
  audioInputStream?: BlockStream;
  writeRecordingStream?: fs.WriteStream;
  recordingFileSize?: number;
  startStreamTime: Date;
  speakerEvents: any[];
  ended: boolean;
  sonioxWs?: WebSocket;
}
```

### Database Types

**Generated TypeScript types from Supabase:**
```typescript
// Can be auto-generated via:
// supabase gen types typescript --project-id <id> > database.types.ts

export type Meeting = {
  id: string;
  meeting_id: string;
  title?: string;
  status: 'started' | 'ended';
  recording_url?: string;
  owner_email?: string;
  started_at: string;
  ended_at?: string;
  // ...
}

export type TranscriptEvent = {
  id: number;
  meeting_id: string;
  transcript: string;
  speaker_number?: string;
  start_time: number;
  end_time: number;
  processed: boolean;
  // ...
}
```

## Function Call Graph

### Main Server (index.ts)

```
server.get('/api/v1/ws') → registerHandlers()
  ├── ws.on('message') → onBinaryMessage() / onTextMessage()
  │   │
  │   ├── onBinaryMessage()
  │   │   ├── audioInputStream.write()
  │   │   └── writeRecordingStream.write()
  │   │
  │   └── onTextMessage()
  │       ├── if (START) → startSonioxTranscription()
  │       ├── if (SPEAKER_CHANGE) → updateActiveSpeaker()
  │       └── if (END) → endCall()
  │           ├── createWavHeader()
  │           ├── uploadRecording()
  │           └── updateMeetingRecording()
  │
  ├── ws.on('close') → onWsClose()
  │   └── endCall()
  │
  └── ws.on('error') → ws.close()
```

### Soniox Integration (soniox.ts)

```
startSonioxTranscription()
  ├── new WebSocket(SONIOX_WS_URL)
  │
  ├── sonioxWs.on('open')
  │   └── sonioxWs.send(config)
  │
  ├── audioInputStream → sonioxWs.send(chunk)
  │
  └── sonioxWs.on('message')
      ├── JSON.parse(data)
      ├── Filter finalTokens
      ├── Group by speaker
      ├── getSpeakerName()
      └── insertTranscriptEvent()
```

### Supabase Client (supabase-client.ts)

```
insertTranscriptEvent(data)
  └── supabase.from('transcript_events').insert(data)
      └── Error handling (ignore 23505)

upsertMeeting(data)
  └── supabase.from('meetings').upsert(data)

uploadRecording(meeting_id, buffer)
  ├── supabase.storage.from('meeting-recordings').upload()
  └── supabase.storage.from('meeting-recordings').getPublicUrl()

updateMeetingRecording(meeting_id, ...)
  └── supabase.from('meetings').update().eq('meeting_id', ...)
```

## External Service Dependencies

### Soniox API

**Endpoint:** `wss://stt-rt.soniox.com/transcribe-websocket`  
**Required:** API key (env: SONIOX_API_KEY)  
**Rate Limits:** Unknown (contact vendor)  
**Failure Mode:** Transcript fails, recording still saved  
**Fallback:** None implemented (single point of failure)

**Recommendation:** Implement circuit breaker pattern

### Supabase Services

**PostgreSQL:**
- Host: `<project-id>.supabase.co`
- Port: 5432 (via REST API)
- Auth: Service role key
- Connection pooling: Managed by Supabase

**Storage:**
- Bucket: `meeting-recordings`
- Access: Public read, authenticated write
- CDN: Enabled by default

**Realtime:**
- Protocol: WebSocket
- Channels: postgres_changes
- Broadcast latency: 50-200ms

**Edge Functions:**
- Runtime: Deno
- Trigger: HTTP POST (pg_cron)
- Cold start: ~100ms

## Security Dependencies

### Authentication Chain

```
Browser → Server
  ├── Query param: ?authorization=Bearer <JWT>
  └── Header: Authorization: Bearer <JWT>

Server → JWT Verifier
  ├── Decode JWT
  ├── Verify signature (if configured)
  └── Extract user claims

Server → Supabase
  └── Service role key (bypasses RLS)
      └── Warning: Full database access

Browser → Supabase (if direct access)
  └── Anon key (enforces RLS)
      └── Restricted by owner_email
```

**Security Concern:** Server uses service_role key with full access.  
**Recommendation:** Implement proper JWT verification and pass user context.

## Performance Dependencies

### Bottlenecks Identified

1. **Network Latency (Browser → Server)**
   - WebSocket RTT: 20-100ms
   - Mitigation: Deploy server closer to users (edge locations)

2. **Soniox AI Processing**
   - STT latency: 500-1500ms
   - Mitigation: None (vendor-dependent)

3. **Batch Processing Delay**
   - Polling interval: 5 seconds
   - Mitigation: Reduce to 2s or use database triggers

4. **Database Write Performance**
   - Individual INSERTs per transcript segment
   - Mitigation: Batch INSERT (100-200 rows)

5. **File I/O (Recording)**
   - Write to /tmp during call
   - Convert RAW → WAV at end
   - Mitigation: Use streaming upload to Storage

### Resource Usage

**Memory per Connection:**
- SocketCallData: ~1KB
- Audio buffers: ~512KB (BlockStream)
- Recording file: ~2MB per minute
- Total: ~3-5MB per active session

**CPU Usage:**
- PCM encoding: ~5% per connection
- WAV header creation: Negligible
- JSON parsing: ~2% per connection

**Disk I/O:**
- Write rate: ~256 kbps (32 KB/s) per connection
- Temp storage: 2MB per minute per meeting
- Cleanup: Delete after upload

---

# Optimization Recommendations

## High Priority

1. **Remove unused AWS SDK dependencies**
   - Impact: -15MB bundle size, faster startup
   
2. **Implement batch INSERT for transcripts**
   - Impact: 5-10x faster database writes
   
3. **Add circuit breaker for Soniox API**
   - Impact: Graceful degradation on failures

## Medium Priority

4. **Reduce batch processing interval (5s → 2s)**
   - Impact: 60% faster transcript availability
   
5. **Implement connection pooling for Supabase**
   - Impact: Lower connection overhead
   
6. **Add caching for speaker_identity lookups**
   - Impact: Reduce database queries

## Low Priority

7. **Compress recordings (WAV → FLAC/Opus)**
   - Impact: 40-60% storage cost reduction
   
8. **Implement WebSocket compression**
   - Impact: 20-30% bandwidth reduction

---

# Conclusion

The system has a clean, modular architecture with clear separation of concerns:

- **No circular dependencies**
- **Clear dependency hierarchy**
- **Minimal external dependencies**
- **Type-safe interfaces**

Main areas for improvement:
- Remove legacy AWS dependencies
- Optimize database operations (batching)
- Implement error recovery patterns
- Enhance monitoring and observability
