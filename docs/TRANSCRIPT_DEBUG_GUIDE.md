# Transcript Debug Logging Guide

## Mục đích

File này giúp bạn debug realtime transcript flow từ Soniox → Database → UI bằng cách ghi log chi tiết vào file `transcript-{meeting_id}.txt`.

## Flow Logging

### Stage 1-5: Soniox → transcript_events
**File**: `lma-websocket-transcriber-stack/source/app/src/calleventdata/soniox.ts`

1. **Stage 1 - SONIOX_RAW_RESPONSE**: Raw response từ Soniox WebSocket
2. **Stage 2 - FILTERED_TOKENS**: Tokens sau khi filter `is_final`
3. **Stage 3 - SPEAKER_GROUPS**: Nhóm tokens theo speaker
4. **Stage 4 - BEFORE_INSERT_TRANSCRIPT_EVENTS**: Data trước khi insert vào `transcript_events`
5. **Stage 5 - AFTER_INSERT_SUCCESS/ERROR**: Kết quả insert vào `transcript_events`

### Stage 6-9: transcript_events → transcripts
**File**: `supabase/functions/process-transcripts/index.ts`

6. **Stage 6 - FETCHED_TRANSCRIPT_EVENTS**: Events được fetch từ `transcript_events`
7. **Stage 7 - BEFORE_INSERT_TRANSCRIPTS**: Data trước khi insert vào `transcripts`
8. **Stage 8 - INSERT_TRANSCRIPTS_SUCCESS/ERROR**: Kết quả insert vào `transcripts`
9. **Stage 9 - MARKED_AS_PROCESSED**: Đánh dấu events đã xử lý

## Cách sử dụng

### 1. Enable Debug Mode

Thêm vào `.env` hoặc `docker-compose.yml`:

```bash
ENABLE_TRANSCRIPT_DEBUG=true
DEBUG_LOG_DIR=./debug-logs
```

### 2. Restart Services

```bash
# WebSocket Transcriber
cd lma-websocket-transcriber-stack
docker-compose restart

# Supabase Edge Function
supabase functions deploy process-transcripts --env-file .env
```

### 3. Xem Log Realtime

```bash
# Watch log file realtime
tail -f debug-logs/transcript-{meeting_id}.txt

# Hoặc watch tất cả meetings
watch -n 1 'ls -lht debug-logs/*.txt | head -5'
```

### 4. Phân tích Log

**Kiểm tra từng stage:**

```bash
# Stage 1: Soniox có trả transcript không?
grep "STAGE: 1-SONIOX_RAW_RESPONSE" debug-logs/transcript-*.txt

# Stage 4: Data có được chuẩn bị đúng không?
grep "STAGE: 4-BEFORE_INSERT_TRANSCRIPT_EVENTS" debug-logs/transcript-*.txt

# Stage 8: Insert vào transcripts có thành công không?
grep "STAGE: 8-INSERT_TRANSCRIPTS" debug-logs/transcript-*.txt

# Tìm lỗi
grep "ERROR" debug-logs/transcript-*.txt
```

## Troubleshooting Common Issues

### Issue 1: Không có log file được tạo
- Kiểm tra `ENABLE_TRANSCRIPT_DEBUG=true`
- Kiểm tra quyền write của thư mục `DEBUG_LOG_DIR`
- Restart service sau khi thay đổi env

### Issue 2: Có Stage 1-5 nhưng không có Stage 6-9
- **Nguyên nhân**: Edge function `process-transcripts` không chạy hoặc không đọc được `transcript_events`
- **Giải pháp**:
  ```bash
  # Check edge function logs
  supabase functions logs process-transcripts
  
  # Manually trigger function
  curl -X POST https://your-project.supabase.co/functions/v1/process-transcripts \
    -H "Authorization: Bearer YOUR_ANON_KEY"
  ```

### Issue 3: Có Stage 6-9 nhưng UI không hiển thị
- **Nguyên nhân**: RLS policies hoặc realtime subscription issue
- **Giải pháp**:
  ```sql
  -- Check RLS policies
  SELECT * FROM transcripts WHERE meeting_id = 'YOUR_MEETING_ID';
  
  -- Check realtime subscription
  SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
  ```

### Issue 4: Stage 5 hoặc 8 có ERROR
- **23505**: Duplicate key (bình thường, có thể ignore)
- **42501**: Permission denied → Check RLS policies
- **Other errors**: Xem chi tiết trong log để debug

## Log Format

Mỗi log entry có format:

```
================================================================================
[2025-01-23T10:30:45.123Z] STAGE: 4-BEFORE_INSERT_TRANSCRIPT_EVENTS
--------------------------------------------------------------------------------
{
  "speaker_number": "1",
  "speaker_name": "John Doe",
  "transcript_data": {
    "meeting_id": "test-meeting-123",
    "transcript": "Hello everyone",
    "speaker_number": "1",
    "start_time": 1000,
    "end_time": 2500
  }
}
```

## Performance Notes

- Debug logging có overhead nhỏ (~5-10ms per event)
- Chỉ enable khi cần debug
- Log files có thể lớn nhanh với meeting dài
- Tự động cleanup log cũ:

```bash
# Add to crontab
0 0 * * * find /path/to/debug-logs -name "transcript-*.txt" -mtime +7 -delete
```

## Disable Debug Mode

Khi đã xong debug:

```bash
ENABLE_TRANSCRIPT_DEBUG=false
```

Hoặc comment out trong `.env`:

```bash
# ENABLE_TRANSCRIPT_DEBUG=true
```

Restart services để áp dụng.
