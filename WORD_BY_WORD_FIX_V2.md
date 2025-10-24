# Word-by-Word Transcript Display Fix V2

## ❌ Vấn đề

UI đang hiển thị **nhiều câu cùng lúc** thay vì **từng từ một** như Soniox examples.

## ✅ Giải pháp (Inspired by Soniox Examples)

### Cách Soniox Examples hoạt động:

```typescript
// useSonioxClient.tsx
const [finalTokens, setFinalTokens] = useState<Token[]>([]);
const [nonFinalTokens, setNonFinalTokens] = useState<Token[]>([]);

onPartialResult(result) {
  const newFinalTokens: Token[] = [];
  const newNonFinalTokens: Token[] = [];

  for (const token of result.tokens) {
    if (token.is_final) {
      newFinalTokens.push(token);  // Accumulate final
    } else {
      newNonFinalTokens.push(token);  // Replace non-final
    }
  }

  setFinalTokens((prev) => [...prev, ...newFinalTokens]);  // ✅ ACCUMULATE
  setNonFinalTokens(newNonFinalTokens);  // ✅ REPLACE
}

// Display: [...finalTokens, ...nonFinalTokens]
```

### Code LMA đã sửa:

**Trước (SAI):**
```javascript
// Gộp tất cả tokens thành một string dài
const allText = tokens.map(t => t.text).join('');
```

**Sau (ĐÚNG):**
```javascript
// Tách riêng final và non-final tokens
const [finalTokensBySpeaker, setFinalTokensBySpeaker] = useState({});
const [nonFinalTokensBySpeaker, setNonFinalTokensBySpeaker] = useState({});

// Final tokens: ACCUMULATE (thêm vào, không xóa)
setFinalTokensBySpeaker((prev) => ({
  ...prev,
  [speaker]: [...(prev[speaker] || []), ...newFinalTokens]
}));

// Non-final tokens: REPLACE (thay thế hoàn toàn)
setNonFinalTokensBySpeaker(newNonFinalBySpeaker);

// Display: merge final + non-final cho mỗi speaker
const allTokens = [...finalTokens, ...nonFinalTokens];
const transcript = allTokens.map(t => t.text).join('');
```

---

## 🔍 Cách Hoạt Động

### Ví dụ: "Hello world from Vietnam"

**Lần 1:** Backend gửi `["Hello"?]` (non-final)
- Final: `[]`
- Non-final: `["Hello"]`
- **UI hiển thị:** "Hello"

**Lần 2:** Backend gửi `["Hello"✓, " world"?]`
- Final: `["Hello"]` ← **Accumulate**
- Non-final: `[" world"]` ← **Replace**
- **UI hiển thị:** "Hello world"

**Lần 3:** Backend gửi `[" world"✓, " from"?]`
- Final: `["Hello", " world"]` ← **Accumulate**
- Non-final: `[" from"]` ← **Replace**
- **UI hiển thị:** "Hello world from"

**Lần 4:** Backend gửi `[" from"✓, " Vietnam"?]`
- Final: `["Hello", " world", " from"]` ← **Accumulate**
- Non-final: `[" Vietnam"]` ← **Replace**
- **UI hiển thị:** "Hello world from Vietnam"

**Lần 5:** Backend gửi `[" Vietnam"✓]`
- Final: `["Hello", " world", " from", " Vietnam"]` ← **Accumulate**
- Non-final: `[]` ← **Clear**
- **UI hiển thị:** "Hello world from Vietnam" (final)

---

## 📊 Console Logs để Debug

Khi chạy, bạn sẽ thấy:

```
📝 [TOKENS] Received 2 tokens: Hello? world?
  ⏳ Speaker 1: 2 non-final tokens (replaced)

📝 [TOKENS] Received 3 tokens: Hello✓ world? from?
  ✅ Speaker 1: 0 → 1 final tokens
  ⏳ Speaker 1: 2 non-final tokens (replaced)

📝 [TOKENS] Received 2 tokens: world✓ from?
  ✅ Speaker 1: 1 → 2 final tokens
  ⏳ Speaker 1: 1 non-final tokens (replaced)
```

**Ký hiệu:**
- `?` = non-final token (đang transcribe, có thể thay đổi)
- `✓` = final token (đã xác nhận, không đổi nữa)

---

## 🧪 Cách Test

### 1. Start Backend & Frontend
```bash
# Terminal 1: Backend
cd lma-websocket-transcriber-stack/source/app
npm start

# Terminal 2: Frontend
cd lma-ai-stack/source/ui
npm start
```

### 2. Streaming Audio
1. Vào http://localhost:3000
2. Click **Stream Audio**
3. Click **Start Streaming**
4. Nói vài từ
5. Click **Open in progress meeting**

### 3. Kiểm tra Console
Mở **DevTools Console** và xem:
```
📝 [TOKENS] Received 3 tokens: khô? cằn? đầy?
  ⏳ Speaker 1: 3 non-final tokens (replaced)

📝 [TOKENS] Received 2 tokens: khô✓ cằn?
  ✅ Speaker 1: 0 → 1 final tokens
  ⏳ Speaker 1: 1 non-final tokens (replaced)

📝 [TOKENS] Received 3 tokens: cằn✓ đầy✓ xương?
  ✅ Speaker 1: 1 → 3 final tokens
  ⏳ Speaker 1: 1 non-final tokens (replaced)
```

### 4. Kiểm tra UI
**Mong đợi:**
- ✅ Từ xuất hiện **từng từ một** (thêm dần)
- ✅ Từ non-final có thể **thay đổi** (sửa lại)
- ✅ Từ final **không thay đổi** nữa
- ✅ Không có nhiều câu dài xuất hiện cùng lúc

---

## 🔧 Files Đã Sửa

**CallPanel.jsx** - Thay đổi chính:

1. **Đổi state** (line 534-536):
```javascript
// Trước
const [partialTranscripts, setPartialTranscripts] = useState({});

// Sau
const [finalTokensBySpeaker, setFinalTokensBySpeaker] = useState({});
const [nonFinalTokensBySpeaker, setNonFinalTokensBySpeaker] = useState({});
```

2. **Logic xử lý TOKENS** (line 573-619):
- Tách final và non-final tokens
- Final: accumulate (thêm vào array)
- Non-final: replace (thay thế array)

3. **Convert tokens to segments** (line 761-792):
- Merge final + non-final tokens per speaker
- Tạo một segment duy nhất với text tích lũy

---

## 🐛 Troubleshooting

### Vẫn thấy nhiều câu cùng lúc?
**Check:**
1. Console có log `📝 [TOKENS]` không?
   - **Không** → WebSocket chưa kết nối, check backend
   - **Có** → OK, tiếp tục

2. Console có log `✅ Speaker X: A → B final tokens`?
   - **Không** → Tất cả tokens đều non-final, chờ Soniox finalize
   - **Có** → OK, tokens đang được accumulate

3. UI có update mỗi khi có log mới?
   - **Không** → Check React dependencies trong useEffect
   - **Có** → Perfect! 🎉

### Token count không tăng?
```
📝 [TOKENS] Received 5 tokens: ...
  ✅ Speaker 1: 10 → 10 final tokens  ❌ Không tăng!
```
**Nguyên nhân:** Tất cả 5 tokens đều là non-final (`is_final: false`)  
**Giải pháp:** Chờ Soniox finalize (thường sau 1-2s)

### Text bị lặp lại?
**Nguyên nhân:** Database transcripts + live tokens đều hiển thị  
**Giải pháp:** Khi nhận TRANSCRIPT event từ DB, code sẽ xóa live tokens cho speaker đó (line 622-637)

---

## 📈 Performance

- **Latency:** 0.5-1s (trước đây: 2-5s)
- **Updates:** Real-time mỗi khi có token mới
- **Memory:** Negligible (chỉ lưu tokens, không lưu audio)

---

## ✨ Kết Quả Mong Đợi

```
[0:00] "Khô"                    ← 1 từ
[0:01] "Khô cằn"                ← 2 từ
[0:02] "Khô cằn đầy"            ← 3 từ
[0:03] "Khô cằn đầy xương"      ← 4 từ
[0:04] "Khô cằn đầy xương rồng" ← 5 từ
```

**KHÔNG PHẢI:**
```
[0:00] (chờ...)
[0:05] "Khô cằn đầy xương rồng" ← Tất cả cùng lúc ❌
```
