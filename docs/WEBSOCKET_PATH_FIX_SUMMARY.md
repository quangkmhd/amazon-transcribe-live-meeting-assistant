# WebSocket Path Fix & Debug Logging Setup

## Problem Identified

**Error:** Frontend WebSocket connection failing with:
```
INFO: closed incoming websocket connection for path with no websocket handler
path: "/?authorization=Bearer%20..."
```

**Root Cause:** Frontend was connecting to `/` instead of `/api/v1/ws`

## Changes Made

### 1. Fixed WebSocket URL in Frontend

**File:** `lma-ai-stack/source/ui/src/hooks/use-parameter-store.js:14`
```javascript
// Before:
WSEndpoint: process.env.REACT_APP_WS_SERVER_URL || 'ws://localhost:8080',

// After:
WSEndpoint: process.env.REACT_APP_WS_SERVER_URL || 'ws://localhost:8080/api/v1/ws',
```

**File:** `lma-ai-stack/source/ui/.env:4`
```bash
# Before:
REACT_APP_WS_SERVER_URL=ws://localhost:8080

# After:
REACT_APP_WS_SERVER_URL=ws://localhost:8080/api/v1/ws
```

### 2. Enabled Debug Logging

**File:** `lma-websocket-transcriber-stack/source/app/.env`
```bash
# Added:
ENABLE_TRANSCRIPT_DEBUG=true
DEBUG_LOG_DIR=./debug-logs
```

**Created Directory:**
```bash
lma-websocket-transcriber-stack/source/app/debug-logs/
```

## Testing Steps

### 1. Restart Services

```bash
# Terminal 1: WebSocket Server
cd lma-websocket-transcriber-stack/source/app
npm run dev

# Terminal 2: UI
cd lma-ai-stack/source/ui
npm start
```

### 2. Verify WebSocket Connection

1. Open browser to `http://localhost:3000`
2. Login with test user
3. Navigate to "Stream Audio" or "New Meeting"
4. Open browser DevTools → Console
5. Look for successful WebSocket connection logs:
   ```
   DEBUG - [timestamp]: Websocket onOpen Event: {...}
   ```

### 3. Test Transcript Flow

1. Click "Start Streaming"
2. Allow screen share + microphone permissions
3. Speak or play audio
4. **Expected Results:**
   - WebSocket connects to `ws://localhost:8080/api/v1/ws` ✅
   - Audio streams successfully
   - Debug log file created: `debug-logs/transcript-{meeting_id}.txt`
   - Transcripts appear in UI

### 4. Verify Debug Logs

```bash
# Check debug logs are created
ls -la lma-websocket-transcriber-stack/source/app/debug-logs/

# View debug log content (replace {meeting_id} with actual ID)
cat lma-websocket-transcriber-stack/source/app/debug-logs/transcript-{meeting_id}.txt
```

**Expected Content:** 9 stages of logging:
- Stage 1-5: Soniox → transcript_events (WebSocket server)
- Stage 6-9: transcript_events → transcripts (Supabase Edge Function)

## Verification Checklist

- [ ] WebSocket server starts without errors
- [ ] UI starts without errors
- [ ] Browser console shows successful WebSocket connection
- [ ] No "path with no websocket handler" error
- [ ] Debug log directory created
- [ ] Debug log file created when streaming starts
- [ ] All 9 debug stages appear in log file
- [ ] Transcripts appear in database
- [ ] Transcripts appear in UI

## Server Routes Reference

| Path | Method | Handler | Description |
|------|--------|---------|-------------|
| `/api/v1/ws` | GET (WebSocket) | ✅ Active | WebSocket connection for audio streaming |
| `/health/check` | GET | ✅ Active | Health check endpoint |
| `/` | GET | ❌ Not defined | No handler (causes error) |

## Troubleshooting

### Issue: Still getting "no websocket handler" error

**Solution:**
1. Clear browser cache
2. Hard reload UI (Ctrl+Shift+R)
3. Verify `.env` files are loaded:
   ```bash
   # Check UI env
   cat lma-ai-stack/source/ui/.env | grep WS_SERVER
   
   # Should show: ws://localhost:8080/api/v1/ws
   ```

### Issue: Debug logs not created

**Solution:**
1. Check environment variables loaded:
   ```bash
   cat lma-websocket-transcriber-stack/source/app/.env | grep DEBUG
   ```
2. Verify directory permissions:
   ```bash
   ls -la lma-websocket-transcriber-stack/source/app/ | grep debug-logs
   ```
3. Check server logs for errors

### Issue: No transcripts in UI

**Solution:**
1. Check debug logs for error messages
2. Verify Supabase connection
3. Check Soniox API key is valid
4. Verify RLS policies allow user access

## Next Steps

Once WebSocket connection is verified:
1. ✅ Test full meeting flow (start → speak → stop → view transcripts)
2. ✅ Verify speaker identification works
3. ✅ Test multi-user isolation (RLS policies)
4. ✅ Verify meeting summaries generation
5. ✅ Test recording features

## References

- Debug Guide: `docs/TRANSCRIPT_DEBUG_GUIDE.md`
- Testing Script: `test-transcript-debug.sh`
- WebSocket Server: `lma-websocket-transcriber-stack/source/app/src/index.ts`
- Soniox Handler: `lma-websocket-transcriber-stack/source/app/src/calleventdata/soniox.ts`
- UI WebSocket Client: `lma-ai-stack/source/ui/src/components/stream-audio/StreamAudio.jsx`
