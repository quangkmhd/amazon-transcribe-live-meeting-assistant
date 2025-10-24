# Stage 6 (UI_RECEIVED) Fix - Channel Subscription Mismatch

## Problem Summary

Transcripts were successfully processed through stages 1-5 but **Stage 6 (UI_RECEIVED) never triggered** because the Web UI was subscribing to the wrong Realtime channel.

## Root Cause

**Channel Name Mismatch:**
- Backend broadcasts: `transcripts:{callId}` (with colon)
- Browser extension subscribes: `transcripts:{callId}` ✅ Correct
- **Web UI subscribed to: `transcripts-{callId}` (with dash)** ❌ Wrong

### Evidence

**Backend (Edge Function)** - `/supabase/functions/process-transcripts/index.ts:163`
```typescript
await sendPipelineLog(supabase, meetingId, ownerEmail, '5️⃣ REALTIME_BROADCAST', {
    broadcastCount: meetingEventCount,
    channel: `transcripts:${meetingId}`,  // ← Uses COLON
    event: 'INSERT',
});
```

**Browser Extension (Correct)** - `/lma-browser-extension-stack/src/hooks/useTranscriptSubscription.ts:56`
```typescript
channel = supabase
  .channel(`transcripts:${callId}`)  // ← Uses COLON ✅
```

**Web UI (WRONG - Before Fix)** - `/lma-ai-stack/source/ui/src/hooks/use-calls-supabase-api.js:282`
```javascript
const channel = supabase
  .channel(`transcripts-${liveTranscriptCallId}`)  // ← Used DASH ❌
```

## Fix Applied

Changed line 282 in `use-calls-supabase-api.js`:

```diff
- .channel(`transcripts-${liveTranscriptCallId}`)
+ .channel(`transcripts:${liveTranscriptCallId}`)
```

## Files Modified

1. `/lma-ai-stack/source/ui/src/hooks/use-calls-supabase-api.js` - Line 282
2. Rebuilt UI: `/lma-ai-stack/source/ui/build/`

## Verification Steps

### 1. Source Code Verification ✅
```bash
cd lma-ai-stack/source/ui/src/hooks
grep "channel.*transcripts" use-calls-supabase-api.js
# Result: .channel(`transcripts:${liveTranscriptCallId}`)  ✅
```

### 2. Built Code Verification ✅
```bash
cd lma-ai-stack/source/ui/build/static/js
grep -o "transcripts[:-]" main.*.js
# Result: transcripts:  ✅
```

### 3. Live Testing (Required)

**Test Procedure:**
1. Start the Web UI: `cd lma-ai-stack/source/ui && npm start`
2. Open browser at `http://localhost:3000`
3. Start or join a meeting
4. Send audio and wait for transcripts
5. Verify Stage 6 logs appear

**Expected Results:**
- UI receives realtime transcript updates
- `sendTranscriptACK()` is called (check browser console)
- Stage 6 logs appear in pipeline debug files
- Stage 6 logs appear in `pipeline_logs` table

**Check Stage 6 Logs:**
```bash
# Check database
psql "$SUPABASE_DB_URL" -c "
SELECT COUNT(*) FROM pipeline_logs 
WHERE call_id = 'YOUR_MEETING_ID' 
AND stage = '6️⃣ UI_RECEIVED'
"

# Check debug file
grep "6️⃣ UI_RECEIVED" \
  lma-websocket-transcriber-stack/source/app/debug-logs/pipeline-*YOUR_MEETING_ID*.txt
```

## Related Components

### Subscription Flow
1. **Backend Broadcast** (Edge Function)
   - Inserts to `transcripts` table
   - Triggers Supabase Realtime broadcast on channel `transcripts:{meetingId}`

2. **Frontend Subscription** (Web UI)
   - Subscribes to `transcripts:{meetingId}` ✅ Now Fixed
   - Receives INSERT events via `postgres_changes`
   - Filters by `meeting_id=eq.{meetingId}`

3. **ACK Mechanism** (Web UI)
   - When transcript received, calls `sendTranscriptACK()`
   - Sends POST to `/api/v1/pipeline-log` with Stage 6 data
   - Backend logs to `pipeline_logs` table and debug files

### Stage 6 ACK Code

**Location:** `use-calls-supabase-api.js:166-192`

```javascript
const sendTranscriptACK = async (callId, transcriptSegment) => {
  try {
    const backendUrl = process.env.REACT_APP_WS_SERVER_URL || 'ws://localhost:8080/api/v1/ws';
    const httpUrl = backendUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace('/api/v1/ws', '');

    await fetch(`${httpUrl}/api/v1/pipeline-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        stage: '6️⃣ UI_RECEIVED',
        speaker: transcriptSegment.speaker || 'Unknown',
        transcript: transcriptSegment.transcript || '',
        metadata: {
          segmentId: transcriptSegment.segmentId,
          isPartial: transcriptSegment.isPartial,
          channel: transcriptSegment.channel,
          receivedAt: new Date().toISOString(),
        },
      }),
    });
    logger.debug('✅ Sent transcript ACK to backend:', transcriptSegment.segmentId);
  } catch (error) {
    logger.debug('⚠️  Failed to send transcript ACK:', error.message);
  }
};
```

## Impact

### Before Fix
- ❌ Web UI did not receive realtime transcript updates
- ❌ Stage 6 (UI_RECEIVED) never logged
- ❌ Pipeline debug showed incomplete flow (stages 1-5 only)

### After Fix
- ✅ Web UI receives realtime transcript updates
- ✅ Stage 6 (UI_RECEIVED) logged when UI renders transcripts
- ✅ Complete pipeline flow visible in debug logs (stages 1-6)

## Testing Status

- [x] Source code fix verified
- [x] Build includes fix
- [ ] **Live test required** - Start new meeting and verify Stage 6 logs

## Next Steps

1. **Deploy the fixed UI build** to production/staging
2. **Conduct live test** with real audio streaming
3. **Verify Stage 6 logs** appear in:
   - `pipeline_logs` table
   - Pipeline debug files
   - Browser console (ACK sent messages)
4. **Monitor** for any subscription errors in browser console

## Notes

- The Browser Extension already had the correct channel format (`transcripts:`)
- Only the Web UI had the mismatch
- The fix is minimal (single character change) but critical for observability
- No database migrations required
- No backend changes required

## References

- Previous Session Summary (root of conversation)
- `/docs/PIPELINE_DEBUG_GUIDE.md`
- `/docs/TRANSCRIPT_DEBUG_GUIDE.md`
- `/lma-websocket-transcriber-stack/source/app/src/utils/pipeline-debug-logger.ts`
