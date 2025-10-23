# Component Flow Diagrams

## 1. Call Initialization Flow

```
Browser → Server → Soniox → Supabase

1. Browser sends START event (JSON)
   {callEvent: "START", callId: "uuid", samplingRate: 16000}
   
2. Server creates session
   - Generate temp file: /tmp/<callId>.raw
   - Initialize BlockStream for audio buffering
   - Store in socketMap: Map<WebSocket, SocketCallData>
   
3. Server connects to Soniox
   - WebSocket: wss://stt-rt.soniox.com/transcribe-websocket
   - Send config: {api_key, sample_rate, enable_speaker_diarization}
   
4. Server creates meeting record
   - INSERT INTO meetings (meeting_id, status, started_at)
   
5. Server ready for audio
   - Return connection confirmation to browser
```

## 2. Audio Streaming Flow

```
Browser → Server → Soniox API → Server → Supabase

Continuous loop (43 messages/second):

1. Browser sends PCM binary chunk (~4KB)
   
2. Server receives chunk
   - Write to audioInputStream (for Soniox)
   - Write to writeRecordingStream (for /tmp/*.raw file)
   - Increment recordingFileSize
   
3. Server forwards to Soniox WebSocket
   - Binary transmission
   
4. Soniox processes and returns results
   - Partial tokens: {is_final: false} → Forward to browser only
   - Final tokens: {is_final: true, speaker: "1"} → Save to DB
   
5. Server groups by speaker
   - Speaker "1": [token1, token2, ...]
   - Speaker "2": [token3, token4, ...]
   
6. Server saves to Supabase
   - INSERT INTO transcript_events
   - UNIQUE constraint prevents duplicates
   - Ignore error code 23505 (duplicate)
   
7. Server forwards transcript to browser
   - For real-time UI display
```

## 3. Call Termination Flow

```
Browser → Server → Soniox (close) → File Processing → Supabase

1. Browser sends END event or closes connection
   
2. Server initiates cleanup
   - Close Soniox WebSocket
   - Close writeRecordingStream
   - Set socketData.ended = true
   
3. Server converts recording
   - Read: /tmp/<callId>.raw
   - Create WAV header (44 bytes)
   - Write: /tmp/<callId>.wav
   - Header includes: sample rate, channels, data size
   
4. Server uploads to Supabase Storage
   - Read WAV file as Buffer
   - Upload to bucket: meeting-recordings
   - Get public URL
   
5. Server updates meeting record
   - UPDATE meetings SET
     recording_url = <public_url>,
     recording_size = <bytes>,
     recording_duration = <seconds>,
     status = 'ended',
     ended_at = NOW()
   
6. Server cleanup
   - Delete /tmp/<callId>.raw
   - Delete /tmp/<callId>.wav
   - Remove from socketMap
```

## 4. Batch Processing Flow

```
Edge Function (Triggered every 5s by pg_cron)

1. Poll for unprocessed events
   SELECT * FROM transcript_events
   WHERE processed = false
   LIMIT 200
   
2. Transform events
   - Add segment_id
   - Copy speaker info
   - Set is_partial = false
   
3. Insert to final table
   INSERT INTO transcripts
   (meeting_id, transcript, speaker_number, start_time, ...)
   
4. Mark as processed
   UPDATE transcript_events
   SET processed = true
   WHERE id IN (...)
   
5. Supabase Realtime broadcasts
   - INSERT event → All subscribed clients
   - React UI receives postgres_changes event
   - UI appends new transcript
```

## 5. Multi-tenancy Access Control

```
Row Level Security (RLS) Policies

For meetings table:
- SELECT: WHERE owner_email = current_user_email() 
          OR current_user_email() = ANY(shared_with)
- INSERT: WITH CHECK (owner_email = current_user_email())
- UPDATE: WHERE owner_email = current_user_email()

For transcripts table:
- SELECT: WHERE owner_email = current_user_email()
          OR current_user_email() = ANY(shared_with)
- INSERT: WITH CHECK (owner_email = current_user_email())

For transcript_events:
- Accessed via service_role key (bypasses RLS)
- Used only by backend server

For speaker_identity:
- SELECT: WHERE meeting_id IN (SELECT meeting_id FROM meetings WHERE ...)
- INSERT: WITH CHECK (meeting_id IN (SELECT meeting_id FROM meetings WHERE ...))
```

## 6. Error Handling Strategy

```
Duplicate Prevention:
- UNIQUE constraints on (meeting_id, start_time, end_time)
- Application ignores error code 23505
- Idempotent operations

Connection Failures:
- Soniox WebSocket error → Log and attempt reconnect
- Supabase error → Retry with exponential backoff
- Browser disconnect → Cleanup and save recording

Data Integrity:
- Atomic operations (transactions where possible)
- Staged processing (transcript_events → transcripts)
- Recording saved even if transcription fails
```

## 7. Performance Optimizations

```
Connection Management:
- Single WebSocket per meeting session
- Reuse Supabase client instance
- Connection pooling for PostgreSQL

Audio Processing:
- BlockStream buffering (chunks of 4096 samples)
- Minimize audio dropouts
- Efficient PCM encoding

Database:
- Indexes on (meeting_id, start_time)
- Partial index WHERE processed=false
- UNIQUE constraints for deduplication

Batch Processing:
- Process 200 events at a time
- Run every 5 seconds
- Parallel execution possible
```

---

# Summary

This system provides a robust, scalable architecture for real-time meeting transcription with:

- **Low Latency:** 0.5-1.5s from speech to transcript
- **High Accuracy:** Soniox AI-powered STT with speaker diarization
- **Data Integrity:** UNIQUE constraints + idempotent operations
- **Multi-tenancy:** RLS policies for data isolation
- **Cost Effective:** $0-25/month vs AWS $18-81/month
- **Simple Deployment:** 10 minutes vs 2-4 hours

Key design patterns:
- Dual WebSocket architecture (decoupling)
- Staging buffer (transcript_events table)
- Repository pattern (supabase-client.ts)
- Publisher-subscriber (Realtime updates)
