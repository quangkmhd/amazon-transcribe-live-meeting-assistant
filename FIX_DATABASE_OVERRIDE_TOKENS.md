# Fix: Database Segments Overriding Live Tokens

## ❌ Vấn đề Phát Hiện

Khi streaming, UI vẫn hiển thị **câu hoàn chỉnh từ database** thay vì **từng từ một từ WebSocket**.

### Console sẽ thấy:
```
📝 [TOKENS] Received 3 tokens: khô? cằn? đầy?
✅ Speaker 1: 0 → 3 final tokens
```

**Nhưng UI vẫn hiển thị:**
```
Speaker 1
14:00.0 - 27:00.0
lỗi phong, mong là chủ tiệm sẽ can thiệp...  ← Câu dài từ database!
```

---

## 🔍 Nguyên Nhân

**Code cũ (line 800-811):**
```javascript
const allSegments = [
  ...transcriptChannels.map(...),  // Database segments (câu hoàn chỉnh)
  ...liveTokenSegments,             // Live tokens (từng từ)
]
```

**Vấn đề:**
1. Database segments từ Supabase Realtime (delay 2-5s)
2. Live tokens từ WebSocket (real-time 0.5s)
3. Cả hai đều hiển thị → **Database đè lên live tokens**
4. Database segments có text dài → "Winning" khi sort và merge

---

## ✅ Giải Pháp

**Code mới:**
```javascript
const hasLiveTokens = liveTokenSegments.length > 0;

const allSegments = hasLiveTokens
  ? liveTokenSegments              // ✅ ONLY live tokens (real-time)
  : transcriptChannels.map(...)    // ✅ Database (when completed)
```

**Logic:**
- **Đang live**: CHỈ hiển thị live tokens (không database)
- **Đã kết thúc**: Hiển thị database segments (không có live tokens nữa)

---

## 🎯 Kết Quả Mong Đợi

### Khi Streaming (IN_PROGRESS):
```
[Console]
📝 [TOKENS] Received 2 tokens: khô? cằn?
  ⏳ Speaker 1: 2 non-final tokens

[UI - Real-time]
Speaker 1
00:00.0 - 01:00.0
khô cằn           ← Chỉ 2 từ đang nói

[Console]
📝 [TOKENS] Received 3 tokens: khô✓ cằn? đầy?
  ✅ Speaker 1: 0 → 1 final tokens
  ⏳ Speaker 1: 2 non-final tokens

[UI - Update real-time]
Speaker 1
00:00.0 - 02:00.0
khô cằn đầy       ← 3 từ, tăng dần
```

### Khi Completed:
```
[UI - Database]
Speaker 1
14:00.0 - 27:00.0
lỗi phong, mong là chủ tiệm sẽ can thiệp...  ← Full sentence từ DB
```

---

## 🧪 Test Lại

### 1. Restart Frontend
```bash
# Ctrl+C terminal UI
cd lma-ai-stack/source/ui
npm start
```

### 2. Start Streaming
1. Vào http://localhost:3000
2. Click **Stream Audio**
3. Click **Start Streaming**
4. Nói vài từ

### 3. Mở Transcript
5. Click **Open in progress meeting**
6. Mở **DevTools Console** (F12)

### 4. Kiểm Tra

**Console phải có:**
```
📝 [TOKENS] Received X tokens: ...
✅ Speaker 1: 0 → 5 final tokens
⏳ Speaker 1: 2 non-final tokens
```

**UI phải thấy:**
- ✅ Từ xuất hiện **từng từ một**
- ✅ Text **tăng dần** (không phải câu dài cùng lúc)
- ✅ Không có database segments trong lúc streaming

---

## 📊 So Sánh

| Trường hợp | Code Cũ | Code Mới |
|------------|---------|----------|
| **Live streaming** | Database + Live tokens (lộn xộn) | CHỈ Live tokens ✅ |
| **Completed** | Database segments | Database segments ✅ |
| **Word-by-word** | ❌ Bị database đè | ✅ Hiển thị từng từ |
| **Delay** | 2-5s (database) | 0.5-1s (WebSocket) ✅ |

---

## 🐛 Nếu Vẫn Chưa Được

### Check 1: WebSocket có kết nối?
```javascript
// Console phải thấy
📝 [TOKENS] Received ...
```
**Nếu KHÔNG thấy:**
- WebSocket chưa connect
- Check backend có chạy không (port 8080)
- Check `settings.WSEndpoint` trong lma_config.json

### Check 2: Có live tokens không?
```javascript
// Console phải thấy
✅ Speaker X: A → B final tokens
```
**Nếu KHÔNG thấy:**
- Tất cả tokens đều non-final
- Chờ Soniox finalize (~1-2s)

### Check 3: UI có update không?
**Nếu KHÔNG update:**
- Check React dependencies trong useEffect
- Line 889-890 phải có: `finalTokensBySpeaker, nonFinalTokensBySpeaker`

---

## 📝 Files Đã Sửa

- `CallPanel.jsx` line 800-812: Logic chọn segments
  - **Trước**: Merge database + live tokens
  - **Sau**: CHỈ live tokens khi đang streaming

---

## 💡 Lý Do Tại Sao Cách Này Đúng

**Soniox examples** cũng làm tương tự:
```typescript
// transcribe.tsx
const allTokens = [...finalTokens, ...nonFinalTokens];

// Hiển thị CHỈ tokens, KHÔNG có database segments
<Renderer tokens={allTokens} />
```

**LMA cũng nên:**
- **Đang live**: Chỉ hiển thị tokens (real-time)
- **Đã xong**: Chỉ hiển thị database (complete)
- **KHÔNG**: Mix cả hai cùng lúc ❌
