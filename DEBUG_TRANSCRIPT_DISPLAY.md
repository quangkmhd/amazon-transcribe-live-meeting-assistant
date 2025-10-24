# Debug Transcript Display - Hướng Dẫn

## 🎯 Mục Đích

Debug để xem:
1. **Mỗi lần render** có bao nhiêu từ được đưa lên UI
2. **Nguồn dữ liệu** là live tokens hay database
3. **Thời gian** trong transcript nghĩa là gì

---

## 📋 Các Console Logs Đã Thêm

### 1. Token Reception (Khi nhận từ WebSocket)
```
📝 [TOKENS] Received 5 tokens: khô? cằn? đầy✓ xương? rồng?
  ✅ Speaker 1: 0 → 1 final tokens
  ⏳ Speaker 1: 4 non-final tokens (replaced)
```

**Giải thích:**
- `?` = non-final token (có thể thay đổi)
- `✓` = final token (đã xác nhận, không đổi)
- Final tokens **tích lũy** (0 → 1 → 2 → 3...)
- Non-final tokens **thay thế** (luôn là tokens mới nhất)

---

### 2. Token Accumulation (Khi tổng hợp tokens)
```
🎤 Speaker 1:
   Final tokens: 15, Non-final: 3
   Sample tokens: Giới? thiệu? với✓ mọi✓ người✓
```

**Giải thích:**
- Speaker 1 có **15 final + 3 non-final = 18 tokens**
- Sample: 5 tokens đầu tiên (để kiểm tra)

---

### 3. Segments to Render (Trước khi hiển thị)
```
🔍 [DEBUG SEGMENTS]
  Live token segments: 1
    [0] Speaker 1: 18 words, "Giới thiệu với mọi người..."
        Time: 6.2s - 12.5s
  Using: LIVE TOKENS
  Total segments to render: 1
```

**Giải thích:**
- **Live token segments**: Số segment từ WebSocket
- **Words**: Số từ trong mỗi segment
- **Time**: startTime (6.2s) đến endTime (12.5s)
- **Using**: LIVE TOKENS (real-time) hoặc DATABASE (completed)

---

## ⏱️ Giải Thích Thời Gian

### Trong UI Bạn Thấy:
```
Speaker 1
06:00.0 - 00:00.0
Giới thiệu với mọi người...
```

**Định dạng:** `MM:SS.S - MM:SS.S`
- `06:00.0` = startTime = 6 giây (phút 0, giây 6)
- `00:00.0` = endTime = 0 giây

### ❌ Vấn đề: EndTime = 0?

**Nguyên nhân có thể:**
1. **Database segment lỗi**: endTime trong DB bị null/0
2. **Token thiếu end_ms**: Soniox không gửi end_ms
3. **Logic tính toán sai**: Code không map đúng

---

## 🧪 Cách Test & Debug

### Bước 1: Refresh Trang
```
1. Mở trang transcript đang streaming
2. Nhấn F5 để refresh
3. Mở Console (F12)
```

### Bước 2: Nói 2-3 Câu Ngắn
```
VD: "Xin chào" (dừng 1s) "Tôi là Khoai" (dừng 1s) "Hôm nay thế nào?"
```

### Bước 3: Xem Console Logs

**Mong đợi thấy (mỗi 0.5-1s):**
```
📝 [TOKENS] Received 2 tokens: Xin? chào?
  ⏳ Speaker 1: 2 non-final tokens

📝 [TOKENS] Received 2 tokens: Xin✓ chào?
  ✅ Speaker 1: 0 → 1 final tokens
  ⏳ Speaker 1: 1 non-final tokens

🎤 Speaker 1:
   Final tokens: 1, Non-final: 1
   Sample tokens: Xin✓ chào?

🔍 [DEBUG SEGMENTS]
  Live token segments: 1
    [0] Speaker 1: 2 words, "Xin chào"
        Time: 0.3s - 0.8s
  Using: LIVE TOKENS
  Total segments to render: 1
```

**❌ Nếu thấy:**
```
🔍 [DEBUG SEGMENTS]
  Live token segments: 0
  Using: DATABASE
  Total segments to render: 25
```
→ **Vấn đề**: Không nhận được live tokens!

---

## 🔍 Các Trường Hợp Debug

### Trường hợp 1: Nhiều Từ Cùng Lúc (Batch)

**Console:**
```
📝 [TOKENS] Received 50 tokens: Giới? thiệu? với? mọi? người?...
🎤 Speaker 1:
   Final tokens: 50, Non-final: 0
   Sample tokens: Giới✓ thiệu✓ với✓ mọi✓ người✓

🔍 [DEBUG SEGMENTS]
    [0] Speaker 1: 50 words, "Giới thiệu với mọi người..."
```

**Nguyên nhân:**
- Soniox gửi **batch lớn tokens** cùng lúc
- Tất cả tokens đều `is_final: true`
- Không có từng từ một → Không real-time

**Giải pháp:**
- Check backend: Soniox có stream từng token không?
- Check `enable_endpoint_detection` trong soniox.ts

---

### Trường hợp 2: Delay 5 Giây

**Console:**
```
[00:00] Bạn nói: "Xin chào"
[00:05] Console: 📝 [TOKENS] Received 2 tokens: Xin✓ chào✓
```

**Nguyên nhân:**
- WebSocket **KHÔNG** kết nối
- Đang dùng **DATABASE** (delay 5s do edge function)

**Check:**
```
🔍 [DEBUG SEGMENTS]
  Using: DATABASE  ← ❌ Sai! Phải là LIVE TOKENS
```

**Giải pháp:**
- Check WebSocket có connect không
- Check `isLiveCall` = true?
- Check `item.recordingStatusLabel === IN_PROGRESS_STATUS`

---

### Trường hợp 3: EndTime = 0

**Console:**
```
🔍 [DEBUG SEGMENTS]
    [0] Speaker 1: 10 words
        Time: 6.0s - 0.0s  ← ❌ EndTime = 0!
```

**Nguyên nhân:**
- Token không có `end_ms`
- Hoặc `end_ms` = 0 từ Soniox

**Check Backend:**
```typescript
// soniox.ts line 134
end_ms: t.end_ms,  // ← Có giá trị không?
```

**Giải pháp tạm:**
```javascript
// CallPanel.jsx
endTime: allTokens[allTokens.length - 1].end_ms / 1000 || (allTokens[0].start_ms / 1000 + 1),
// Nếu end_ms = 0, dùng start_ms + 1s
```

---

## 📊 Kết Quả Mong Đợi

### ✅ Đúng (Word-by-Word)
```
[Console - Mỗi 0.5s]
📝 [TOKENS] Received 1 token: Xin?
🔍 [DEBUG SEGMENTS]
    [0] Speaker 1: 1 words, "Xin"
        Time: 0.5s - 0.6s

📝 [TOKENS] Received 2 tokens: Xin✓ chào?
🔍 [DEBUG SEGMENTS]
    [0] Speaker 1: 2 words, "Xin chào"
        Time: 0.5s - 1.2s

[UI]
Speaker 1
00:00.5 - 01:00.2
Xin chào  ← Từ tăng dần real-time
```

### ❌ Sai (Batch)
```
[Console - Sau 5s]
📝 [TOKENS] Received 50 tokens: Giới✓ thiệu✓ với✓...
🔍 [DEBUG SEGMENTS]
    [0] Speaker 1: 50 words, "Giới thiệu với mọi người..."

[UI]
Speaker 1
06:00.0 - 12:00.0
Giới thiệu với mọi người...  ← Cả câu cùng lúc
```

---

## 🛠️ Các Bước Fix Tiếp Theo

Dựa vào console logs, hãy cho tôi biết:

### 1. Có thấy logs `📝 [TOKENS]` không?
- **CÓ**: WebSocket OK, tiếp bước 2
- **KHÔNG**: WebSocket chưa connect → Fix WebSocket

### 2. Tokens nhận như thế nào?
- **Từng từ** (1-3 tokens/lần): ✅ Hoàn hảo
- **Batch lớn** (20-50 tokens/lần): ❌ Backend gửi sai

### 3. `Using` gì?
- **LIVE TOKENS**: ✅ Đúng
- **DATABASE**: ❌ Live tokens bị mất

### 4. EndTime có = 0 không?
- **Có**: Fix logic tính endTime
- **Không**: OK

---

## 💡 Debug Commands

### Xem State Hiện Tại
```javascript
// Paste vào Console
console.log('finalTokensBySpeaker:', finalTokensBySpeaker);
console.log('nonFinalTokensBySpeaker:', nonFinalTokensBySpeaker);
```

### Force Re-render
```javascript
// Paste vào Console
setUpdateFlag(prev => !prev);
```

### Check WebSocket
```javascript
// Paste vào Console
console.log('WebSocket endpoint:', settings.WSEndpoint);
console.log('Is live call:', item.recordingStatusLabel === 'IN_PROGRESS');
```

---

Sau khi test, hãy **paste toàn bộ console logs** để tôi phân tích chi tiết!
