# Pipeline Debug System - Hướng dẫn sử dụng

## Tổng quan

Hệ thống Pipeline Debug theo dõi toàn bộ quá trình xử lý transcript từ khi nhận audio đến khi hiển thị trên UI, giúp bạn xác định chính xác bước nào gặp lỗi.

## Kiến trúc Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    TRANSCRIPT PIPELINE                      │
└─────────────────────────────────────────────────────────────┘

1️⃣  AUDIO RECEPTION       → Browser gửi PCM audio qua WebSocket
    ├─ Audio Received      (mỗi 100 chunks)
    └─ Audio Buffered      

2️⃣  STT PROCESSING        → Soniox API chuyển đổi audio thành text
    ├─ STT Sent           (gửi audio đến Soniox)
    ├─ STT Partial        (kết quả tạm thời)
    ├─ STT Final          (kết quả cuối cùng + speaker)
    └─ STT Error          (nếu có lỗi)

3️⃣  DATABASE INSERT       → Lưu vào Supabase transcript_events
    ├─ DB Insert Start    (bắt đầu insert)
    ├─ DB Insert Success  (insert thành công + duration)
    └─ DB Insert Error    (nếu có lỗi)

4️⃣  EDGE FUNCTION         → Xử lý batch và chuyển sang transcripts
    ├─ Edge Poll Start
    ├─ Edge Processing
    ├─ Edge Complete
    └─ Edge Error

5️⃣  REALTIME BROADCAST    → Supabase Realtime đẩy đến subscribers

6️⃣  UI DISPLAY            → React UI nhận và render transcript
```

## File debug log được tạo

Mỗi cuộc họp tạo 1 file debug log riêng:

```
debug-logs/
  └─ pipeline-{callId}-{timestamp}.txt
```

**Ví dụ:**
```
debug-logs/pipeline-Meeting-ABC-2025-10-23-18-25-08.txt
```

## Cấu trúc log file

### Header
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPT PIPELINE DEBUG LOG                            │
│                                                                             │
│  Call ID: Meeting-ABC-123                                                  │
│  Started: 2025-10-23T18:25:08.135Z                                         │
└─────────────────────────────────────────────────────────────────────────────┘

PIPELINE STAGES:
  1️⃣  AUDIO RECEPTION       → Browser sends PCM audio via WebSocket
  2️⃣  STT PROCESSING        → Soniox API transcribes audio + speaker diarization
  3️⃣  DATABASE INSERT       → Save to transcript_events table (staging)
  4️⃣  EDGE FUNCTION         → Process and move to transcripts table (final)
  5️⃣  REALTIME BROADCAST    → Supabase Realtime pushes to subscribers
  6️⃣  UI DISPLAY            → React UI receives and renders transcript
```

### Log entries

Mỗi log entry có format:

```
[+0.523s]    2️⃣ STT_FINAL              | Seq: 1      | Speaker: John Doe      | Duration: 45ms
                                                       └─ Text: "Hello everyone, welcome to the meeting"
```

**Giải thích:**
- `[+0.523s]`: Thời gian kể từ khi bắt đầu cuộc họp
- `2️⃣ STT_FINAL`: Stage hiện tại
- `Seq: 1`: Sequence number (nếu có)
- `Speaker`: Người nói
- `Duration`: Thời gian xử lý (ms)
- `Text`: Nội dung transcript

### Summary

Cuối file có tổng kết timing của từng stage:

```
═════════════════════════════════════════════════════════════════════════════

PIPELINE SUMMARY:
  Total Processing Time: 45.231s
  
  Stage Timings (first occurrence):
    1️⃣ AUDIO_RECEIVED                  → +0.123s
    2️⃣ STT_SENT                        → +0.234s
    2️⃣ STT_PARTIAL                     → +0.456s
    2️⃣ STT_FINAL                       → +0.789s
    3️⃣ DB_INSERT_START                 → +0.790s
    3️⃣ DB_INSERT_SUCCESS               → +0.802s
```

## Cách sử dụng

### 1. Tự động kích hoạt

Debug logger tự động khởi tạo khi:
- Nhận START event từ browser
- Log file path sẽ được in ra console

```
[INFO]: [PIPELINE DEBUG]: [Meeting-ABC-123] - Pipeline debug logger initialized. 
Log file: /path/to/debug-logs/pipeline-Meeting-ABC-123-2025-10-23-18-25-08.txt
```

### 2. Xem log real-time

Sử dụng `tail -f` để xem log real-time:

```bash
tail -f debug-logs/pipeline-*.txt
```

### 3. Phân tích lỗi

#### Scenario 1: Audio không đến Soniox

**Triệu chứng:** Không thấy `2️⃣ STT_SENT` logs

**Nguyên nhân có thể:**
- Browser không gửi audio
- WebSocket bị đứt
- Audio stream bị lỗi

**Kiểm tra:**
```bash
grep "AUDIO_RECEIVED" debug-logs/pipeline-*.txt
# Nếu thấy → Audio đã đến server
# Nếu không → Lỗi ở browser/WebSocket
```

#### Scenario 2: Soniox không trả transcript

**Triệu chứng:** Thấy `2️⃣ STT_SENT` nhưng không thấy `2️⃣ STT_FINAL`

**Nguyên nhân có thể:**
- Soniox API key không hợp lệ
- Audio format sai
- Soniox service down

**Kiểm tra:**
```bash
grep "STT_ERROR" debug-logs/pipeline-*.txt
# Xem error message chi tiết
```

#### Scenario 3: Database insert thất bại

**Triệu chứng:** Thấy `3️⃣ DB_INSERT_START` nhưng gặp `3️⃣ DB_INSERT_ERROR`

**Nguyên nhân có thể:**
- Supabase connection issue
- RLS policy chặn
- Duplicate key (23505)

**Kiểm tra:**
```bash
grep "DB_INSERT_ERROR" debug-logs/pipeline-*.txt | tail -20
# Xem 20 lỗi gần nhất
```

#### Scenario 4: UI không hiển thị transcript

**Triệu chứng:** Database có data nhưng UI không hiển thị

**Nguyên nhân có thể:**
- Edge function không chạy
- Realtime subscription không hoạt động
- Frontend lỗi

**Kiểm tra:**
```bash
# 1. Kiểm tra xem data đã vào DB chưa
grep "DB_INSERT_SUCCESS" debug-logs/pipeline-*.txt | wc -l

# 2. Kiểm tra Edge function logs (trong Supabase Dashboard)

# 3. Kiểm tra browser console xem có nhận Realtime events không
```

## Các metrics quan trọng

### 1. Latency từ Audio → Transcript

```bash
# Tính thời gian từ AUDIO_RECEIVED đến STT_FINAL
grep -E "(AUDIO_RECEIVED|STT_FINAL)" debug-logs/pipeline-*.txt | head -10
```

**Mục tiêu:** < 2 giây

### 2. Database insert performance

```bash
# Tìm các DB insert chậm (> 100ms)
grep "DB_INSERT_SUCCESS" debug-logs/pipeline-*.txt | grep -E "Duration: [1-9][0-9]{2,}ms"
```

**Mục tiêu:** < 50ms

### 3. Error rate

```bash
# Đếm số lỗi
grep "ERROR" debug-logs/pipeline-*.txt | wc -l
```

## Troubleshooting thường gặp

### Lỗi 1: "Property 'audioChunkCount' does not exist"

**Fix:** Đã được fix trong `eventtypes.ts`, restart server.

### Lỗi 2: Log file không được tạo

**Nguyên nhân:** Thư mục `debug-logs` không tồn tại hoặc không có quyền ghi.

**Fix:**
```bash
mkdir -p debug-logs
chmod 755 debug-logs
```

### Lỗi 3: Log file quá lớn

**Giải pháp:** Logger đã throttle (chỉ log mỗi 100 chunks) để tránh file quá lớn.

**Cleanup:**
```bash
# Xóa logs cũ hơn 7 ngày
find debug-logs -name "pipeline-*.txt" -mtime +7 -delete
```

## Best Practices

### 1. Luôn kiểm tra log trước khi report bug

```bash
# Xem log mới nhất
ls -lt debug-logs/pipeline-*.txt | head -1 | awk '{print $NF}' | xargs cat
```

### 2. Share log file khi report issue

Khi báo lỗi, attach file log để team dễ debug:

```bash
# Copy log file
cp debug-logs/pipeline-{callId}-*.txt ~/Desktop/
```

### 3. Monitor pipeline health

Tạo script kiểm tra health:

```bash
#!/bin/bash
# check-pipeline-health.sh

LOG_FILE=$(ls -t debug-logs/pipeline-*.txt | head -1)

echo "Checking latest pipeline: $LOG_FILE"
echo "---"

echo "Audio chunks received:"
grep -c "AUDIO_RECEIVED" "$LOG_FILE"

echo "STT finals produced:"
grep -c "STT_FINAL" "$LOG_FILE"

echo "DB inserts succeeded:"
grep -c "DB_INSERT_SUCCESS" "$LOG_FILE"

echo "Errors detected:"
grep -c "ERROR" "$LOG_FILE"
```

## Kết luận

Pipeline Debug System giúp bạn:

✅ **Xác định chính xác** bước nào trong pipeline gặp lỗi  
✅ **Đo lường performance** của từng stage  
✅ **Troubleshoot nhanh** các vấn đề về transcript  
✅ **Monitor health** của hệ thống real-time  

**Log location:** `debug-logs/pipeline-{callId}-{timestamp}.txt`

**Auto cleanup:** Nên xóa logs cũ hơn 7 ngày để tiết kiệm disk space.
