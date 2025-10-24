# Quick Start: UI ACK Feature

## 🚀 What Was Fixed

Frontend now sends **acknowledgments** when receiving transcripts, completing the **6-stage pipeline**:

```
1️⃣ Audio → 2️⃣ STT → 3️⃣ DB → 4️⃣ Edge → 5️⃣ Realtime → 6️⃣ UI ✅
```

---

## ⚡ Quick Commands

### Test Backend Endpoint
```bash
curl -X POST http://localhost:8080/api/v1/pipeline-log \
  -H "Content-Type: application/json" \
  -d '{"callId":"test-123","stage":"6️⃣ UI_RECEIVED","speaker":"Test","transcript":"Hello","metadata":{}}'
```

### Run Full Integration Test
```bash
./test-ui-ack-integration.sh
```

### Monitor Live ACKs
```bash
./check-ui-ack.sh
```

### View Latest Log
```bash
cat $(ls -t lma-websocket-transcriber-stack/source/app/debug-logs/pipeline-*.txt | head -1)
```

---

## 🔧 Troubleshooting

### No 6️⃣ events in log?

**1. Hard refresh browser**
```
Ctrl + Shift + R  (or Cmd + Shift + R on Mac)
```

**2. Check browser console**
```
F12 → Console tab
Look for: "✅ Sent transcript ACK"
```

**3. Restart frontend**
```bash
cd lma-ai-stack/source/ui
pkill -f "react-scripts"
npm start
```

**4. Verify backend running**
```bash
curl http://localhost:8080/health/check
```

---

## 📍 Important Files

- **Frontend:** `lma-ai-stack/source/ui/src/hooks/use-calls-supabase-api.js`
- **Backend:** `lma-websocket-transcriber-stack/source/app/src/index.ts`
- **Logs:** `lma-websocket-transcriber-stack/source/app/debug-logs/pipeline-*.txt`
- **Tests:** `./test-ui-ack-integration.sh`
- **Monitor:** `./check-ui-ack.sh`

---

## 🎯 What to Expect

When you start a meeting and speak:

1. **Browser Console** shows:
   ```
   ✅ Sent transcript ACK to backend: segment_xxx
   ```

2. **Log file** contains:
   ```
   [+37.554s]   6️⃣ UI_RECEIVED    | Speaker: John Doe
                                    └─ Text: "Your transcript here"
   ```

3. **Complete pipeline** visible from audio → UI

---

## 📚 Full Documentation

See: `docs/UI_ACK_IMPLEMENTATION_SUMMARY.md`
