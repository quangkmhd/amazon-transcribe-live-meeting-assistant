# Soniox + Supabase - Live Meeting Streaming Architecture

## Tổng quan

Kiến trúc streaming với **Soniox STT** + **Supabase** thay thế AWS stack (Transcribe + Kinesis + Lambda + DynamoDB + AppSync).

**Key Benefits:**
- ✅ Chi phí: $0-25/month (vs AWS $18-81/month) 
- ✅ Setup: 10 phút (vs 2-4 giờ)
- ✅ All-in-one: DB + Realtime + Functions trong 1 platform
- ✅ Developer-friendly: SQL queries, TypeScript support

---

## 1. Client-side: Audio Capture 🎤

### **Merge Channels Strategy** (Thay thế Dual-Channel của AWS Transcribe)

```javascript
// AudioContext @ 16kHz (Soniox recommend)
const audioContext = new AudioContext({ sampleRate: 16000 });

// Capture display audio (meeting participants)
const displayStream = await navigator.mediaDevices.getDisplayMedia({
  audio: { noiseSuppression: true, autoGainControl: true }
});

// Capture microphone (user's voice)
const micStream = await navigator.mediaDevices.getUserMedia({
  audio: { noiseSuppression: true, autoGainControl: true }
});

// ==========================================
// ✅ MERGE: Combine both streams into MONO
// ==========================================
const audioContext = new AudioContext({ sampleRate: 16000 });
const destination = audioContext.createMediaStreamDestination();

// Create sources
const displaySource = audioContext.createMediaStreamSource(displayStream);
const micSource = audioContext.createMediaStreamSource(micStream);

// Optional: Mix with different volumes
const displayGain = audioContext.createGain();
const micGain = audioContext.createGain();
displayGain.gain.value = 1.0;  // Meeting audio
micGain.gain.value = 1.0;      // User audio

// Merge into single mono stream
displaySource.connect(displayGain).connect(destination);
micSource.connect(micGain).connect(destination);

// Result: Single merged audio stream
const mergedStream = destination.stream;

// ==========================================
// ✅ SONIOX: Detect multiple speakers via AI
// ==========================================
// No need to separate channels!
// Soniox will automatically detect:
// - Speaker 1 (could be meeting participant A)
// - Speaker 2 (could be meeting participant B)  
// - Speaker 3 (could be user)
// - Speaker 4, 5... (more participants)

// Encode to PCM 16-bit
const pcmData = encodeToPCM(mergedStream);
```

**Thông số Audio:**
- Format: PCM 16-bit signed integer
- Sample rate: 16000 Hz
- **Channels: 1 (mono merged)** ← Changed from stereo
- Encoding: Little-endian

**⚠️ Key Difference from AWS Transcribe:**
- **AWS:** Dual-channel (Left=Meeting, Right=Mic) → 100% separation
- **Soniox:** Single channel merged → AI detects speakers → ~90-95% accuracy

---

## 2. Transport: Dual WebSocket Architecture 🌐

```
Browser ←─WebSocket #1─→ Backend Server ←─WebSocket #2─→ Soniox API
         (binary audio)                    (binary audio)
         (realtime UI)                     (transcript results)
```

### Backend Server Code

```javascript
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');

const wss = new WebSocketServer({ port: 8080 });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

wss.on('connection', (clientWs, req) => {
  const meetingId = extractMeetingId(req.url);
  
  // Connect to Soniox
  const sonioxWs = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');
  
  sonioxWs.on('open', () => {
    sonioxWs.send(JSON.stringify({
      api_key: SONIOX_API_KEY,
      audio_format: "pcm_s16le",
      sample_rate: 16000,
      num_channels: 1,  // ✅ MONO merged audio
      model: "stt-rt-preview-v2",
      
      // ✅ REPLACE: Dual-channel → Speaker Diarization
      enable_speaker_diarization: true,  // Detect multiple speakers (1,2,3,4,5...)
      
      // ✅ KEEP: Language detection
      language_hints: ["en", "vi"],
      
      // ✅ KEEP: Custom vocabulary (contextual biasing)
      context: "Zoom, Teams, Google Meet, Slack, John Doe, Jane Smith"
      
      // ❌ REMOVED: Content Redaction (not supported by Soniox)
      // ❌ REMOVED: Post-call Analytics (not supported by Soniox)
      // ❌ REMOVED: Channel definitions (using speaker detection instead)
    }));
  });
  
  // Forward: Client audio → Soniox
  clientWs.on('message', (audio) => sonioxWs.send(audio));
  
  // Initialize recording stream
  const recordingPath = `/tmp/${meetingId}.raw`;
  const recordingStream = fs.createWriteStream(recordingPath);
  let recordingSize = 0;
  
  // Forward: Client audio → Soniox & Recording
  clientWs.on('message', (audio) => {
    // 1. Send to Soniox for transcription
    sonioxWs.send(audio);
    
    // 2. Write to file for recording
    recordingStream.write(audio);
    recordingSize += audio.length;
  });
  
  // Handle Soniox results with Speaker Detection
  sonioxWs.on('message', async (data) => {
    const result = JSON.parse(data);
    
    // 1. Send to client (realtime UI)
    clientWs.send(JSON.stringify(result));
    
    // 2. Save to Supabase (with speaker detection)
    const finalTokens = result.tokens?.filter(t => t.is_final);
    
    if (finalTokens && finalTokens.length > 0) {
      // ==========================================
      // ✅ SPEAKER DETECTION: Group by speaker
      // ==========================================
      const speakerGroups = {};
      
      finalTokens.forEach(token => {
        const speakerNumber = token.speaker || '1';  // "1", "2", "3", "4", "5"...
        
        if (!speakerGroups[speakerNumber]) {
          speakerGroups[speakerNumber] = [];
        }
        speakerGroups[speakerNumber].push(token);
      });
      
      // Save each speaker's segment separately
      for (const [speakerNumber, tokens] of Object.entries(speakerGroups)) {
        try {
          // ==========================================
          // ✅ NEW SCHEMA: speaker_number instead of channel
          // ==========================================
          await supabase.from('transcript_events').insert({
            meeting_id: meetingId,
            transcript: tokens.map(t => t.text).join(''),
            
            // ✅ Speaker tracking (NEW)
            speaker_number: speakerNumber,  // "1", "2", "3"...
            speaker_name: null,  // Will be filled by user later
            
            // ⚠️ Channel (backward compatible - optional mapping)
            channel: mapSpeakerToChannel(speakerNumber),  // Auto-map or null
            
            start_time: tokens[0]?.start_ms,
            end_time: tokens[tokens.length - 1]?.end_ms,
            is_final: true,
            processed: false
          });
        } catch (error) {
          // Ignore duplicate errors (code 23505)
          if (error.code !== '23505') {
            console.error('Save error:', error);
          }
        }
      }
    }
  });
  
  // Helper: Map speaker number to channel (for backward compatibility)
  function mapSpeakerToChannel(speakerNumber) {
    // Simple heuristic: Speaker "1" → AGENT, others → CALLER
    // Or return null and let user assign later
    return speakerNumber === "1" ? "AGENT" : "CALLER";
  }
  
  // Handle disconnection: Upload recording
  clientWs.on('close', async () => {
    sonioxWs.close();
    recordingStream.end();
    
    // Convert RAW PCM to WAV
    await convertToWav(meetingId, recordingSize);
    
    // Upload to Supabase Storage
    const wavPath = `/tmp/${meetingId}.wav`;
    const { data, error } = await supabase.storage
      .from('meeting-recordings')
      .upload(`${meetingId}.wav`, fs.createReadStream(wavPath), {
        contentType: 'audio/wav',
        upsert: false
      });
    
    if (!error) {
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('meeting-recordings')
        .getPublicUrl(`${meetingId}.wav`);
      
      // Update meeting with recording URL
      await supabase.from('meetings').update({
        recording_url: urlData.publicUrl,
        recording_size: recordingSize,
        recording_duration: Math.floor(recordingSize / (16000 * 2))
      }).eq('meeting_id', meetingId);
    }
    
    // Cleanup temp files
    fs.unlinkSync(`/tmp/${meetingId}.raw`);
    fs.unlinkSync(`/tmp/${meetingId}.wav`);
  });
});

// Helper: Convert RAW PCM to WAV
async function convertToWav(meetingId, dataSize) {
  const rawPath = `/tmp/${meetingId}.raw`;
  const wavPath = `/tmp/${meetingId}.wav`;
  
  // Create WAV header
  const header = createWavHeader(16000, dataSize);
  
  // Write WAV file
  const writeStream = fs.createWriteStream(wavPath);
  writeStream.write(header);
  
  const readStream = fs.createReadStream(rawPath);
  await new Promise((resolve, reject) => {
    readStream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

function createWavHeader(sampleRate, dataSize) {
  const header = Buffer.alloc(44);
  
  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  
  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);  // Subchunk1Size
  header.writeUInt16LE(1, 20);   // AudioFormat (PCM)
  header.writeUInt16LE(1, 22);   // NumChannels (mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32);   // BlockAlign
  header.writeUInt16LE(16, 34);  // BitsPerSample
  
  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  return header;
}
```

---

## 3. Soniox Real-time API ☁️

```javascript
// WebSocket: wss://stt-rt.soniox.com/transcribe-websocket

// Start request
{
  "api_key": "YOUR_KEY",
  "audio_format": "pcm_s16le",
  "sample_rate": 16000,
  "num_channels": 1,
  "model": "stt-rt-preview-v2",
  "language_hints": ["en", "vi"],
  "enable_endpoint_detection": true
}

// Stream binary PCM audio chunks →

// Receive results ←
{
  "tokens": [
    {"text": "Hello", "start_ms": 100, "end_ms": 500, "is_final": false},
    {"text": " world", "start_ms": 500, "end_ms": 900, "is_final": true}
  ]
}
```

---

## 4. Supabase Database 📦

### Schema với UNIQUE Constraints (Chống Duplicate)

```sql
-- Staging table (buffer like Kinesis)
CREATE TABLE transcript_events (
  id BIGSERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  is_final BOOLEAN DEFAULT true,
  processed BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- ============================================
  -- UNIQUE CONSTRAINT: Prevent duplicate saves
  -- ============================================
  UNIQUE(meeting_id, start_time, end_time)
);

CREATE INDEX idx_unprocessed ON transcript_events(processed) WHERE processed = false;
CREATE INDEX idx_meeting_time ON transcript_events(meeting_id, start_time);

-- Final storage
CREATE TABLE transcripts (
  id BIGSERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  text TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  sentiment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- ============================================
  -- UNIQUE CONSTRAINT: Prevent duplicate transcripts
  -- ============================================
  UNIQUE(meeting_id, start_time, end_time)
);

CREATE INDEX idx_transcripts_meeting ON transcripts(meeting_id, created_at);

-- Meeting metadata
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id TEXT UNIQUE NOT NULL,
  title TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  recording_url TEXT,           -- URL to WAV file in Supabase Storage
  recording_size BIGINT,        -- File size in bytes
  recording_duration INTEGER    -- Duration in seconds
);

-- ============================================
-- Supabase Storage: Meeting Recordings Bucket
-- ============================================
-- Create bucket via Supabase Dashboard or SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meeting-recordings',
  'meeting-recordings',
  true,  -- Public access for playback
  104857600,  -- 100MB limit per file
  ARRAY['audio/wav', 'audio/mpeg']
);

-- Storage policies
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'meeting-recordings');

CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'meeting-recordings');

CREATE POLICY "Allow delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'meeting-recordings');

-- ============================================
-- Row Level Security (Optional)
-- ============================================
ALTER TABLE transcript_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
```

**Anti-Duplicate Strategy:**
- ✅ **UNIQUE(meeting_id, start_time, end_time)**: Database tự động reject duplicate
- ✅ **Filter is_final=true**: Chỉ lưu final tokens từ Soniox
- ✅ **Error handling**: Code bỏ qua duplicate errors (23505)

**Recording Strategy (Like LMA):**
- ✅ **Stream to file**: Write audio to `/tmp/[meetingId].raw` during meeting
- ✅ **Convert to WAV**: Add WAV header after meeting ends
- ✅ **Upload to Supabase Storage**: Replace S3 with Supabase Storage
- ✅ **Save URL**: Store public URL in meetings table
- ✅ **Cleanup**: Delete temp files after upload

---

## 5. Batch Processing (Thay Kinesis + Lambda)

### Option A: Worker Process

```javascript
// Polling worker (chạy 24/7)
const BATCH_SIZE = 200;

setInterval(async () => {
  // Fetch unprocessed events
  const { data: events } = await supabase
    .from('transcript_events')
    .select('*')
    .eq('processed', false)
    .limit(BATCH_SIZE);
  
  if (events?.length > 0) {
    // Process batch
    await processTranscriptBatch(events);
    
    // Store to final table (with duplicate handling)
    const { error: insertError } = await supabase
      .from('transcripts')
      .insert(
        events.map(e => ({
          meeting_id: e.meeting_id,
          text: e.transcript,
          start_time: e.start_time,
          end_time: e.end_time
        }))
      );
    
    // Ignore duplicate errors
    if (insertError && insertError.code !== '23505') {
      console.error('Insert error:', insertError);
    }
    
    // Mark processed
    await supabase
      .from('transcript_events')
      .update({ processed: true })
      .in('id', events.map(e => e.id));
  }
}, 5000); // Every 5 seconds
```

### Option B: Supabase Edge Function + pg_cron

```typescript
// supabase/functions/process-transcripts/index.ts
serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  
  const { data: events } = await supabase
    .from('transcript_events')
    .select('*')
    .eq('processed', false)
    .limit(200);
  
  // Process + store
  await processAndStore(events);
  
  return new Response(JSON.stringify({ processed: events.length }));
});

// Trigger every 5 seconds
SELECT cron.schedule(
  'process-transcripts',
  '*/5 * * * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

## 6. Real-time UI (Supabase Realtime)

```javascript
// React hook
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

function useMeetingTranscripts(meetingId) {
  const [transcripts, setTranscripts] = useState([]);
  
  useEffect(() => {
    // Fetch existing
    supabase
      .from('transcripts')
      .select('*')
      .eq('meeting_id', meetingId)
      .then(({ data }) => setTranscripts(data));
    
    // Subscribe to new inserts
    const sub = supabase
      .channel(`transcripts:${meetingId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transcripts',
        filter: `meeting_id=eq.${meetingId}`
      }, (payload) => {
        setTranscripts(prev => [...prev, payload.new]);
      })
      .subscribe();
    
    return () => sub.unsubscribe();
  }, [meetingId]);
  
  return transcripts;
}
```

---

## 7. Architecture Diagram (Chi tiết)

### **AWS Stack (Cũ) vs Soniox Stack (Mới)**

#### **AWS Architecture (LMA Original)**

```
Browser Extension
    ↓ WebSocket
Fargate WebSocket Server
    ↓ Audio stream
Amazon Transcribe (Dual-channel)
    ↓ Transcript events
┌─────────────────────────────────────────────────────────────┐
│           KINESIS DATA STREAMS                               │
│  • Buffer transcript events                                  │
│  • Partition by CallId                                       │
│  • Retention: 24 hours                                       │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│        AWS LAMBDA (Call Event Processor)                    │
│  • Process transcript segments                              │
│  • Sentiment analysis (Comprehend)                          │
│  • Meeting assist bot                                       │
│  • Translation (Amazon Translate)                           │
│  • Bedrock LLM integration                                  │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│         DynamoDB + AppSync (GraphQL)                        │
│  • Single-table design                                      │
│  • GraphQL mutations/queries                                │
│  • Real-time subscriptions                                  │
└──────────────────────┬──────────────────────────────────────┘
                       ↓ GraphQL Subscriptions
                    React UI
```

**Thành phần bị loại bỏ:**
- ❌ **Kinesis Data Streams** → ✅ Supabase PostgreSQL (buffer table)
- ❌ **AWS Lambda** → ✅ Worker Process / Edge Function
- ❌ **DynamoDB** → ✅ Supabase PostgreSQL
- ❌ **AppSync (GraphQL)** → ✅ Supabase Realtime (WebSocket)

---

### **Soniox + Supabase Architecture (Mới)**

```
┌────────────────────────────────────────────────────────────────┐
│  LAYER 1: BROWSER (Client)                                    │
├────────────────────────────────────────────────────────────────┤
│  Meeting App (Zoom/Teams/Google Meet)                         │
│    ↓                                   ↓                       │
│  Tab Audio                         Microphone                 │
│  (getDisplayMedia)                (getUserMedia)              │
│    ↓                                   ↓                       │
│  ┌──────────────────────────────────────────────┐             │
│  │ Web Audio API Processing                     │             │
│  │ • AudioContext @ 16kHz                       │             │
│  │ • Channel merging (stereo)                   │             │
│  │ • AudioWorklet (separate thread)             │             │
│  │ • PCM 16-bit encoding                        │             │
│  └──────────────────────────────────────────────┘             │
│    ↓                                                           │
│  Binary PCM stream (~256 kbps)                                │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         │ WebSocket #1 (Client → Backend)
                         │ • Binary audio chunks
                         │ • Latency: 10-50ms
                         ↓
┌────────────────────────────────────────────────────────────────┐
│  LAYER 2: BACKEND SERVER (Node.js/Deno/Bun)                   │
├────────────────────────────────────────────────────────────────┤
│  • Session management (1 session/meeting)                     │
│  • WebSocket server (handle multiple clients)                 │
│  • Audio routing & forwarding                                 │
│  • Supabase client (database operations)                      │
│  • Recording to Supabase Storage (WAV files)                  │
└───────┬────────────────────────────────┬───────────────────────┘
        │                                │
        │ WS #2 (Backend → Soniox)       │ INSERT (async)
        │ • Forward audio stream         │ • Only is_final=true
        │ • Receive transcripts          │ • UNIQUE constraint
        │ • Latency: 50-100ms            │ • Latency: 10-50ms
        ↓                                ↓
┌──────────────────┐          ┌────────────────────────────────┐
│  SONIOX API      │          │  SUPABASE PostgreSQL          │
│  (Speech-to-Text)│          │  transcript_events TABLE      │
├──────────────────┤          ├────────────────────────────────┤
│  • Real-time STT │          │  • Buffer/Staging layer       │
│  • Streaming API │          │  • UNIQUE(meeting_id,         │
│  • Multi-language│          │    start_time, end_time)      │
│  • Partial +     │          │  • processed=false initially  │
│    Final results │          │  • ~5000 events/30min meeting │
│  • Latency:      │          └───────────┬────────────────────┘
│    500-1500ms    │                      │
└──────────────────┘                      │ Poll every 5s
                                          │ Fetch LIMIT 200
                                          │ WHERE processed=false
                                          ↓
                              ┌────────────────────────────────┐
                              │  WORKER PROCESS / EDGE FUNCTION│
                              ├────────────────────────────────┤
                              │  Batch Processing Layer        │
                              │  (Thay thế Kinesis + Lambda)   │
                              │                                │
                              │  • Fetch batch (200 events)    │
                              │  • Group by meeting_id         │
                              │  • Optional: Sentiment analysis│
                              │  • Optional: Keyword extraction│
                              │  • Store to final table        │
                              │  • Mark processed=true         │
                              │  • Latency: 100-500ms/batch    │
                              └───────────┬────────────────────┘
                                          │ INSERT with
                                          │ UNIQUE constraint
                                          ↓
                              ┌────────────────────────────────┐
                              │  SUPABASE PostgreSQL           │
                              │  transcripts TABLE (Final)     │
                              ├────────────────────────────────┤
                              │  • Final processed transcripts │
                              │  • UNIQUE(meeting_id,          │
                              │    start_time, end_time)       │
                              │  • Indexed for fast queries    │
                              │  • Realtime enabled            │
                              │                                │
                              │  meetings TABLE                │
                              │  • Meeting metadata            │
                              │  • Title, participants, etc.   │
                              └───────────┬────────────────────┘
                                          │
                                          │ Supabase Realtime
                                          │ • Postgres Changes
                                          │ • WebSocket subscription
                                          │ • Auto-broadcast INSERT
                                          │ • Latency: 50-200ms
                                          ↓
┌────────────────────────────────────────────────────────────────┐
│  LAYER 3: WEB UI (React/Vue/Svelte)                           │
├────────────────────────────────────────────────────────────────┤
│  • Subscribe to Supabase Realtime                             │
│  • Display transcripts instantly                              │
│  • Search & filter                                            │
│  • Meeting summary view                                       │
│  • Export functionality                                       │
│  • Multi-tab support (passive mode)                           │
│                                                                │
│  Hosting: Vercel/Netlify/Cloudflare Pages (Free/Cheap)       │
└────────────────────────────────────────────────────────────────┘
```

### **Alternative: Direct Connection (Lower Latency)**

```
┌────────────────────────────────────────────────────────────────┐
│  BROWSER                                                       │
│  • Audio capture @ 16kHz                                      │
│  • PCM encoding                                               │
└────────────────┬───────────────────────────────────────────────┘
                 │
                 │ WebSocket DIRECT to Soniox
                 │ • No backend server needed
                 │ • Latency: ~50ms
                 ↓
┌────────────────────────────────────────────────────────────────┐
│  SONIOX API (Direct)                                          │
│  • Use temporary API key (from lightweight backend)           │
│  • Results sent directly to browser                           │
│  • Latency: 500-1500ms                                        │
└────────────────┬───────────────────────────────────────────────┘
                 │ Transcript results
                 ↓
┌────────────────────────────────────────────────────────────────┐
│  BROWSER                                                       │
│  ├→ Update UI IMMEDIATELY (0ms)  ⚡                           │
│  └→ Save to Supabase (async, non-blocking)                    │
└────────────────┬───────────────────────────────────────────────┘
                 │ Async save (optional)
                 ↓
          Supabase → Worker → Final Storage

Total latency: 0.8-1.5s (vs 1.5-2.5s with backend)
```

### **Recording Flow (Like LMA)**

```
┌────────────────────────────────────────────────────────────────┐
│  AUDIO RECORDING PIPELINE (Parallel with Transcription)       │
└────────────────────────────────────────────────────────────────┘

Browser sends audio chunk (250ms @ 16kHz)
  ↓
Backend receives binary PCM data
  ↓
  ├──→ Stream to Soniox API (for transcription)
  │     └→ Get transcript results
  │
  └──→ Write to local file (for recording)
        /tmp/[meetingId].raw
        • Accumulate all audio chunks
        • Track total size

Meeting ends (clientWs.close event)
  ↓
┌──────────────────────────────────────┐
│ Post-processing (Like LMA)           │
├──────────────────────────────────────┤
│ 1. Create WAV header                 │
│    • Sample rate: 16000 Hz           │
│    • Channels: 1 (mono)              │
│    • Bit depth: 16-bit               │
│    • Data size: recordingSize        │
│                                       │
│ 2. Combine header + raw audio        │
│    /tmp/[meetingId].raw              │
│    → /tmp/[meetingId].wav            │
│                                       │
│ 3. Upload to Supabase Storage        │
│    Bucket: meeting-recordings        │
│    File: [meetingId].wav             │
│    Public URL generated              │
│                                       │
│ 4. Update database                   │
│    meetings.recording_url            │
│    meetings.recording_size           │
│    meetings.recording_duration       │
│                                       │
│ 5. Cleanup temp files                │
│    Delete: /tmp/[meetingId].raw      │
│    Delete: /tmp/[meetingId].wav      │
└──────────────────────────────────────┘

Result:
  ✅ Full meeting recording available as WAV file
  ✅ Accessible via public URL
  ✅ Ready for playback in browser
  
Example:
  URL: https://[project].supabase.co/storage/v1/object/public/
       meeting-recordings/meeting-123.wav
  Size: 57.6 MB (30 min meeting)
  Duration: 1800 seconds
```

---

## 7.1. Data Flow với Số liệu Thực tế

### **Meeting 30 phút - Timeline chi tiết**

```
t=0:00  ┌─ Meeting starts
        │  User clicks "Start Recording"
        │
t=0:00  ├─ Browser captures audio
        │  • Sample rate: 16000 Hz
        │  • Bit depth: 16-bit
        │  • Channels: 2 (stereo)
        │  • Data rate: 512 kbps raw
        │
t=0:00  ├─ Connect to Backend WebSocket
        │  • Latency: ~50ms
        │  • Connection established
        │
t=0:05  ├─ First audio chunk sent
        │  • Chunk size: ~4KB (250ms audio)
        │  • Backend forwards to Soniox
        │
t=0:55  ├─ First transcript received
        │  • Text: "Hello" (is_final: false)
        │  • Display on UI (partial)
        │
t=1:20  ├─ Final transcript received
        │  • Text: "Hello everyone" (is_final: true) ✅
        │  • Save to database
        │  • Duplicate check: UNIQUE constraint
        │
        │  [Continuous streaming for 30 minutes...]
        │
        │  Statistics for 30 min meeting:
        │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        │  • Total events from Soniox: ~10,000
        │    ├─ Partial results: ~5,000 (filtered)
        │    └─ Final results: ~5,000 (saved)
        │
        │  • Database writes:
        │    ├─ transcript_events: 5,000 inserts
        │    ├─ Duplicates rejected: ~50 (1%)
        │    └─ Actual stored: 4,950
        │
        │  • Batch processing:
        │    ├─ Number of batches: 25 (5000÷200)
        │    ├─ Processing time: ~10 seconds total
        │    └─ Final transcripts: 4,950
        │
        │  • Data volume:
        │    ├─ Audio streamed: ~28 MB
        │    ├─ Transcripts stored: ~500 KB
        │    └─ Database size increase: ~1 MB
        │
t=30:00 └─ Meeting ends
           ↓
        ┌─ Post-processing (Recording)
        │  • Convert RAW → WAV: 2-3 seconds
        │  • Upload to Supabase Storage: 5-10 seconds
        │  • Recording file size: 57.6 MB (WAV)
        │  • Update meetings table with URL
        │  • Cleanup temp files
        │
        └─ Complete
           • Total latency: 1.5-2.5s avg (transcription)
           • Recording ready: +15 seconds after meeting
           • UI updates: Real-time
           • Cost: ~$0.90 (Soniox) + ~$0.001 (Storage)
```

---

## 7.2. Duplicate Prevention Flow

```
┌─────────────────────────────────────────────────────────┐
│  DUPLICATE PREVENTION: 3 Layers                        │
└─────────────────────────────────────────────────────────┘

Event: "Hello world" @ t=1.2s-1.8s

Layer 1: Client-side Filtering
  ┌──────────────────────────────────────┐
  │ result.tokens.filter(t => t.is_final)│
  └──────────────┬───────────────────────┘
                 │ Only final tokens pass
                 ↓
        {
          text: "Hello world",
          start_ms: 1200,
          end_ms: 1800,
          is_final: true ✅
        }

Layer 2: Database UNIQUE Constraint
  ┌──────────────────────────────────────┐
  │ UNIQUE(meeting_id, start_time,       │
  │        end_time)                     │
  └──────────────┬───────────────────────┘
                 │
    First insert  │  Second insert (duplicate)
         ✅       │       ❌
                 ↓
  ┌──────────────────────────────────────┐
  │ PostgreSQL Error Code: 23505         │
  │ "duplicate key value violates        │
  │  unique constraint"                  │
  └──────────────┬───────────────────────┘
                 │

Layer 3: Error Handling
  ┌──────────────────────────────────────┐
  │ try {                                │
  │   await supabase.insert(...)         │
  │ } catch (error) {                    │
  │   if (error.code === '23505') {      │
  │     console.log('Duplicate - OK');   │
  │   }                                  │
  │ }                                    │
  └──────────────────────────────────────┘

Result: 0% duplicate rate in database ✅
```

---

## 7.3. Component Roles & Responsibilities

| Component | Role | Responsibilities | Failure Mode |
|-----------|------|------------------|--------------|
| **Browser** | Audio Source | • Capture audio<br>• Encode PCM<br>• Stream to backend | Reconnect on disconnect |
| **Backend Server** | Orchestrator | • Route audio<br>• Manage sessions<br>• Handle duplicates | Auto-restart, stateless |
| **Soniox API** | STT Engine | • Real-time transcription<br>• Language detection | Retry with backoff |
| **transcript_events** | Buffer | • Stage incoming data<br>• Queue for processing | UNIQUE prevents duplicates |
| **Worker/Edge Function** | Processor | • Batch processing<br>• Data enrichment | Idempotent, can replay |
| **transcripts table** | Final Storage | • Persistent storage<br>• Query interface | UNIQUE prevents duplicates |
| **Supabase Realtime** | Broadcaster | • Push updates to clients<br>• WebSocket management | Client auto-reconnects |
| **Web UI** | Presentation | • Display transcripts<br>• User interactions | Fetch from DB on reload |

---

## 8. Performance & Latency

| Stage | Latency |
|-------|---------|
| Audio capture → Backend | 10-50ms |
| Backend → Soniox | 50-100ms |
| Soniox processing | 500-1500ms |
| Save to Supabase | 10-50ms |
| Realtime broadcast | 50-200ms |
| **Total end-to-end** | **1.5-2.5s** |

**Throughput:**
- Soniox: Unlimited concurrent (theo pricing tier)
- Supabase: 1000+ writes/sec (standard tier)
- Worker: Process 200 events every 5s = 2400 events/min

---

## 9. AWS Transcribe Features: Removed vs Replaced ⚠️

### **Features REMOVED (Not Supported by Soniox)**

#### ❌ **1. Content Redaction (PII Removal)**

**AWS Transcribe:**
```typescript
tsParams.ContentRedactionType = "PII";
tsParams.PiiEntityTypes = "CREDIT_DEBIT_NUMBER,SSN,EMAIL";
```

**Soniox:**

- ❌ Không hỗ trợ built-in PII redaction
- **Workaround:** Implement custom post-processing

  ```javascript
  // Custom PII detection after transcription
  function redactPII(transcript) {
    // Email regex
    transcript = transcript.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    
    // Phone numbers
    transcript = transcript.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    
    // Credit cards
    transcript = transcript.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
    
    // SSN
    transcript = transcript.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
    
    return transcript;
  }
  ```

#### ❌ **2. Post-Call Analytics (Call Analytics)**

**AWS Transcribe Call Analytics:**
```typescript
PostCallAnalyticsSettings: {
  OutputLocation: "s3://bucket/analytics/",
  DataAccessRoleArn: "arn:aws:iam::...",
  ContentRedactionOutput: "redacted_and_unredacted"
}
```

**Output:** JSON với sentiment, interruptions, talk time, categories, issues

**Soniox:** 
- ❌ Không có post-call analytics built-in
- **Workaround:** Build custom analytics

  ```javascript
  // Custom post-meeting analytics
  async function generateMeetingAnalytics(meetingId) {
    const { data: transcripts } = await supabase
      .from('transcript_events')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('start_time');
    
    // Group by speaker
    const speakerStats = {};
    transcripts.forEach(t => {
      if (!speakerStats[t.speaker_number]) {
        speakerStats[t.speaker_number] = {
          totalTime: 0,
          wordCount: 0,
          segments: 0
        };
      }
      
      speakerStats[t.speaker_number].totalTime += (t.end_time - t.start_time);
      speakerStats[t.speaker_number].wordCount += t.transcript.split(' ').length;
      speakerStats[t.speaker_number].segments++;
    });
    
    // Optional: Use AWS Comprehend for sentiment
    const sentimentResults = await analyzeSentiment(transcripts);
    
    return {
      duration: transcripts[transcripts.length - 1].end_time - transcripts[0].start_time,
      speakers: Object.keys(speakerStats).length,
      speakerStats,
      sentiment: sentimentResults
    };
  }
  ```

#### ❌ **3. Dual-Channel Separation (Channel-based)**

**AWS Transcribe:**
```typescript
EnableChannelIdentification: true,
NumberOfChannels: 2,
ChannelDefinitions: [
  { ChannelId: 0, ParticipantRole: "CUSTOMER" },
  { ChannelId: 1, ParticipantRole: "AGENT" }
]
```

**Result:** 100% accurate AGENT/CALLER separation

**Soniox:**
- ❌ Không có channel-based separation
- ✅ **REPLACED:** Speaker Diarization (~90-95% accuracy)

  ```javascript
  // Merge channels → Speaker detection
  enable_speaker_diarization: true
  
  // Result: speaker "1", "2", "3"... (not channel-based)
  ```

### **Features KEPT/REPLACED**

| AWS Transcribe Feature | Soniox Equivalent | Status |
|------------------------|-------------------|---------|
| **Language Detection** | `IdentifyLanguage: true` | ✅ `enable_language_identification: true` |
| **Custom Vocabulary** | `VocabularyName: string` | ✅ `context: string` (contextual biasing) |
| **Speaker Labels** | `ShowSpeakerLabel: true` | ✅ `enable_speaker_diarization: true` |
| **Multiple Languages** | `IdentifyMultipleLanguages: true` | ✅ `language_hints: ["en", "vi", "zh"]` |
| **Streaming** | StartStreamTranscription | ✅ WebSocket API |
| **Audio Format** | PCM 16kHz | ✅ PCM 16kHz |

### **Summary: Migration Impact**

| Feature | AWS | Soniox | Impact |
|---------|-----|--------|--------|
| **Channel Separation** | ✅ 100% | ⚠️ 90-95% (speaker AI) | Medium |
| **PII Redaction** | ✅ Built-in | ❌ Custom code needed | Low |
| **Post-Call Analytics** | ✅ Built-in | ❌ Custom code needed | Low |
| **Multi-speaker** | ❌ Only 2 | ✅ 10+ speakers | **High gain** |
| **Language Detection** | ✅ | ✅ | None |
| **Custom Vocabulary** | ✅ | ✅ | None |

---

## 10. Database Migration: DynamoDB → Supabase PostgreSQL

### **10.1. DynamoDB Schema Hiện tại (AWS LMA)**

#### **Single-Table Design (CallsTable)**

| Entity Type | Partition Key (PK) | Sort Key (SK) | Purpose |
|-------------|-------------------|---------------|---------|
| **Call** | `c#{CallId}` | `c#{CallId}` | Meeting metadata |
| **TranscriptSegment** | `c#{CallId}` | `ts#{timestamp}#{SegmentId}` | Transcript segments |
| **CallList** | `cl#{date}#{shard}` | `cl#{timestamp}#{CallId}` | Date-based queries |

#### **Call Entity (Meeting Metadata)**

| Field | Type | Description | Migration Action |
|-------|------|-------------|------------------|
| `CallId` | ID | Meeting identifier | ✅ **KEEP** → `meeting_id` |
| `CustomerPhoneNumber` | String | Customer phone | ⚠️ **OPTIONAL** (not used in web meetings) |
| `SystemPhoneNumber` | String | System phone | ⚠️ **OPTIONAL** (not used in web meetings) |
| `AgentId` | String | Agent identifier | ✅ **KEEP** → `agent_id` |
| `Status` | Enum | STARTED, TRANSCRIBING, ENDED, ERRORED | ✅ **KEEP** → `status` |
| `RecordingUrl` | String | S3 URL to recording | ✅ **KEEP** → `recording_url` |
| `CallSummaryText` | String | AI-generated summary | ✅ **KEEP** → `summary_text` |
| `CallCategories` | [String] | Categories detected | ✅ **KEEP** → `categories` (JSONB) |
| `IssuesDetected` | String | Issues detected | ✅ **KEEP** → `issues_detected` |
| `Sentiment` | Object | Aggregated sentiment | ✅ **KEEP** → `sentiment_stats` (JSONB) |
| `TotalConversationDurationMillis` | Float | Duration | ✅ **KEEP** → `duration_ms` |
| `Owner` | String | User email (UBAC) | ✅ **KEEP** → `owner_email` |
| `SharedWith` | String | Comma-separated emails | ✅ **KEEP** → `shared_with` (TEXT[]) |
| `CreatedAt` | AWSDateTime | Creation time | ✅ **KEEP** → `created_at` |
| `UpdatedAt` | AWSDateTime | Last update | ✅ **KEEP** → `updated_at` |
| `ExpiresAfter` | AWSTimestamp | TTL (DynamoDB) | ✅ **KEEP** → `expires_at` |
| `PK` | ID | DynamoDB partition key | ❌ **DELETE** (not needed in PostgreSQL) |
| `SK` | ID | DynamoDB sort key | ❌ **DELETE** (not needed in PostgreSQL) |

#### **TranscriptSegment Entity**

| Field | Type | Description | Migration Action |
|-------|------|-------------|------------------|
| `CallId` | ID | Meeting identifier | ✅ **KEEP** → `meeting_id` |
| `SegmentId` | ID | Segment identifier | ✅ **KEEP** → `segment_id` |
| `StartTime` | Float | Start time (ms) | ✅ **KEEP** → `start_time` |
| `EndTime` | Float | End time (ms) | ✅ **KEEP** → `end_time` |
| `Transcript` | String | Transcript text | ✅ **KEEP** → `transcript` |
| `IsPartial` | Boolean | Partial/final flag | ✅ **KEEP** → `is_partial` |
| **`Channel`** | Enum | **CALLER, AGENT, AGENT_ASSISTANT** | ⚠️ **REPLACE** → `channel` (backward compatible)<br>🆕 **ADD** → `speaker_number` |
| `Speaker` | String | Speaker name | ✅ **KEEP** → `speaker` |
| `Sentiment` | Enum | POSITIVE, NEGATIVE, NEUTRAL, MIXED | ✅ **KEEP** → `sentiment` |
| `SentimentScore` | Object | Detailed sentiment scores | ✅ **KEEP** → `sentiment_score` (JSONB) |
| `SentimentWeighted` | Float | Weighted sentiment | ✅ **KEEP** → `sentiment_weighted` |
| `Owner` | String | User email | ✅ **KEEP** → `owner_email` |
| `SharedWith` | String | Comma-separated emails | ✅ **KEEP** → `shared_with` (TEXT[]) |
| `CreatedAt` | AWSDateTime | Creation time | ✅ **KEEP** → `created_at` |
| `UpdatedAt` | AWSDateTime | Last update | ✅ **KEEP** → `updated_at` |
| `ExpiresAfter` | AWSTimestamp | TTL | ✅ **KEEP** → `expires_at` |
| `PK` | ID | DynamoDB partition key | ❌ **DELETE** |
| `SK` | ID | DynamoDB sort key | ❌ **DELETE** |

#### **Channel Enum (AWS Transcribe)**

| Value | Usage | Migration Action |
|-------|-------|------------------|
| `CALLER` | Customer/user speaking | ⚠️ **KEEP** (backward compatible) |
| `AGENT` | Agent/employee speaking | ⚠️ **KEEP** (backward compatible) |
| `AGENT_VOICETONE` | Voice tone analysis | ❌ **REMOVE** (rarely used) |
| `CALLER_VOICETONE` | Voice tone analysis | ❌ **REMOVE** (rarely used) |
| `AGENT_ASSISTANT` | AI assistant responses | ✅ **KEEP** |
| `CHAT_ASSISTANT` | Chat assistant responses | ✅ **KEEP** |
| `CATEGORY_MATCH` | Category detection | ✅ **KEEP** |

---

### **10.2. Supabase PostgreSQL Schema (Soniox)**

#### **meetings Table** (Replaces Call Entity)

```
meetings
├─ id: UUID (PRIMARY KEY)
├─ meeting_id: TEXT (UNIQUE, indexed)
├─ title: TEXT
├─ agent_id: TEXT
├─ status: TEXT (started, transcribing, ended, errored)
├─ recording_url: TEXT
├─ recording_size: BIGINT
├─ recording_duration: INTEGER
├─ summary_text: TEXT
├─ categories: JSONB
├─ issues_detected: TEXT
├─ sentiment_stats: JSONB
├─ duration_ms: INTEGER
├─ owner_email: TEXT (indexed for UBAC)
├─ shared_with: TEXT[]
├─ started_at: TIMESTAMPTZ
├─ ended_at: TIMESTAMPTZ
├─ created_at: TIMESTAMPTZ (DEFAULT NOW())
├─ updated_at: TIMESTAMPTZ
└─ expires_at: TIMESTAMPTZ
```

**Changes from DynamoDB:**
- ❌ **Removed:** `PK`, `SK` (DynamoDB keys)
- ❌ **Removed:** `CustomerPhoneNumber`, `SystemPhoneNumber` (telephony-specific)
- ✅ **Added:** `title` (meeting name)
- ✅ **Added:** `recording_size`, `recording_duration` (file metadata)
- ✅ **Changed:** `SharedWith` (String → TEXT[] array)

#### **transcript_events Table** (Buffer/Staging)

```
transcript_events (Replaces Kinesis)
├─ id: BIGSERIAL (PRIMARY KEY)
├─ meeting_id: TEXT (indexed)
├─ transcript: TEXT
├─ start_time: INTEGER
├─ end_time: INTEGER
├─ is_final: BOOLEAN
├─ processed: BOOLEAN (DEFAULT false)
├─ timestamp: TIMESTAMPTZ (DEFAULT NOW())
└─ UNIQUE(meeting_id, start_time, end_time)  -- Prevent duplicates
```

**Purpose:**
- ✅ **Replaces:** Kinesis Data Streams (event buffer)
- ✅ **Function:** Staging area for incoming Soniox results
- ✅ **Processing:** Worker polls WHERE processed=false

#### **transcripts Table** (Final Storage)

```
transcripts (Replaces TranscriptSegment Entity)
├─ id: BIGSERIAL (PRIMARY KEY)
├─ meeting_id: TEXT (indexed)
├─ segment_id: TEXT
├─ transcript: TEXT
├─ start_time: INTEGER
├─ end_time: INTEGER
├─ is_partial: BOOLEAN
│
├─ 🆕 speaker_number: TEXT  ← NEW: Soniox speaker ID ("1", "2", "3"...)
├─ 🆕 speaker_name: TEXT    ← NEW: User-assigned name
├─ 🆕 speaker_role: TEXT    ← NEW: "Host", "Participant"
├─ ⚠️  channel: TEXT        ← KEEP: Backward compatible (optional)
│
├─ speaker: TEXT (legacy speaker name)
├─ sentiment: TEXT
├─ sentiment_score: JSONB
├─ sentiment_weighted: FLOAT
├─ owner_email: TEXT (indexed)
├─ shared_with: TEXT[]
├─ created_at: TIMESTAMPTZ (DEFAULT NOW())
├─ updated_at: TIMESTAMPTZ
├─ expires_at: TIMESTAMPTZ
└─ UNIQUE(meeting_id, speaker_number, start_time, end_time)
```

**Key Changes:**
- 🆕 **Added:** `speaker_number` (Soniox speaker ID)
- 🆕 **Added:** `speaker_name` (user-assigned)
- 🆕 **Added:** `speaker_role` (role metadata)
- ⚠️ **Keep:** `channel` (backward compatible, optional)
- ❌ **Removed:** `PK`, `SK` (DynamoDB keys)

#### **speaker_identity Table** (NEW)

```
speaker_identity
├─ id: BIGSERIAL (PRIMARY KEY)
├─ meeting_id: TEXT
├─ speaker_number: TEXT  -- Soniox speaker ID
├─ speaker_name: TEXT    -- "John Doe"
├─ speaker_email: TEXT   -- Optional
├─ identified_at: TIMESTAMPTZ (DEFAULT NOW())
└─ PRIMARY KEY (meeting_id, speaker_number)
```

**Purpose:**
- 🆕 **New Feature:** Map Soniox speaker numbers to real identities
- 🆕 **User Assignment:** Allow users to identify speakers

---

### **10.3. Migration Actions Summary**

#### **DELETE (Không cần nữa)**

| Field/Table | Reason |
|-------------|--------|
| `PK`, `SK` keys | DynamoDB-specific, PostgreSQL uses normal primary keys |
| `AGENT_VOICETONE`, `CALLER_VOICETONE` channels | Rarely used, không phải core feature |
| `CallList` entity | PostgreSQL có native date queries với indexes |
| `CustomerPhoneNumber`, `SystemPhoneNumber` | Telephony-specific, không dùng cho web meetings |

#### **KEEP (Giữ nguyên)**

| Field | New Name | Notes |
|-------|----------|-------|
| `CallId` | `meeting_id` | Core identifier |
| `AgentId` | `agent_id` | User identifier |
| `Status` | `status` | Meeting state |
| `RecordingUrl` | `recording_url` | Recording link |
| `CallSummaryText` | `summary_text` | AI summary |
| `CallCategories` | `categories` | Categories (JSON array) |
| `IssuesDetected` | `issues_detected` | Issues text |
| `Sentiment` | `sentiment_stats` | Aggregated sentiment |
| `Owner` | `owner_email` | UBAC owner |
| `SharedWith` | `shared_with` | Sharing (TEXT[]) |
| `Transcript` | `transcript` | Transcript text |
| `StartTime` | `start_time` | Timing |
| `EndTime` | `end_time` | Timing |
| `IsPartial` | `is_partial` | Partial flag |
| `Speaker` | `speaker` | Speaker name |
| `Channel` | `channel` | **Optional** (backward compatible) |
| `Sentiment` | `sentiment` | Sentiment enum |
| `SentimentScore` | `sentiment_score` | Sentiment details |

#### **ADD (Thêm mới)**

| Field | Purpose | For Soniox |
|-------|---------|------------|
| `speaker_number` | Soniox speaker ID ("1", "2", "3") | ✅ Core for speaker detection |
| `speaker_name` | User-assigned name | ✅ User identification |
| `speaker_role` | Role metadata | ✅ "Host", "Participant" |
| `title` | Meeting name | ⚠️ Better UX |
| `recording_size` | File size | ⚠️ File metadata |
| `recording_duration` | Duration in seconds | ⚠️ File metadata |
| `speaker_identity` table | Speaker mapping | ✅ New feature for Soniox |
| `transcript_events` table | Buffer/staging | ✅ Replaces Kinesis |

#### **MODIFY (Thay đổi)**

| Field | Old | New | Reason |
|-------|-----|-----|--------|
| `SharedWith` | String (comma-separated) | TEXT[] | PostgreSQL native array |
| `CallCategories` | [String] | JSONB | Better PostgreSQL support |
| `Sentiment` | Object | JSONB | PostgreSQL native JSON |
| `Channel` | Required | Optional | Now use `speaker_number` instead |

---

### **10.4. Migration Strategy**

#### **Phase 1: Parallel Run (Dual Write)**
- ✅ Write to both DynamoDB và Supabase
- ✅ Validate data consistency
- ✅ No downtime

#### **Phase 2: Read Cutover**
- ✅ Switch UI to read from Supabase
- ✅ Keep DynamoDB as backup
- ✅ Monitor for issues

#### **Phase 3: Full Migration**
- ✅ Stop writing to DynamoDB
- ✅ Export historical data
- ✅ Archive DynamoDB tables

#### **Phase 4: Cleanup**
- ✅ Remove DynamoDB dependencies
- ✅ Remove AppSync
- ✅ Delete old infrastructure

---

## 11. Cost Comparison

### AWS Stack
```
Transcribe:  $72/month (100 meetings × 30min)
Kinesis:     $11/month (1 shard)
Lambda:      $2-20/month
DynamoDB:    $5-50/month
AppSync:     $5-15/month
S3+CloudFront: $5/month
─────────────────────────
TOTAL:       $100-173/month
```

### Soniox + Supabase
```
Soniox:      $90/month (100 meetings × 30min)
Supabase:    $25/month (Pro tier)
Backend:     $5-20/month (Railway/Fly.io)
Frontend:    $0 (Vercel/Netlify free)
─────────────────────────
TOTAL:       $120-135/month

OR Free tier:
Soniox:      $90/month  
Supabase:    $0 (Free tier)
Backend:     $0 (Fly.io free tier)
─────────────────────────
TOTAL:       $90/month (chỉ trả Soniox!)
```

**Savings: 20-50% cheaper**

---

## 10. Key Technologies

| Layer | AWS Stack | Soniox + Supabase |
|-------|-----------|-------------------|
| **STT** | Amazon Transcribe | Soniox API |
| **Buffer** | Kinesis | Supabase PostgreSQL |
| **Processing** | Lambda | Worker / Edge Function |
| **Storage** | DynamoDB | Supabase PostgreSQL |
| **Realtime** | AppSync | Supabase Realtime |
| **Auth** | Cognito | Supabase Auth |
| **Storage** | S3 | Supabase Storage |
| **Frontend** | CloudFront + S3 | Vercel/Netlify |

---

## Deployment

```bash
# 1. Supabase setup
npx supabase init
npx supabase start
npx supabase db push # Apply schema

# 2. Backend server
npm install ws @supabase/supabase-js
node server.js # or deploy to Fly.io/Railway

# 3. Frontend
npm install @supabase/supabase-js
npm run build
# Deploy to Vercel/Netlify

# 4. Worker (optional, if not using Edge Functions)
node worker.js # or PM2, systemd, Docker
```

---

## 11. Thay thế AGENT/CALLER bằng Speaker Detection 🎯

### **LMA cũ (Amazon Transcribe)**

```text
Dual-channel audio:
  Channel 0 (Left)  → AGENT
  Channel 1 (Right) → CALLER

✅ 100% accurate channel separation
❌ Chỉ hỗ trợ 2 người (1-on-1 call)
```

### **LMA mới (Soniox)**

```text
AI Speaker Diarization:
  Audio merged → Speaker "1", "2", "3", "4", "5"...

✅ Hỗ trợ nhiều người (2-10+ speakers)
✅ Không cần dual-channel setup
⚠️  ~90-95% accuracy (AI-based)
```

---

### **Implementation Strategy**

#### **Option 1: Auto Speaker Detection** (Khuyến nghị)

```javascript
// Backend: Enable speaker diarization
sonioxWs.send(JSON.stringify({
  api_key: SONIOX_API_KEY,
  enable_speaker_diarization: true,  // ✅
  model: "stt-rt-preview-v2"
}));

// Kết quả
{
  "tokens": [
    {"text": "Hello", "speaker": "1"},     // Person 1
    {"text": "Hi",    "speaker": "2"},     // Person 2
    {"text": "Hey",   "speaker": "3"}      // Person 3
  ]
}
```

**Database Schema Update:**

```sql
CREATE TABLE transcript_events (
  -- Old fields (backward compatible)
  channel TEXT,  -- NULL for new meetings
  
  -- ✅ NEW: Speaker tracking
  speaker_number TEXT,  -- "1", "2", "3", "4", "5"...
  speaker_name TEXT,    -- "John Doe", "Jane Smith" (user-defined)
  speaker_role TEXT,    -- "Host", "Participant", "Guest"
  
  -- Unique constraint
  UNIQUE(meeting_id, speaker_number, start_time, end_time)
);

-- Mapping table
CREATE TABLE speaker_identity (
  meeting_id TEXT,
  speaker_number TEXT,  -- Soniox speaker ID
  speaker_name TEXT,    -- Real name
  speaker_email TEXT,   -- Optional
  identified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (meeting_id, speaker_number)
);
```

#### **Option 2: User-Assigned Speakers**

```javascript
// UI: First-time speaker detection
const UnidentifiedSpeakerModal = () => {
  return (
    <Modal>
      <p>Speaker {speakerNumber} said:</p>
      <blockquote>"{transcript}"</blockquote>
      
      <input 
        placeholder="Who is this? (e.g., John Doe)"
        onChange={(e) => setSpeakerName(e.target.value)}
      />
      
      <button onClick={async () => {
        await supabase.from('speaker_identity').insert({
          meeting_id: meetingId,
          speaker_number: speakerNumber,
          speaker_name: speakerName
        });
        
        // Update all transcripts
        await supabase.from('transcript_events')
          .update({ speaker_name: speakerName })
          .eq('meeting_id', meetingId)
          .eq('speaker_number', speakerNumber);
      }}>
        Confirm
      </button>
    </Modal>
  );
};
```

#### **Option 3: Hybrid (Auto + Manual Override)**

```javascript
// Backend: Auto-assign with confidence
sonioxWs.on('message', async (data) => {
  const result = JSON.parse(data);
  
  for (const token of result.tokens.filter(t => t.is_final)) {
    const speakerNumber = token.speaker;
    
    // Check if speaker already identified
    const { data: identity } = await supabase
      .from('speaker_identity')
      .select('speaker_name')
      .eq('meeting_id', meetingId)
      .eq('speaker_number', speakerNumber)
      .single();
    
    const speakerName = identity?.speaker_name || `Speaker ${speakerNumber}`;
    
    await supabase.from('transcript_events').insert({
      meeting_id: meetingId,
      transcript: token.text,
      speaker_number: speakerNumber,
      speaker_name: speakerName,
      needs_identification: !identity,  // ✅ Flag for UI
      start_time: token.start_ms,
      end_time: token.end_ms
    });
  }
});
```

---

### **Migration Path: AGENT/CALLER → Speaker Detection**

```sql
-- View: Backward compatible với old queries
CREATE VIEW transcript_events_legacy AS
SELECT 
  id,
  meeting_id,
  transcript,
  
  -- Map speaker → channel (legacy)
  CASE 
    WHEN speaker_role = 'Agent' THEN 'AGENT'
    WHEN speaker_role = 'Customer' THEN 'CALLER'
    WHEN speaker_number = '1' THEN 'AGENT'  -- Default mapping
    ELSE 'CALLER'
  END AS channel,
  
  speaker_name AS speaker,
  start_time,
  end_time
FROM transcript_events;

-- Old queries vẫn work
SELECT * FROM transcript_events_legacy WHERE channel = 'AGENT';
```

---

### **Ưu điểm của Speaker Detection**

| Feature | AGENT/CALLER (cũ) | Speaker 1-5 (mới) |
|---------|-------------------|-------------------|
| **Max speakers** | 2 | 10+ |
| **Accuracy** | 100% (channel-based) | 90-95% (AI-based) |
| **Setup** | Cần dual-channel audio | Chỉ cần mono/stereo |
| **Use case** | Call center 1-on-1 | Meetings, conferences |
| **Flexibility** | Fixed roles | Dynamic speakers |

---

### **UI Display**

```jsx
// New UI with speaker colors
const TranscriptItem = ({ event }) => {
  const speakerColor = getSpeakerColor(event.speaker_number);
  
  return (
    <div className="transcript-item">
      <div 
        className="speaker-badge" 
        style={{ backgroundColor: speakerColor }}
      >
        {event.speaker_name || `Speaker ${event.speaker_number}`}
      </div>
      <div className="transcript-text">
        {event.transcript}
      </div>
      <div className="timestamp">
        {formatTime(event.start_time)}
      </div>
    </div>
  );
};

// Speaker color mapping
function getSpeakerColor(speakerNumber) {
  const colors = {
    '1': '#3B82F6',  // Blue
    '2': '#10B981',  // Green
    '3': '#F59E0B',  // Amber
    '4': '#EF4444',  // Red
    '5': '#8B5CF6',  // Purple
  };
  return colors[speakerNumber] || '#6B7280';  // Gray default
}
```

---

## Kết luận

**Soniox + Supabase** là kiến trúc hiện đại, đơn giản hơn AWS stack:

### **Ưu điểm ✅**

- **Cheaper**: $90-135 vs $100-173/month (~30% savings)
- **Simpler**: 3 components vs 7 AWS services
- **Faster setup**: 10 phút vs 2-4 giờ
- **Better DX**: SQL, TypeScript, built-in realtime
- **Scalable**: Handle 1000+ meetings/month
- **Multi-speaker**: 2-10+ người (vs chỉ 2 với AWS Transcribe)
- **Merged audio**: Không cần setup dual-channel

### **Trade-offs ⚠️**

- **Accuracy**: 90-95% speaker detection (vs 100% channel separation)
- **PII Redaction**: Custom code needed (vs built-in)
- **Post-Call Analytics**: Custom code needed (vs built-in)

### **Best For:**

✅ **Meetings & Conferences** (3+ participants)  
✅ **Startups & SMBs** (cost-sensitive)  
✅ **Multi-language support** (100+ languages)  
✅ **Quick deployment** (minutes not hours)

### **Not Recommended For:**

❌ **Strict compliance** (PII redaction required)  
❌ **Contact centers** (need 100% AGENT/CALLER accuracy)  
❌ **1-on-1 calls** (AWS Transcribe dual-channel better)

---

Perfect cho startups và SMBs! 🚀

---

## 12. Implementation Progress 🚧

### **Completed Tasks** ✅

#### **1. Database Schema (Supabase PostgreSQL)** ✅
- **File**: `/supabase/migrations/001_initial_schema.sql`
- **Tables Created**:
  - `meetings` - Meeting metadata (replaces DynamoDB Call entity)
  - `transcript_events` - Buffer/staging layer (replaces Kinesis)
  - `transcripts` - Final transcript storage (replaces DynamoDB TranscriptSegment)
  - `speaker_identity` - Speaker name mapping (NEW for Soniox)
- **Storage Bucket**: `meeting-recordings` (replaces S3)
- **Features**:
  - UNIQUE constraints to prevent duplicates
  - Row Level Security (RLS) policies
  - Indexes for performance optimization
  - Speaker detection fields (`speaker_number`, `speaker_name`, `speaker_role`)

### **Pending Tasks** 🔄

#### **2. Update package.json Dependencies**
**File**: `/lma-websocket-transcriber-stack/source/app/package.json`

**Changes needed**:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",  // Add: Supabase client
    "ws": "^8.16.0",                      // Add: WebSocket for Soniox
    // Remove: All @aws-sdk/* packages
    // Remove: aws-jwt-verify (if using Supabase Auth)
  }
}
```

**Removed dependencies**:
- `@aws-sdk/client-dynamodb` - Replaced by Supabase PostgreSQL
- `@aws-sdk/client-kinesis` - Replaced by direct DB inserts
- `@aws-sdk/client-s3` - Replaced by Supabase Storage
- `@aws-sdk/client-transcribe-streaming` - Replaced by Soniox API
- `aws-jwt-verify` - (optional: can use Supabase Auth instead)

#### **3. Create Supabase Client Module**
**File**: `/lma-websocket-transcriber-stack/source/app/src/supabase-client.ts`

**Functions to implement**:
```typescript
// Database operations
export const insertTranscriptEvent() // Write to transcript_events
export const insertTranscript()      // Write to transcripts
export const insertOrUpdateMeeting() // Upsert meetings
export const updateMeetingRecording() // Update recording URL
export const insertSpeakerIdentity() // Save speaker mapping
export const getSpeakerName()        // Get speaker identity

// Supabase client initialization
export const supabase: SupabaseClient
```

**Environment variables needed**:
```bash
SUPABASE_URL=https://[project].supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

#### **4. Create Soniox Integration Module**
**File**: `/lma-websocket-transcriber-stack/source/app/src/calleventdata/soniox.ts`

**Replaces**: `transcribe.ts` (AWS Transcribe integration)

**Key functions**:
```typescript
// Replace AWS Transcribe with Soniox
export const startSonioxTranscription()

// Handle Soniox WebSocket connection
- Connect to wss://stt-rt.soniox.com/transcribe-websocket
- Enable speaker diarization
- Stream PCM audio
- Receive transcript results with speaker detection

// Write to Supabase (replace Kinesis writes)
export const writeTranscriptToSupabase()

// Meeting lifecycle events
export const writeMeetingStartEvent()
export const writeMeetingEndEvent()
export const writeMeetingRecordingEvent()
```

**Configuration**:
```typescript
{
  api_key: SONIOX_API_KEY,
  audio_format: "pcm_s16le",
  sample_rate: 16000,
  num_channels: 1,  // Mono merged audio
  model: "stt-rt-preview-v2",
  enable_speaker_diarization: true,  // NEW: Replace dual-channel
  language_hints: ["en", "vi"],
}
```

**Speaker Detection Logic**:
```typescript
// Group tokens by speaker
const speakerGroups = {};
finalTokens.forEach(token => {
  const speakerNumber = token.speaker || '1';
  if (!speakerGroups[speakerNumber]) {
    speakerGroups[speakerNumber] = [];
  }
  speakerGroups[speakerNumber].push(token);
});

// Save each speaker's segment
for (const [speakerNumber, tokens] of Object.entries(speakerGroups)) {
  await insertTranscriptEvent({
    meeting_id: meetingId,
    transcript: tokens.map(t => t.text).join(''),
    speaker_number: speakerNumber,  // NEW
    speaker_name: null,              // NEW (user fills later)
    channel: mapSpeakerToChannel(speakerNumber), // Backward compatible
    start_time: tokens[0].start_ms,
    end_time: tokens[tokens.length - 1].end_ms,
    is_final: true
  });
}
```

#### **5. Update Recording Upload (S3 → Supabase Storage)**
**File**: `/lma-websocket-transcriber-stack/source/app/src/index.ts`

**Changes**:
```typescript
// OLD: S3 upload
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
await s3.send(new PutObjectCommand({
  Bucket: RECORDINGS_BUCKET_NAME,
  Key: `${callId}.wav`,
  Body: wavStream
}));

// NEW: Supabase Storage upload
import { supabase } from './supabase-client';
const { data, error } = await supabase.storage
  .from('meeting-recordings')
  .upload(`${meetingId}.wav`, wavFileBuffer, {
    contentType: 'audio/wav',
    upsert: false
  });

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('meeting-recordings')
  .getPublicUrl(`${meetingId}.wav`);

// Update meeting record
await updateMeetingRecording(meetingId, publicUrl, recordingSize, recordingDuration);
```

#### **6. Speaker Identity Management**
**New Feature** - Allow users to assign names to speakers

**Backend API** (new endpoint):
```typescript
// POST /meetings/:meetingId/speakers/:speakerNumber/identify
app.post('/meetings/:meetingId/speakers/:speakerNumber/identify', async (req, res) => {
  const { meetingId, speakerNumber } = req.params;
  const { speakerName, speakerEmail } = req.body;
  
  await insertSpeakerIdentity({
    meeting_id: meetingId,
    speaker_number: speakerNumber,
    speaker_name: speakerName,
    speaker_email: speakerEmail
  });
  
  // Update all transcripts with this speaker
  await supabase.from('transcripts')
    .update({ speaker_name: speakerName })
    .eq('meeting_id', meetingId)
    .eq('speaker_number', speakerNumber);
  
  res.json({ success: true });
});
```

**Frontend UI** (modal when unknown speaker detected):
```typescript
// Show modal: "Speaker 1 said: 'Hello everyone'. Who is this?"
// User inputs: "John Doe"
// Backend updates all speaker_number="1" with speaker_name="John Doe"
```

#### **7. Error Handling Updates**
**Files**: All `.ts` files in `/lma-websocket-transcriber-stack/source/app/src/`

**Changes needed**:
```typescript
// OLD: AWS error handling
import { ClientError } from '@aws-sdk/client-kinesis';
catch (error) {
  if (error instanceof ClientError && error.name === 'ProvisionedThroughputExceededException') {
    // Handle AWS-specific error
  }
}

// NEW: Supabase error handling
catch (error) {
  if (error.code === '23505') {
    // Duplicate key - ignore (expected behavior)
    console.log('Duplicate transcript - skipping');
  } else if (error.code === '23503') {
    // Foreign key violation
    console.error('Meeting not found');
  } else {
    // Generic error
    console.error('Database error:', error);
  }
}

// NEW: Soniox WebSocket error handling
sonioxWs.on('error', (error) => {
  console.error('Soniox connection error:', error);
  // Implement retry logic with exponential backoff
});

sonioxWs.on('close', () => {
  // Reconnect if meeting still active
  if (meetingActive) {
    setTimeout(() => reconnectToSoniox(), RETRY_DELAY);
  }
});
```

#### **8. Testing Plan**
**Test Scenarios**:

1. **Basic Transcription**
   - Start meeting → Audio streams → Transcripts appear
   - Verify speaker detection (Speaker 1, 2, 3...)
   - Check real-time UI updates (Supabase Realtime)

2. **Duplicate Prevention**
   - Send same transcript event twice
   - Verify database rejects duplicate (UNIQUE constraint)
   - Verify error handling (code 23505 ignored)

3. **Recording Upload**
   - Complete meeting → Recording converts to WAV
   - Upload to Supabase Storage
   - Verify public URL saved in meetings table
   - Verify file accessible via URL

4. **Speaker Identity**
   - Detect unknown speaker
   - Assign name via UI
   - Verify all past transcripts updated

5. **Multi-speaker Meeting**
   - Meeting with 3+ participants
   - Verify each speaker detected separately
   - Verify transcript grouping by speaker

6. **Edge Cases**
   - Network interruption → Reconnection
   - Very long meeting (60+ minutes)
   - Rapid speaker changes
   - Multiple simultaneous meetings

---

### **Migration Order** (Recommended Sequence)

```
1. ✅ Database Schema (DONE)
   └─ File: /supabase/migrations/001_initial_schema.sql

2. ⏳ Dependencies Update
   └─ File: package.json
   └─ Run: npm install

3. ⏳ Supabase Client
   └─ File: src/supabase-client.ts
   └─ Test: Database connection

4. ⏳ Soniox Integration
   └─ File: src/calleventdata/soniox.ts
   └─ Test: Transcription with speaker detection

5. ⏳ Recording Upload
   └─ File: src/index.ts
   └─ Test: Upload to Supabase Storage

6. ⏳ Speaker Identity
   └─ Files: Backend API + Frontend UI
   └─ Test: Assign speaker names

7. ⏳ Error Handling
   └─ Files: All .ts files
   └─ Test: Error scenarios

8. ⏳ Integration Testing
   └─ Test: End-to-end meeting flow
```

---

### **Environment Variables Checklist**

**New variables to add** (`.env` file):
```bash
# Supabase
SUPABASE_URL=https://[project].supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...  # For admin operations

# Soniox
SONIOX_API_KEY=your-soniox-api-key

# Audio config
AUDIO_SAMPLE_RATE=16000
AUDIO_CHANNELS=1  # Mono merged
AUDIO_FORMAT=pcm_s16le
```

**Variables to remove**:
```bash
# AWS (no longer needed)
AWS_REGION
KINESIS_STREAM_NAME
RECORDINGS_BUCKET_NAME
TCA_DATA_ACCESS_ROLE_ARN
CALL_ANALYTICS_FILE_PREFIX

# AWS Transcribe (no longer needed)
TRANSCRIBE_API_MODE
TRANSCRIBE_LANGUAGE_CODE
IS_CONTENT_REDACTION_ENABLED
CONTENT_REDACTION_TYPE
TRANSCRIBE_PII_ENTITY_TYPES
IS_TCA_POST_CALL_ANALYTICS_ENABLED
POST_CALL_CONTENT_REDACTION_OUTPUT
```

---

### **Code Files Status**

| File | Status | Notes |
|------|--------|-------|
| `/supabase/migrations/001_initial_schema.sql` | ✅ Complete | DB schema with speaker detection |
| `/lma-websocket-transcriber-stack/source/app/package.json` | ⏳ Pending | Need to update dependencies |
| `/lma-websocket-transcriber-stack/source/app/src/supabase-client.ts` | ⏳ Pending | Create new file |
| `/lma-websocket-transcriber-stack/source/app/src/calleventdata/soniox.ts` | ⏳ Pending | Create new file (replace transcribe.ts) |
| `/lma-websocket-transcriber-stack/source/app/src/index.ts` | ⏳ Pending | Update S3 → Supabase Storage |
| `/lma-websocket-transcriber-stack/source/app/src/calleventdata/transcribe.ts` | ⏳ Pending | Will be replaced/deprecated |

---

### **Next Steps** 🎯

1. **Update package.json** - Remove AWS SDK, add Supabase + ws
2. **Run npm install** - Install new dependencies
3. **Create supabase-client.ts** - Database operations module
4. **Create soniox.ts** - Replace AWS Transcribe integration
5. **Update index.ts** - Replace S3 with Supabase Storage
6. **Test locally** - Verify transcription + recording flow
7. **Deploy** - Push to production

**Estimated Time**: 4-6 hours for core migration (tasks 2-5)
