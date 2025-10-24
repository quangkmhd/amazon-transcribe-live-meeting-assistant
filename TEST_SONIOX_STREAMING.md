# Test Soniox Token Streaming

## ✅ Đã Thêm Debug Logs

Backend `soniox.ts` line 123-146:
- `🎯 [SONIOX TOKENS]` - Mỗi khi nhận tokens
- `✅ [TOKENS SENT]` - Khi gửi thành công
- `⚠️ [TOKENS BLOCKED]` - Khi WebSocket không ready

## 🧪 Test Ngay

### 1. Restart Backend
```bash
cd lma-websocket-transcriber-stack/source/app
npm start
```

### 2. Start Streaming
- Vào Stream Audio
- Nói CHẬM từng từ: "Xin... chào... mọi... người"

### 3. Check Terminal

**Nếu Soniox stream từng từ (ĐÚNG):**
```
🎯 [SONIOX TOKENS] Received 1 tokens: 0 final, 1 non-final
✅ [TOKENS SENT] Forwarded 1 tokens to browser

🎯 [SONIOX TOKENS] Received 2 tokens: 1 final, 1 non-final  
✅ [TOKENS SENT] Forwarded 2 tokens to browser
```

**Nếu Soniox batch cả câu (SAI):**
```
(chờ 5s...)
🎯 [SONIOX TOKENS] Received 4 tokens: 4 final, 0 non-final
✅ [TOKENS SENT] Forwarded 4 tokens to browser
```

### 4. Check Browser Console

**Mong đợi thấy:**
```
📨 [WEBSOCKET] Received message: {"event":"TOKENS"...
📝 [TOKENS] Received 1 tokens: Xin?
📝 [TOKENS] Received 2 tokens: Xin✓ chào?
```

## 🐛 Troubleshooting

**Nếu thấy "TOKENS BLOCKED":**
- Check UI có mở transcript page không
- Check `isLiveCall = true` trong console

**Nếu KHÔNG thấy log "SONIOX TOKENS":**
- Soniox config có `enable_endpoint_detection: true`?
- Nói một câu dài 10s thử xem

**Nếu backend OK nhưng UI không nhận:**
- Check Browser Console có `📨 [WEBSOCKET]` không
- Check `callId` có match không
