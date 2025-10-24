# Stage 6 (UI Display) Integration Guide

## Problem Fixed

**Before:** Pipeline debug logs stopped at stage 5 (REALTIME_BROADCAST), stage 6 (UI_RECEIVED) was never logged.

**After:** Complete end-to-end pipeline tracking from audio capture to UI display.

## Changes Made

### 1. Backend Fix ✅
**File:** `/lma-websocket-transcriber-stack/source/app/src/utils/pipeline-log-poller.ts`

Added missing case for stage 6 in the log poller:

```typescript
case '6️⃣ UI_RECEIVED':
    logger.logUIReceived(
        log.call_id,
        log.transcript || '',
        log.speaker || 'Unknown',
        log.metadata
    );
    break;
```

### 2. Frontend Logging Utility ✅
**File:** `/lma-browser-extension-stack/src/utils/pipelineLogger.ts`

Created utility to send stage 6 logs to backend:

```typescript
import { logUIReceivedDebounced } from '../utils/pipelineLogger';

// When transcript is received from Supabase Realtime
logUIReceivedDebounced({
  callId: 'meeting-123',
  transcript: 'Hello world',
  speaker: 'Speaker 1',
  metadata: {
    timestamp: new Date().toISOString(),
    segmentId: '180-1260',
    confidence: 0.95
  }
});
```

### 3. Realtime Subscription Hook ✅
**File:** `/lma-browser-extension-stack/src/hooks/useTranscriptSubscription.ts`

Created React hook that:
- Subscribes to Supabase Realtime for live transcripts
- Automatically logs stage 6 when transcripts arrive
- Handles both INSERT and UPDATE events

## Usage Example

### In a React Component

```typescript
import React from 'react';
import { useTranscriptSubscription } from '../hooks/useTranscriptSubscription';

function MeetingTranscriptView({ callId }: { callId: string }) {
  const { transcripts, isLoading, error } = useTranscriptSubscription(callId);

  if (isLoading) return <div>Loading transcripts...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {transcripts.map((transcript) => (
        <div key={transcript.id}>
          <strong>{transcript.speaker}:</strong> {transcript.transcript}
        </div>
      ))}
    </div>
  );
}
```

### Direct Usage (Without Hook)

```typescript
import { supabase } from './context/SupabaseContext';
import { logUIReceivedDebounced } from './utils/pipelineLogger';

// Subscribe to transcripts
const channel = supabase
  .channel('transcripts:my-call-id')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'transcripts',
    filter: 'call_id=eq.my-call-id'
  }, (payload) => {
    const transcript = payload.new;
    
    // Display transcript in UI
    displayTranscript(transcript);
    
    // Log stage 6
    logUIReceivedDebounced({
      callId: transcript.call_id,
      transcript: transcript.transcript,
      speaker: transcript.speaker,
      metadata: {
        timestamp: transcript.created_at,
        segmentId: transcript.segment_id
      }
    });
  })
  .subscribe();
```

## Pipeline Stages (Complete)

Now all 6 stages are tracked:

1. **🎤 AUDIO_RECEIVED** → Browser sends PCM audio via WebSocket
2. **🔊 STT_PROCESSING** → Soniox API transcribes audio + speaker diarization
3. **💾 DATABASE_INSERT** → Save to transcript_events table (staging)
4. **⚙️ EDGE_FUNCTION** → Process and move to transcripts table (final)
5. **📡 REALTIME_BROADCAST** → Supabase Realtime pushes to subscribers
6. **🖥️ UI_DISPLAY** → React UI receives and renders transcript ✅ **NOW WORKING**

## Testing

### 1. Start a meeting transcription
```bash
# Start backend
cd lma-websocket-transcriber-stack/source/app
npm start
```

### 2. Open the web app and start recording

### 3. Check the debug log
```bash
ls -la lma-websocket-transcriber-stack/source/app/debug-logs/
cat lma-websocket-transcriber-stack/source/app/debug-logs/pipeline-*.txt
```

### 4. Verify stage 6 appears
Look for entries like:
```
[+12.534s]   6️⃣ UI_RECEIVED              | Speaker: Speaker 1      
                                                       └─ Text: "Hello world"
                                                          {
                                                            "receivedAt": "2025-10-23T15:00:00.000Z",
                                                            "segmentId": "180-1260",
                                                            "confidence": 0.95
                                                          }
```

## Environment Variables

Add to `.env` file:

```bash
# Backend URL for pipeline logging
REACT_APP_BACKEND_URL=http://localhost:8080
```

## Troubleshooting

### Stage 6 not appearing in logs

**Check 1:** Is the web app sending logs?
```javascript
// Add to browser console
console.log('Pipeline logger loaded:', typeof logUIReceivedDebounced);
```

**Check 2:** Is the backend receiving logs?
```bash
# Check backend logs
grep "6️⃣ UI_RECEIVED" lma-websocket-transcriber-stack/source/app/debug-logs/*.txt
```

**Check 3:** Is Supabase Realtime working?
```javascript
// In browser console
supabase.channel('test').subscribe((status) => {
  console.log('Realtime status:', status);
});
```

### CORS errors

Add to backend CORS configuration:
```typescript
fastify.register(require('@fastify/cors'), {
  origin: ['http://localhost:3000', 'chrome-extension://*'],
  credentials: true
});
```

## Benefits

✅ **Complete visibility** into transcript pipeline  
✅ **Debug latency** from audio to UI display  
✅ **Monitor UI performance** and Realtime delivery  
✅ **Track user engagement** with transcripts  
✅ **Identify bottlenecks** in any pipeline stage

## Next Steps

1. **Add visual indicators** in UI when transcripts arrive
2. **Display pipeline metrics** on admin dashboard
3. **Alert on stage delays** exceeding thresholds
4. **Export pipeline logs** for analysis
