# WebSocket Not Connecting - Diagnostic Guide

## ❌ Vấn Đề

Console logs cho thấy:
```
🔍 [DEBUG SEGMENTS]
  Live token segments: 0        ← ❌ KHÔNG có live tokens
  Using: DATABASE               ← ❌ Chỉ dùng database
  Total segments to render: 15
```

**Backend đã gửi:**
```
DEBUG [08:46:17.796]: [SONIOX]: Forwarded FINAL transcript to browser: " Ờ, Jaden nó đang quay"
```

**Nhưng UI KHÔNG nhận được** như TOKENS events → WebSocket KHÔNG kết nối!

---

## 🔍 Nguyên Nhân

**CallPanel.jsx line 553:**
```javascript
const isLiveCall = item.recordingStatusLabel === IN_PROGRESS_STATUS;
```

**Line 570:**
```javascript
skip: !isLiveCall || !settings.WSEndpoint || !JWT_TOKEN,
```

**IN_PROGRESS_STATUS = 'In Progress'** (get-recording-status.js line 7)

**Nếu `item.recordingStatusLabel !== 'In Progress'` → WebSocket bị skip!**

---

## 🧪 Debug Steps

### Bước 1: Kiểm Tra Meeting Status

Mở Console và tìm log:
```
🔌 [WEBSOCKET DEBUG]
  Meeting status: ???          ← Check giá trị này
  Expected: In Progress
  isLiveCall: false            ← Phải là true!
  WSEndpoint: ws://localhost:8080/api/v1/ws
  Has JWT_TOKEN: true
  Will skip WebSocket? true    ← Đây là vấn đề!
```

**Nếu `Meeting status !== 'In Progress'`:**
- Database có thể lưu là `"started"` (chữ thường)
- Hoặc `"STARTED"` (chữ HOA)
- Nhưng code expect `"In Progress"` (In hoa, Progress hoa)

---

## 🔧 Các Khả Năng & Fix

### Trường Hợp 1: Meeting Status Sai

**Database lưu:**
```sql
SELECT meeting_id, status FROM meetings WHERE meeting_id = 'Stream Audio - ...';
-- Kết quả: status = 'started'
```

**Nhưng code expect:**
```javascript
item.recordingStatusLabel === 'In Progress'
```

**Fix Option A: Sửa Database Schema**
```sql
-- Đổi giá trị status trong database
UPDATE meetings 
SET status = 'In Progress' 
WHERE status = 'started';
```

**Fix Option B: Sửa Code Check**
```javascript
// CallPanel.jsx line 553
const isLiveCall = 
  item.recordingStatusLabel === IN_PROGRESS_STATUS ||
  item.status === 'started' ||
  item.status === 'STARTED';
```

---

### Trường Hợp 2: getRecordingStatus Logic Sai

**get-recording-status.js line 16-20:**
```javascript
const inProgressState = ['STARTED', 'TRANSCRIBING'];

if (inProgressState.includes(item.status?.toUpperCase?.())) {
  return inProgressStatus; // { label: 'In Progress', icon: 'in-progress' }
}
```

**Check:**
1. `item.status` có giá trị gì? ('started', 'STARTED', hay null?)
2. Có gọi `getRecordingStatus(item)` không?

**Debug:**
```javascript
// CallPanel.jsx thêm log
console.log('  item.status:', item.status);
console.log('  item.recordingStatusLabel:', item.recordingStatusLabel);
console.log('  Full item:', item);
```

---

### Trường Hợp 3: UI Component Không Update

**Vấn đề:** Meeting đã start nhưng UI component không re-render với status mới.

**Nguyên nhân:**
- `useCallsSupabaseApi` không subscribe đến `meetings` table updates
- Chỉ subscribe `transcripts` table

**Check:**
```javascript
// use-calls-supabase-api.js
// Có subscribe meetings updates không?
const meetingChannel = supabase
  .channel('meetings-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'meetings' },
    handleMeetingUpdate
  )
  .subscribe();
```

**Nếu KHÔNG có → meetings status không update real-time!**

**Fix: Subscribe meetings table**
```javascript
// use-calls-supabase-api.js
useEffect(() => {
  const meetingChannel = supabase
    .channel('meetings-updates')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'meetings' },
      (payload) => {
        console.log('📢 Meeting updated:', payload.new);
        // Update meeting status in state
        setCallsData((prev) => 
          prev.map((call) => 
            call.meeting_id === payload.new.meeting_id
              ? { ...call, status: payload.new.status }
              : call
          )
        );
      }
    )
    .subscribe();

  return () => {
    meetingChannel.unsubscribe();
  };
}, []);
```

---

## 🎯 Recommended Fix (Quick)

**Sửa line 553 trong CallPanel.jsx:**

**BEFORE:**
```javascript
const isLiveCall = item.recordingStatusLabel === IN_PROGRESS_STATUS;
```

**AFTER:**
```javascript
// Accept both 'In Progress' label AND 'started' status from database
const isLiveCall = 
  item.recordingStatusLabel === IN_PROGRESS_STATUS ||
  item.status?.toLowerCase?.() === 'started';

console.log('🔌 [WEBSOCKET DEBUG]');
console.log('  Meeting status:', item.status);
console.log('  Status label:', item.recordingStatusLabel);
console.log('  isLiveCall:', isLiveCall);
```

---

## 📊 Sau Khi Fix

**Mong đợi thấy:**
```
🔌 [WEBSOCKET DEBUG]
  Meeting status: started
  Status label: In Progress
  isLiveCall: true             ← ✅ Bật WebSocket
  WSEndpoint: ws://localhost:8080/api/v1/ws
  Has JWT_TOKEN: true
  Will skip WebSocket? false   ← ✅ Không skip

📨 [WEBSOCKET] Received message: {"event":"TOKENS","callId":"Stream...
📝 [TOKENS] Received 5 tokens: Ờ? Jaden? nó? đang? quay?
  ⏳ Speaker 1: 5 non-final tokens

🎤 Speaker 1:
   Final tokens: 0, Non-final: 5
   Sample tokens: Ờ? Jaden? nó? đang? quay?

🔍 [DEBUG SEGMENTS]
  Live token segments: 1       ← ✅ Có live tokens!
    [0] Speaker 1: 5 words, "Ờ Jaden nó đang quay"
        Time: 12.3s - 14.5s
  Using: LIVE TOKENS            ← ✅ Dùng real-time!
  Total segments to render: 1
```

---

## 🐛 Nếu Vẫn Chưa Fix

### Check 1: Backend Có Gửi TOKENS Không?

**Terminal backend phải thấy:**
```
DEBUG [HH:MM:SS]: [SONIOX]: Forwarding tokens to browser: 5 tokens
```

**Nếu KHÔNG thấy:**
- Check `soniox.ts` line 124-138
- WebSocket `clientWs` có open không?
- `result.tokens` có data không?

### Check 2: WebSocket URL Đúng Không?

**lma_config.json:**
```json
{
  "WSEndpoint": "ws://localhost:8080/api/v1/ws"
}
```

**Nếu sai port hoặc path → WebSocket không kết nối!**

### Check 3: JWT Tokens Hợp Lệ?

**Console:**
```
🔌 [WEBSOCKET DEBUG]
  Has JWT_TOKEN: false  ← ❌ Không có token!
```

**Fix:**
- Login lại
- Check localStorage có tokens không
- Check Supabase auth state

---

## ✅ Checklist

- [ ] Console có thấy `🔌 [WEBSOCKET DEBUG]` không?
- [ ] `Meeting status` là gì? (`started`, `STARTED`, hay `In Progress`?)
- [ ] `isLiveCall` có = `true` không?
- [ ] `Will skip WebSocket?` có = `false` không?
- [ ] Terminal backend có log "Forwarded FINAL transcript to browser" không?
- [ ] Console có thấy `📨 [WEBSOCKET] Received message` không?
- [ ] Console có thấy `📝 [TOKENS]` không?

**Nếu TẤT CẢ đều OK:**
- ✅ WebSocket đã kết nối
- ✅ Word-by-word sẽ hoạt động
- ✅ No delay, real-time!

---

## 💡 Long-Term Fix

**Standardize status values:**
1. Database: Always use lowercase `'started'`, `'ended'`
2. UI: Map to display labels `'In Progress'`, `'Done'`
3. Code: Check against database values, not display labels

```javascript
// constants.js
export const MEETING_STATUS = {
  STARTED: 'started',
  ENDED: 'ended',
  ERROR: 'error'
};

// CallPanel.jsx
const isLiveCall = item.status === MEETING_STATUS.STARTED;

// get-recording-status.js
const getRecordingStatus = (item) => {
  switch (item.status) {
    case MEETING_STATUS.STARTED:
      return { label: 'In Progress', icon: 'in-progress' };
    case MEETING_STATUS.ENDED:
      return { label: 'Done', icon: 'success' };
    default:
      return { label: 'Unknown', icon: 'warning' };
  }
};
```
