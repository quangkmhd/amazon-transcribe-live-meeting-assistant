# Phân tích lỗi

## Lỗi hiện tại

```
INFO: closed incoming websocket connection for path with no websocket handler
path: "/?authorization=Bearer%20..."
```

## Nguyên nhân

Frontend đang connect tới **`/`** thay vì **`/api/v1/ws`**

Server chỉ có route:
- ✅ `/api/v1/ws` (GET) - WebSocket handler
- ✅ `/health/check` (GET)
- ❌ `/` - KHÔNG có handler

## Giải pháp

Frontend phải connect tới: `ws://127.0.0.1:8080/api/v1/ws`
