# Call Event Data Module - Migration Notes

## Overview

This directory contains the event handling and transcription integration modules for the WebSocket server.

## Files

### Active Files (Soniox + Supabase Stack)

**`soniox.ts`** (NEW - 194 lines)
- **Purpose:** Soniox real-time transcription integration
- **Functions:**
  - `startSonioxTranscription()` - Main Soniox WebSocket connection
  - `writeMeetingStartEvent()` - Create meeting record in Supabase
  - `writeMeetingEndEvent()` - Update meeting status
  - `mapSpeakerToChannel()` - Backward compatibility helper

**Features:**
- ✅ Speaker diarization (3-10+ speakers)
- ✅ Real-time streaming transcription
- ✅ Multi-language support
- ✅ Duplicate prevention
- ✅ Error handling and retry logic

**`eventtypes.ts`** (UPDATED)
- **Purpose:** TypeScript type definitions for call events
- **Changes:**
  - Removed AWS Transcribe imports
  - Added WebSocket import for Soniox
  - Added `sonioxWs?: WebSocket` to `SocketCallData`
  - Changed AWS-specific types to `any` for backward compatibility

**`index.ts`** (if exists - barrel export)
- Exports all event types and functions

### Deprecated Files (AWS Stack)

**`transcribe.ts`** (DEPRECATED - kept for reference)
- **Old Purpose:** AWS Transcribe integration
- **Status:** No longer used, replaced by `soniox.ts`
- **Kept because:** May contain business logic that needs to be referenced
- **Do not import or use in new code**

## Migration Changes

### Before (AWS Transcribe)

```typescript
import {
    startTranscribe,
    writeCallStartEvent,
    writeCallEndEvent,
} from './calleventdata';

// Start transcription
await writeCallStartEvent(callMetaData, server);
await startTranscribe(socketCallMap, server);

// End call
await writeCallEndEvent(callMetaData, server);
```

### After (Soniox)

```typescript
import {
    startSonioxTranscription,
    writeMeetingStartEvent,
    writeMeetingEndEvent,
} from './calleventdata/soniox';

// Start transcription
await writeMeetingStartEvent(callMetaData, server);
await startSonioxTranscription(socketCallMap, server);

// End call
await writeMeetingEndEvent(callMetaData, server);
```

## Key Differences

### Speaker Detection

**AWS Transcribe (Old):**
- Channel-based separation
- 2 channels: CALLER (ch_0) and AGENT (ch_1)
- 100% accuracy (hardware-based)
- Requires dual-channel stereo audio

**Soniox (New):**
- AI-based speaker diarization
- Unlimited speakers (practical limit: 10+)
- 90-95% accuracy (AI-based)
- Works with mono merged audio
- Speaker numbers: "1", "2", "3", etc.

### Data Flow

**AWS Transcribe (Old):**
```
startTranscribe()
  ↓
AWS Transcribe Streaming API
  ↓
Kinesis Data Streams
  ↓
Lambda (async processing)
  ↓
DynamoDB
```

**Soniox (New):**
```
startSonioxTranscription()
  ↓
Soniox WebSocket API
  ↓
Supabase PostgreSQL (transcript_events)
  ↓
Edge Function (async processing)
  ↓
Supabase PostgreSQL (transcripts)
```

## Environment Variables

### Removed (AWS)
```bash
AWS_REGION
KINESIS_STREAM_NAME
TRANSCRIBE_API_MODE
TRANSCRIBE_LANGUAGE_CODE
TRANSCRIBE_LANGUAGE_OPTIONS
CUSTOM_VOCABULARY_NAME
IS_CONTENT_REDACTION_ENABLED
CONTENT_REDACTION_TYPE
TRANSCRIBE_PII_ENTITY_TYPES
```

### Added (Soniox)
```bash
SONIOX_API_KEY=your-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

## Usage Examples

### Starting a Meeting

```typescript
const callMetaData: CallMetaData = {
    callId: uuid(),
    agentId: 'user123',
    samplingRate: 16000,
    callEvent: 'START',
    activeSpeaker: 'John Doe',
    channels: {}
};

// Create meeting record in Supabase
await writeMeetingStartEvent(callMetaData, server);

// Start Soniox transcription
await startSonioxTranscription(socketCallData, server);
```

### Ending a Meeting

```typescript
// Update meeting status in Supabase
await writeMeetingEndEvent(callMetaData, server);

// Close Soniox WebSocket
if (socketCallData.sonioxWs) {
    socketCallData.sonioxWs.close();
}
```

### Speaker Detection

Soniox automatically detects speakers and assigns numbers:

```javascript
// Soniox response example
{
  "tokens": [
    {"text": "Hello", "speaker": "1", "is_final": true},
    {"text": "Hi there", "speaker": "2", "is_final": true},
    {"text": "How are you?", "speaker": "1", "is_final": true}
  ]
}
```

The `soniox.ts` module groups these by speaker and saves to database:

```typescript
// Saved to Supabase
{
  meeting_id: "abc-123",
  transcript: "Hello",
  speaker_number: "1",
  speaker_name: null, // User can assign later
  channel: "AGENT",    // Backward compatibility
  start_time: 100,
  end_time: 500,
  is_final: true
}
```

## Error Handling

### Duplicate Prevention

The module handles duplicates at two levels:

1. **Database UNIQUE constraint:**
   ```sql
   UNIQUE(meeting_id, start_time, end_time)
   ```

2. **Code-level handling:**
   ```typescript
   try {
       await insertTranscriptEvent(data);
   } catch (error: any) {
       if (error.code !== '23505') { // Ignore duplicates
           throw error;
       }
   }
   ```

### Connection Errors

Soniox WebSocket errors are logged but don't crash the server:

```typescript
sonioxWs.on('error', (error) => {
    server.log.error(`[SONIOX]: WebSocket error: ${error}`);
    // Server continues running
});
```

## Testing

### Unit Tests (To Be Implemented)

```typescript
// Future: test/soniox.test.ts
describe('Soniox Integration', () => {
    it('should connect to Soniox WebSocket');
    it('should group tokens by speaker');
    it('should handle duplicate transcripts');
    it('should map speaker numbers to channels');
});
```

### Integration Tests (To Be Implemented)

```typescript
// Future: test/integration/transcription.test.ts
describe('End-to-End Transcription', () => {
    it('should stream audio and save transcripts');
    it('should detect multiple speakers');
    it('should save to Supabase correctly');
});
```

## Performance

### Latency Breakdown

| Stage | Time |
|-------|------|
| Browser → Server | 10-50ms |
| Server → Soniox | 50-100ms |
| Soniox Processing | 500-1500ms |
| Save to Supabase | 10-50ms |
| **Total** | **~0.6-1.7s** |

### Throughput

- Soniox: Unlimited concurrent streams (per pricing tier)
- Supabase: 1000+ writes/second (standard tier)
- Edge Function: 200 events per batch, every 5 seconds = 2400 events/minute

## Debugging

### Enable Debug Logging

```bash
WS_LOG_LEVEL=debug npm start
```

### Check Soniox Connection

```typescript
// Look for in logs:
[SONIOX]: [meeting-id] - Connected to Soniox API
[SONIOX]: [meeting-id] - Saved transcript for speaker 1
```

### Check Supabase Writes

```typescript
// Look for in logs:
[SONIOX]: [meeting-id] - Saved transcript for speaker 1
```

Or check Supabase Dashboard → Table Editor → transcript_events

## Maintenance

### Updating Soniox Model

To use a newer Soniox model, update `soniox.ts`:

```typescript
const startRequest = {
    // ...
    model: 'stt-rt-preview-v3', // Update version here
    // ...
};
```

### Adding Language Support

Update language hints in `soniox.ts`:

```typescript
const startRequest = {
    // ...
    language_hints: ['en', 'vi', 'es', 'fr'], // Add more languages
    // ...
};
```

## References

- Soniox API Docs: https://docs.soniox.com
- Supabase Docs: https://supabase.com/docs
- Migration Guide: `/MIGRATION_GUIDE.md`
- Implementation Summary: `/IMPLEMENTATION_SUMMARY.md`

