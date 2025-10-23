# Pipeline Troubleshooting Guide

## Vấn đề: Transcript không hiển thị trên UI

Pipeline có 6 stages:

```
1️⃣ AUDIO_RECEIVED       → Browser → Backend WebSocket
2️⃣ STT_PROCESSING        → Soniox API transcription
3️⃣ DB_INSERT             → Save to transcript_events (staging)
4️⃣ EDGE_FUNCTION         → Process → transcripts (final)
5️⃣ REALTIME_BROADCAST    → Supabase Realtime
6️⃣ UI_DISPLAY            → React UI renders
```

**Triệu chứng**: Stages 1-3 hoạt động nhưng không thấy 4-6 trong pipeline log.

**Nguyên nhân**: Edge Function chưa chạy hoặc bị lỗi.

---

## Bước 1: Chạy Diagnostic

```bash
cd scripts
npx ts-node diagnose-pipeline.ts
```

Script này sẽ kiểm tra:
- ✅ Có data trong `transcript_events`?
- ⚠️ Có events bị stuck (processed=false)?
- ✅ Có data trong `transcripts` (final)?
- ✅ Supabase Realtime có hoạt động?

**Output mẫu:**

```
╔═══════════════════════════════════════════════════════════════╗
║                     DIAGNOSTIC RESULTS                        ║
╚═══════════════════════════════════════════════════════════════╝

3️⃣ transcript_events      ✅ OK
   Count: 10
   Details: { "unprocessed": 10, "processed": 0 }

4️⃣ Edge Function          ⚠️  WARNING
   Count: 10
   🔧 Fix: Run: supabase functions invoke process-transcripts

5️⃣ transcripts            ⚠️  WARNING
   Count: 0
   🔧 Fix: Edge Function not processing

6️⃣ Supabase Realtime      ✅ OK
```

---

## Bước 2: Fix - Trigger Edge Function thủ công

Nếu có **stuck events** (processed=false):

```bash
cd scripts
npx ts-node trigger-edge-function.ts
```

**Output mẫu:**

```
🚀 Triggering Edge Function: process-transcripts

✅ Edge Function executed successfully!
   Processed: 10 events

📊 After processing:
   Remaining unprocessed: 0
   Total transcripts: 10
```

---

## Bước 3: Setup tự động - Deploy Edge Function

### 3.1. Deploy Edge Function lên Supabase

```bash
# Login to Supabase
npx supabase login

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_ID

# Deploy edge function
npx supabase functions deploy process-transcripts
```

### 3.2. Setup pg_cron để auto-run mỗi 5s

```bash
# Apply migration
npx supabase db push
```

Hoặc chạy SQL thủ công trong Supabase Dashboard → SQL Editor:

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job every 5 seconds
SELECT cron.schedule(
  'process-transcripts-job',
  '*/5 * * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/process-transcripts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Verify job scheduled
SELECT * FROM cron.job;
```

---

## Bước 4: Verify hoạt động

### 4.1. Start a meeting và nói thử

```bash
# Terminal 1: Run backend
cd lma-websocket-transcriber-stack/source/app
npm start

# Terminal 2: Monitor pipeline log
tail -f debug-logs/pipeline-*.txt

# Terminal 3: Monitor edge function log
tail -f debug-logs/transcript-*.txt
```

### 4.2. Kiểm tra database

```bash
# Check staging (should have processed=false initially)
npx supabase db query "SELECT * FROM transcript_events ORDER BY timestamp DESC LIMIT 5;"

# Wait 5 seconds for edge function to run

# Check final (should have data now)
npx supabase db query "SELECT * FROM transcripts ORDER BY created_at DESC LIMIT 5;"
```

### 4.3. Kiểm tra UI

Mở UI và xem transcript có hiển thị real-time không:
- http://localhost:3000 (hoặc URL của UI)
- Transcript phải xuất hiện sau **~5-10 giây**

---

## Common Issues

### Issue 1: Edge Function không deployed

**Triệu chứng:**
```
❌ Error: 404 Not Found
```

**Fix:**
```bash
npx supabase functions deploy process-transcripts
```

---

### Issue 2: pg_cron không chạy

**Triệu chứng:** Data stuck ở `transcript_events` mãi không move sang `transcripts`.

**Check:**
```sql
-- Xem scheduled jobs
SELECT * FROM cron.job;

-- Xem job history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

**Fix:**
```sql
-- Unschedule old job
SELECT cron.unschedule('process-transcripts-job');

-- Reschedule
SELECT cron.schedule('process-transcripts-job', '*/5 * * * * *', $$...$$);
```

---

### Issue 3: Supabase Realtime không broadcast

**Triệu chứng:** Data có trong database nhưng UI không update.

**Check:**
1. Vào Supabase Dashboard → Database → Replication
2. Verify `transcripts` table có enable Realtime

**Fix:**
```sql
-- Enable Realtime for transcripts table
ALTER PUBLICATION supabase_realtime ADD TABLE transcripts;
```

---

### Issue 4: RLS Policy chặn insert

**Triệu chứng:**
```
Error: new row violates row-level security policy
```

**Fix:**
```sql
-- Temporarily disable RLS for testing
ALTER TABLE transcript_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts DISABLE ROW LEVEL SECURITY;

-- Or create proper policy
CREATE POLICY "Service role can insert"
ON transcripts FOR INSERT
TO service_role
USING (true);
```

---

## Performance Tuning

### Giảm latency từ 5s → 2s

Thay đổi pg_cron schedule:

```sql
-- Every 2 seconds instead of 5
SELECT cron.unschedule('process-transcripts-job');
SELECT cron.schedule('process-transcripts-job', '*/2 * * * * *', $$...$$);
```

### Tăng batch size từ 200 → 500

Sửa `supabase/functions/process-transcripts/index.ts`:

```typescript
.limit(500)  // Thay vì 200
```

---

## Monitoring Commands

```bash
# 1. Watch pipeline logs real-time
tail -f debug-logs/pipeline-*.txt

# 2. Watch edge function logs
tail -f debug-logs/transcript-*.txt

# 3. Count stuck events
npx supabase db query "SELECT COUNT(*) FROM transcript_events WHERE processed = false;"

# 4. Count final transcripts
npx supabase db query "SELECT COUNT(*) FROM transcripts;"

# 5. View latest transcripts
npx supabase db query "SELECT meeting_id, transcript, created_at FROM transcripts ORDER BY created_at DESC LIMIT 5;"
```

---

## Kết luận

Pipeline log **chỉ capture được stages 1-3** (backend server).

Stages 4-6 chạy ngoài backend:
- **Stage 4**: Edge Function (Deno runtime) → Check `transcript-*.txt`
- **Stage 5**: Supabase Realtime (internal) → Check Supabase Dashboard
- **Stage 6**: React UI (client-side) → Check browser console

**Để verify toàn bộ pipeline hoạt động:**
1. Run `diagnose-pipeline.ts` → Xác nhận data flow
2. Run `trigger-edge-function.ts` → Test thủ công
3. Deploy edge function + setup pg_cron → Tự động hóa
4. Monitor logs + database → Verify real-time
