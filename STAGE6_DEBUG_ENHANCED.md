# 🔍 STAGE 6 DEBUG - Enhanced Logging

## Vấn đề phát hiện

✅ **Stage 1-5**: Hoạt động bình thường  
❌ **Stage 6 (UI_RECEIVED)**: Không xuất hiện trong log

## Root cause

**lma-ai-stack ĐÃ CÓ code để send ACK** (file: `use-calls-supabase-api.js`):
- Function `sendTranscriptACK` (line 166-212) 
- Được gọi khi nhận transcript (line 218)
- Subscribe Supabase Realtime (line 294-340)

**Nhưng**: Có thể fail silently hoặc user chưa mở đúng page

## Fixes applied

### 1. Enhanced debug logging trong `use-calls-supabase-api.js`

**sendTranscriptACK function:**
```javascript
console.log('🎯 [STAGE 6] Sending transcript ACK to backend...');
console.log('  URL:', `${httpUrl}/api/v1/pipeline-log`);
console.log('  Call ID:', callId);
console.log('  Segment ID:', transcriptSegment.segmentId);
```

**Subscription setup:**
```javascript
console.log('🎧 [STAGE 6] Setting up Supabase Realtime subscription...');
console.log('  Channel:', `transcripts:${liveTranscriptCallId}`);
```

**When receiving transcript:**
```javascript
console.log('🎉 [STAGE 6] Received transcript from Supabase Realtime!');
console.log('  Payload:', payload);
```

## Cách test (QUAN TRỌNG!)

### Step 1: Start backend
```bash
cd lma-websocket-transcriber-stack/source/app
npm start
```

### Step 2: Start UI
```bash
cd lma-ai-stack/source/ui
npm start
```

### Step 3: **MỞ BROWSER và vào meeting page** ⚠️
```
http://localhost:3000
```

**QUAN TRỌNG**: Phải:
1. ✅ Login vào UI
2. ✅ Vào trang meeting đang live
3. ✅ Mở **Browser DevTools Console** (F12)

### Step 4: Start recording và observe

**Terminal (backend) sẽ thấy:**
```
================================================================================
🎉 STAGE 6 TRIGGERED! UI has received transcript
Call ID: Stream Audio - 2025-10-24-09:14:28.518
Speaker: Speaker 1
Transcript: ...
================================================================================
```

**Browser Console sẽ thấy:**
```
🎧 [STAGE 6] Setting up Supabase Realtime subscription...
  Channel: transcripts:Stream Audio - 2025-10-24-09:14:28.518
  Call ID: Stream Audio - 2025-10-24-09:14:28.518

📡 [STAGE 6] Subscription status: SUBSCRIBED
✅ [STAGE 6] Successfully subscribed to transcripts!

🎉 [STAGE 6] Received transcript from Supabase Realtime!
  Payload: { ... }
  
🎯 [STAGE 6] Sending transcript ACK to backend...
  URL: http://localhost:8080/api/v1/pipeline-log
  Call ID: Stream Audio - 2025-10-24-09:14:28.518
  Segment ID: 0-0
  Speaker: Speaker 1
  Transcript: ...
  
✅ [STAGE 6] Successfully sent transcript ACK!
```

## Troubleshooting

### Case 1: Không thấy subscription logs
**Nguyên nhân**: User chưa mở meeting page  
**Giải pháp**: Vào `http://localhost:3000` → Click vào meeting đang recording

### Case 2: Subscription SUBSCRIBED nhưng không receive transcript
**Nguyên nhân**: 
- Supabase Realtime chưa broadcast
- Filter không match (`call_id=eq.xxx`)

**Kiểm tra**: 
- Backend logs có `5️⃣ REALTIME_BROADCAST` không?
- Call ID có khớp không?

### Case 3: Receive transcript nhưng không send ACK
**Nguyên nhân**: Fetch API fail (CORS, network)

**Check browser console**: 
```
❌ [STAGE 6] Failed to send transcript ACK: TypeError: Failed to fetch
```

**Giải pháp**: 
- Verify backend đang chạy `localhost:8080`
- Check CORS settings

### Case 4: Send ACK nhưng backend không nhận
**Nguyên nhân**: Backend route không hoạt động

**Check backend console**: Có log incoming request không?

**Verify**: 
```bash
curl -X POST http://localhost:8080/api/v1/pipeline-log \
  -H "Content-Type: application/json" \
  -d '{"callId":"test","stage":"6️⃣ UI_RECEIVED","speaker":"Test","transcript":"Test"}'
```

## Expected flow

```
1. User opens meeting page
   ↓
2. useEffect triggers → Subscribe Supabase Realtime
   Console: "🎧 Setting up subscription..."
   Console: "✅ Successfully subscribed!"
   ↓
3. Supabase broadcasts new transcript (Stage 5)
   Backend log: "5️⃣ REALTIME_BROADCAST"
   ↓
4. Browser receives via Realtime
   Console: "🎉 Received transcript from Supabase!"
   ↓
5. Call handleCallTranscriptSegmentMessage
   ↓
6. Call sendTranscriptACK
   Console: "🎯 Sending transcript ACK..."
   ↓
7. POST to backend /api/v1/pipeline-log
   ↓
8. Backend logs stage 6
   Console: "🎉 STAGE 6 TRIGGERED!"
   Log file: "6️⃣ UI_RECEIVED"
```

## Files changed

1. `/lma-ai-stack/source/ui/src/hooks/use-calls-supabase-api.js`
   - Enhanced `sendTranscriptACK` logging (line 171-210)
   - Enhanced subscription logging (line 296-340)

## Checklist before testing

- [ ] Backend running on `localhost:8080`
- [ ] UI running on `localhost:3000`
- [ ] **Browser opened and logged in** ⚠️
- [ ] **Navigated to live meeting page** ⚠️
- [ ] **Browser DevTools Console open (F12)** ⚠️
- [ ] Recording started
- [ ] Speaking into microphone

## Next action

1. ✅ Restart UI: `cd lma-ai-stack/source/ui && npm start`
2. ✅ Mở browser: `http://localhost:3000`
3. ✅ Login và vào meeting page
4. ✅ Mở Console (F12)
5. ✅ Start recording và nói
6. ✅ Observe console logs

Nếu vẫn không thấy stage 6, gửi screenshot của:
- Backend terminal
- Browser console
- Meeting page UI
