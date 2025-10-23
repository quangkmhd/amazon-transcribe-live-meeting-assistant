# Testing Checklist - AWS to Soniox + Supabase Migration

## Pre-Testing Setup

### 1. Environment Configuration

- [ ] Supabase project created and running
- [ ] Database schema applied: `supabase db push`
- [ ] Edge Function deployed: `supabase functions deploy process-transcripts`
- [ ] Environment variables set in `.env`:
  ```bash
  SUPABASE_URL=...
  SUPABASE_SERVICE_KEY=...
  SONIOX_API_KEY=...
  SHOULD_RECORD_CALL=true
  ```
- [ ] Dependencies installed: `npm install`
- [ ] WebSocket server builds: `npm run build`

### 2. Verification Tools

- [ ] Supabase Dashboard accessible
- [ ] PostgreSQL client ready (psql or TablePlus)
- [ ] Browser DevTools open (Network + Console tabs)
- [ ] Test audio file prepared (16kHz, mono, WAV format)

---

## Phase 1: Unit Tests

### Run Automated Tests

```bash
cd lma-websocket-transcriber-stack/source/app
npm test
```

**Expected Results:**
- [ ] All Supabase client tests pass (5/5)
- [ ] All Soniox integration tests pass (7/7)
- [ ] No test failures or errors
- [ ] Coverage > 80% (run `npm run test:coverage`)

**If tests fail:**
1. Check error messages in console
2. Verify mock setup in test files
3. Ensure dependencies installed
4. Run `npm run test:watch` for debugging

---

## Phase 2: WebSocket Server Tests

### 2.1 Server Startup

```bash
cd lma-websocket-transcriber-stack/source/app
npm start
```

**Checklist:**
- [ ] Server starts without errors
- [ ] Logs show: `Server listening at http://0.0.0.0:8080`
- [ ] No Supabase connection errors
- [ ] No Soniox API key errors

**Common Issues:**
- Missing env vars → Check `.env` file
- Port already in use → Kill process or change port
- Supabase connection fail → Verify URL and key

### 2.2 Health Check Endpoint

```bash
curl http://localhost:8080/health/check
```

**Expected Response:**
```json
{
  "Http-Status": 200,
  "Healthy": true
}
```

- [ ] Returns HTTP 200
- [ ] `Healthy: true` in response
- [ ] CPU usage percentage logged

### 2.3 WebSocket Connection Test

Use browser console or `wscat`:

```bash
npm install -g wscat
wscat -c ws://localhost:8080/api/v1/ws
```

**Checklist:**
- [ ] Connection successful
- [ ] Server logs: `[NEW CONNECTION]`
- [ ] No authentication errors (if auth disabled for testing)
- [ ] Can send/receive messages

---

## Phase 3: Meeting Flow Tests

### 3.1 Start Meeting

**Action:** Send START event via WebSocket

```json
{
  "callId": "test-meeting-001",
  "agentId": "test-agent-1",
  "samplingRate": 16000,
  "callEvent": "START",
  "activeSpeaker": "John Doe",
  "channels": {}
}
```

**Verification:**

1. **Server Logs:**
   - [ ] `[MEETING]: [test-meeting-001] - Meeting started`
   - [ ] `[SONIOX]: [test-meeting-001] - Connected to Soniox API`

2. **Supabase Dashboard → Table Editor → meetings:**
   - [ ] New row appears
   - [ ] `meeting_id = "test-meeting-001"`
   - [ ] `status = "started"`
   - [ ] `agent_id = "test-agent-1"`
   - [ ] `started_at` timestamp is recent

3. **SQL Verification:**
   ```sql
   SELECT * FROM meetings WHERE meeting_id = 'test-meeting-001';
   ```
   - [ ] Returns 1 row
   - [ ] All fields populated correctly

### 3.2 Stream Audio

**Action:** Send binary audio chunks via WebSocket

Use test audio file or generate PCM data:

```javascript
// Example: Generate 1 second of silence (16kHz, mono, 16-bit)
const sampleRate = 16000;
const duration = 1; // seconds
const buffer = Buffer.alloc(sampleRate * duration * 2); // 2 bytes per sample
ws.send(buffer);
```

**Verification:**

1. **Server Logs:**
   - [ ] No `[ON BINARY MESSAGE]` errors
   - [ ] Audio forwarded to Soniox
   - [ ] Soniox returns transcript tokens

2. **Supabase Dashboard → Table Editor → transcript_events:**
   - [ ] Rows appear in real-time
   - [ ] `meeting_id` matches
   - [ ] `transcript` contains text
   - [ ] `is_final = true` for complete phrases
   - [ ] `processed = false` initially

3. **SQL Verification:**
   ```sql
   SELECT COUNT(*) FROM transcript_events 
   WHERE meeting_id = 'test-meeting-001';
   ```
   - [ ] Count > 0
   - [ ] Increases as more audio is streamed

### 3.3 Speaker Detection

**Action:** Stream audio with multiple speakers OR use test file

**Verification:**

1. **Server Logs:**
   - [ ] `[SONIOX]: ... - Saved transcript for speaker 1`
   - [ ] `[SONIOX]: ... - Saved transcript for speaker 2`
   - [ ] Different speakers detected

2. **Supabase Dashboard → transcript_events:**
   - [ ] `speaker_number` varies (1, 2, 3, etc.)
   - [ ] Same speaker's utterances grouped
   - [ ] Different speakers have different timestamps

3. **SQL Verification:**
   ```sql
   SELECT DISTINCT speaker_number 
   FROM transcript_events 
   WHERE meeting_id = 'test-meeting-001';
   ```
   - [ ] Returns multiple speaker numbers (if multi-speaker audio)

### 3.4 End Meeting

**Action:** Send END event

```json
{
  "callId": "test-meeting-001",
  "callEvent": "END",
  "shouldRecordCall": true
}
```

**Verification:**

1. **Server Logs:**
   - [ ] `[MEETING]: [test-meeting-001] - Meeting ended`
   - [ ] `[SONIOX]: [test-meeting-001] - Connection closed`
   - [ ] Recording upload logs (if enabled)

2. **Supabase Dashboard → meetings:**
   - [ ] `status = "ended"`
   - [ ] `ended_at` timestamp updated
   - [ ] `recording_url` populated (if recording enabled)

3. **Supabase Dashboard → Storage → meeting-recordings:**
   - [ ] WAV file uploaded
   - [ ] File name = `test-meeting-001.wav`
   - [ ] File size > 0 bytes
   - [ ] Can download and play audio

4. **SQL Verification:**
   ```sql
   SELECT status, ended_at, recording_url, recording_size 
   FROM meetings 
   WHERE meeting_id = 'test-meeting-001';
   ```
   - [ ] `status = 'ended'`
   - [ ] `recording_url` is valid URL
   - [ ] `recording_size` > 0

### 3.5 Recording Playback

**Action:** Copy `recording_url` from database and open in browser

**Verification:**
- [ ] Recording URL accessible (HTTP 200)
- [ ] Audio plays in browser
- [ ] Duration matches meeting length
- [ ] Audio quality is good (16kHz)
- [ ] No corruption or static

---

## Phase 4: Edge Function Tests

### 4.1 Manual Trigger

```bash
curl -X POST https://[your-project].supabase.co/functions/v1/process-transcripts \
  -H "Authorization: Bearer YOUR_SERVICE_KEY"
```

**Verification:**

1. **Response:**
   ```json
   { "processed": 5 }
   ```
   - [ ] Returns 200 OK
   - [ ] `processed` count > 0

2. **Supabase Dashboard → transcript_events:**
   - [ ] `processed = true` for processed events

3. **Supabase Dashboard → transcripts:**
   - [ ] New rows appear
   - [ ] Data matches transcript_events
   - [ ] `is_partial = false`

### 4.2 Auto Trigger (pg_cron)

**Setup:** Run SQL to create cron job (see MIGRATION_GUIDE.md)

**Verification:**
- [ ] Cron job created successfully
- [ ] Edge Function logs show automatic executions
- [ ] Transcripts processed every 5 seconds
- [ ] No errors in Edge Function logs

---

## Phase 5: UI Tests

### 5.1 UI Server Startup

```bash
cd lma-ai-stack/source/ui
npm install
npm start
```

**Checklist:**
- [ ] React dev server starts
- [ ] No build errors
- [ ] Browser opens to localhost:3000
- [ ] No console errors

### 5.2 Meeting List

**Action:** Navigate to meetings list page

**Verification:**
- [ ] Meetings load from Supabase
- [ ] Test meeting appears in list
- [ ] Status shows correctly (started/ended)
- [ ] Timestamps display properly
- [ ] Click meeting → Opens details page

### 5.3 Meeting Details

**Action:** Open test meeting details

**Verification:**
- [ ] Transcripts load from Supabase
- [ ] Transcripts display in chronological order
- [ ] Speaker names/numbers show
- [ ] Timestamps show for each segment
- [ ] Recording player visible (if recording exists)
- [ ] Can play recording

### 5.4 Real-time Updates

**Action:** Start a new meeting in one browser tab, open details in another tab

**Verification:**
- [ ] New transcripts appear in real-time (without refresh)
- [ ] UI updates as Soniox sends transcripts
- [ ] No lag > 2 seconds
- [ ] No console errors
- [ ] WebSocket subscription active

---

## Phase 6: Stress Tests

### 6.1 Concurrent Meetings

**Action:** Start 5+ meetings simultaneously

**Verification:**
- [ ] All meetings start successfully
- [ ] No server crashes
- [ ] All transcripts saved correctly
- [ ] No data mixing between meetings
- [ ] Supabase connections stable

### 6.2 Long Meeting

**Action:** Run meeting for 30+ minutes

**Verification:**
- [ ] Server stable throughout
- [ ] Memory usage doesn't grow excessively
- [ ] Transcript count grows linearly
- [ ] Recording file size reasonable
- [ ] Can end meeting successfully

### 6.3 High Audio Volume

**Action:** Stream large amounts of audio quickly

**Verification:**
- [ ] No buffer overflows
- [ ] Soniox keeps up
- [ ] Database writes succeed
- [ ] No dropped transcripts
- [ ] Server remains responsive

---

## Phase 7: Error Handling Tests

### 7.1 Duplicate Transcripts

**Action:** Send same audio segment twice

**Verification:**
- [ ] Server logs show duplicate prevention
- [ ] Only one transcript saved
- [ ] No 500 errors
- [ ] Error code 23505 handled gracefully

### 7.2 Invalid Data

**Action:** Send malformed JSON, invalid meeting ID, etc.

**Verification:**
- [ ] Server doesn't crash
- [ ] Error logged appropriately
- [ ] Client receives error response
- [ ] Database remains consistent

### 7.3 Network Interruption

**Action:** Disconnect network during meeting

**Verification:**
- [ ] Soniox WebSocket closes gracefully
- [ ] Meeting status updates correctly
- [ ] Partial data saved
- [ ] Reconnection possible
- [ ] No data loss

---

## Phase 8: Migration Validation

### 8.1 Data Migration Scripts

```bash
cd scripts
npm install
npm run migrate:dynamodb
npm run migrate:s3
```

**Verification:**
- [ ] Migration completes without errors
- [ ] Progress logs show success
- [ ] No data lost
- [ ] Record count matches source

### 8.2 Data Integrity

**SQL Checks:**

```sql
-- Count meetings
SELECT COUNT(*) FROM meetings;

-- Count transcripts
SELECT COUNT(*) FROM transcripts;

-- Check for orphaned transcripts
SELECT COUNT(*) FROM transcripts t
LEFT JOIN meetings m ON t.meeting_id = m.meeting_id
WHERE m.meeting_id IS NULL;

-- Verify recording URLs
SELECT COUNT(*) FROM meetings WHERE recording_url IS NOT NULL;
```

**Verification:**
- [ ] Meeting count matches DynamoDB
- [ ] No orphaned transcripts
- [ ] All recordings accessible
- [ ] No NULL values in required fields

### 8.3 Spot Check Comparisons

**Action:** Compare 10 random meetings between DynamoDB and Supabase

**Verification:**
- [ ] Transcript text matches
- [ ] Timestamps match
- [ ] Speaker data preserved
- [ ] Metadata correct (owner, status, etc.)
- [ ] Recordings accessible

---

## Summary Checklist

### Must Pass Before Production

- [ ] All unit tests pass (100%)
- [ ] Integration tests pass
- [ ] Meeting flow works end-to-end
- [ ] Real-time updates functional
- [ ] Recording upload/playback works
- [ ] Edge Function processes transcripts
- [ ] UI loads and displays data correctly
- [ ] No data loss or corruption
- [ ] Error handling robust
- [ ] Migration scripts tested successfully

### Performance Benchmarks

- [ ] Transcript latency < 2 seconds
- [ ] Meeting start/end < 1 second
- [ ] Recording upload < 30 seconds
- [ ] UI load time < 3 seconds
- [ ] Real-time update lag < 1 second
- [ ] Concurrent meetings > 10 supported

### Security Checks

- [ ] Environment variables not exposed
- [ ] Supabase RLS policies active
- [ ] API keys secured
- [ ] Recording URLs authenticated
- [ ] No SQL injection vulnerabilities

---

## Issues Log

### Template for Recording Issues

```markdown
**Issue #:** [auto-increment]
**Date:** [YYYY-MM-DD]
**Phase:** [which test phase]
**Severity:** [Critical / High / Medium / Low]
**Description:** [what went wrong]
**Steps to Reproduce:** [detailed steps]
**Expected:** [what should happen]
**Actual:** [what actually happened]
**Resolution:** [how it was fixed]
**Status:** [Open / In Progress / Resolved / Deferred]
```

---

## Test Results Summary

**Date:** __________
**Tester:** __________
**Environment:** [Dev / Staging / Production]

| Category | Tests | Passed | Failed | Skipped |
|----------|-------|--------|--------|---------|
| Unit Tests | 12 | | | |
| Integration Tests | 4 | | | |
| Manual Tests | 35 | | | |
| Performance Tests | 6 | | | |
| **Total** | **57** | | | |

**Overall Status:** [Pass / Fail / Partial]

**Notes:**
_[Add any additional observations or concerns]_

**Signed Off:** __________  
**Date:** __________

