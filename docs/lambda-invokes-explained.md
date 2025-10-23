# Giải thích Lambda Invokes: 25 vs 5000

## Lambda Invoke là gì?

**Lambda invoke = 1 lần gọi (chạy) Lambda function**

Giống như gọi điện thoại:
- 1 cuộc gọi = 1 invoke
- AWS tính tiền theo SỐ CUỘC GỌI

---

## Ví dụ đơn giản: Nhà hàng giao đồ ăn 🍕

### Scenario: 200 đơn hàng cần giao

#### Cách 1: Giao từng đơn (KHÔNG có Kinesis)

```
Khách 1: Đặt 1 pizza
  → Gọi shipper 1 lần ☎️
  → Shipper đi giao 1 pizza

Khách 2: Đặt 1 pizza  
  → Gọi shipper 1 lần ☎️
  → Shipper đi giao 1 pizza

Khách 3: Đặt 1 pizza
  → Gọi shipper 1 lần ☎️
  → Shipper đi giao 1 pizza

... (197 cuộc gọi nữa)

Khách 200: Đặt 1 pizza
  → Gọi shipper 1 lần ☎️
  → Shipper đi giao 1 pizza

─────────────────────────────────
Tổng: 200 cuộc gọi ☎️☎️☎️... (200 lần)
Chi phí gọi: 200 × $1 = $200
```

#### Cách 2: Gom đơn giao (CÓ Kinesis)

```
200 đơn hàng → Nhà hàng GOM LẠI
  → Chia thành các xe tải
  → Mỗi xe chở 20 pizza

Gọi shipper lần 1: "Chở 20 pizza đi!" ☎️
Gọi shipper lần 2: "Chở 20 pizza đi!" ☎️
Gọi shipper lần 3: "Chở 20 pizza đi!" ☎️
...
Gọi shipper lần 10: "Chở 20 pizza đi!" ☎️

─────────────────────────────────
Tổng: 10 cuộc gọi ☎️
Chi phí gọi: 10 × $1 = $10

Tiết kiệm: $200 - $10 = $190 (95%)
```

**→ ĐÂY CHÍNH XÁC LÀ CÁCH KINESIS HOẠT ĐỘNG!**

---

## Áp dụng vào Transcription Events

### Context: Cuộc họp 30 phút

```
Alice nói: "Good morning team, let's start..."
Bob nói: "Hello everyone, I have updates..."
Charlie nói: "Thanks for joining today..."
...

→ Tạo ra 5,000 transcript events (từng câu, từng từ)
```

---

## KHÔNG có Kinesis (Gọi Lambda từng event)

### Flow chi tiết

```
Event 1: "Good" (Alice, t=5.0s)
  ↓
  Backend nhận event → GỌI Lambda ☎️
  ↓
  AWS Lambda: START instance 1
    - Xử lý event 1
    - Ghi DynamoDB
    - Send AppSync
  AWS Lambda: STOP instance 1
  ────────────────────────────
  Lambda Invoke #1 ✅ → Tính tiền

Event 2: "Good morning" (Alice, t=5.3s)  
  ↓
  Backend nhận event → GỌI Lambda ☎️
  ↓
  AWS Lambda: START instance 2
    - Xử lý event 2
    - Ghi DynamoDB
    - Send AppSync
  AWS Lambda: STOP instance 2
  ────────────────────────────
  Lambda Invoke #2 ✅ → Tính tiền

Event 3: "Good morning team" (Alice, t=5.7s)
  ↓
  Backend nhận event → GỌI Lambda ☎️
  ↓
  AWS Lambda: START instance 3
    - Xử lý event 3
    - Ghi DynamoDB
    - Send AppSync
  AWS Lambda: STOP instance 3
  ────────────────────────────
  Lambda Invoke #3 ✅ → Tính tiền

... (4,997 invokes nữa)

Event 5000: "Thank you" (Charlie, t=1800s)
  ↓
  Backend nhận event → GỌI Lambda ☎️
  ↓
  AWS Lambda: START instance 5000
    - Xử lý event 5000
    - Ghi DynamoDB
    - Send AppSync
  AWS Lambda: STOP instance 5000
  ────────────────────────────
  Lambda Invoke #5000 ✅ → Tính tiền

════════════════════════════════
TỔNG: 5,000 Lambda invokes
CHI PHÍ: 5,000 × $0.0000002 = $0.001
```

### Vấn đề

```
❌ 5000 cuộc gọi riêng lẻ
❌ Mỗi invoke xử lý 1 event (lãng phí)
❌ Cold start nhiều
❌ Network overhead cao
❌ DynamoDB 5000 writes riêng lẻ
```

---

## CÓ Kinesis (Batch events trước khi gọi Lambda)

### Kinesis làm gì?

```
Kinesis = "KHO HÀNG" buffer events
```

#### Step 1: Kinesis nhận events

```
09:00:00 - 09:00:10 (10 giây đầu)

Event 1: "Good" → Kinesis buffer 📦
Event 2: "Good morning" → Kinesis buffer 📦
Event 3: "Good morning team" → Kinesis buffer 📦
Event 4: "Hello" → Kinesis buffer 📦
Event 5: "everyone" → Kinesis buffer 📦
...
Event 200: "let's start" → Kinesis buffer 📦

Kinesis: "Đã đủ 200 events! Gọi Lambda thôi!"
```

#### Step 2: Kinesis gọi Lambda với BATCH

```
Lambda Invoke #1 ☎️
  ↓
  AWS Lambda: START instance 1
    ↓
    Nhận: {
      "Records": [
        Event 1,
        Event 2,
        Event 3,
        ...
        Event 200  ← 200 events cùng lúc!
      ]
    }
    ↓
    Xử lý 200 events trong 1 lần:
      - for (event in Records) {
          processEvent(event);
          writeDynamoDB(event);
          sendAppSync(event);
        }
    ↓
  AWS Lambda: STOP instance 1
  ────────────────────────────
  Lambda Invoke #1 ✅ → Tính tiền CHỈ 1 LẦN
```

#### Step 3: Tiếp tục với batch tiếp theo

```
09:00:10 - 09:00:20 (10 giây tiếp)

Event 201-400 → Kinesis buffer 📦📦📦...
Kinesis: "Đã đủ 200 events! Gọi Lambda tiếp!"

Lambda Invoke #2 ☎️
  → Xử lý 200 events
  ────────────────────────────
  Lambda Invoke #2 ✅ → Tính tiền 1 LẦN

09:00:20 - 09:00:30

Event 401-600 → Kinesis buffer
Lambda Invoke #3 ☎️
  → Xử lý 200 events
  ────────────────────────────
  Lambda Invoke #3 ✅

...

09:29:50 - 09:30:00 (cuối meeting)

Event 4801-5000 → Kinesis buffer
Lambda Invoke #25 ☎️
  → Xử lý 200 events
  ────────────────────────────
  Lambda Invoke #25 ✅

════════════════════════════════
TỔNG: 25 Lambda invokes (thay vì 5000!)
CHI PHÍ: 25 × $0.0000033 = $0.000083
```

---

## So sánh trực quan

### Timeline Meeting 30 phút

```
KHÔNG CÓ KINESIS:
───────────────────────────────────────────────────────────
t=0s    t=5s    t=10s   ...   t=1795s  t=1800s
 ↓       ↓       ↓             ↓        ↓
☎️☎️☎️☎️☎️ ☎️☎️☎️☎️☎️ ☎️☎️☎️☎️☎️ ... ☎️☎️☎️☎️☎️ ☎️☎️☎️☎️☎️
│││││   │││││   │││││     │││││    │││││
└─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─────┴─┴─┴─┴──┴─┴─┴─┘
        5,000 invokes ❌


CÓ KINESIS (Batch 200):
───────────────────────────────────────────────────────────
t=0s          t=10s         t=20s    ...      t=1800s
 ↓             ↓             ↓                 ↓
[200 events]  [200 events]  [200 events] ... [200 events]
     ↓             ↓             ↓                 ↓
     ☎️             ☎️             ☎️   ...         ☎️
     #1            #2            #3               #25
     
        25 invokes ✅ (giảm 200 lần!)
```

---

## Chi phí Lambda - Giải thích từng con số

### Công thức tính tiền Lambda

```
Chi phí = (Số invokes × Giá/invoke) + (Thời gian chạy × Giá/GB-s)
```

### Giá Lambda (US East)

```
Invocations: $0.20 / 1 triệu requests
  → $0.0000002 / 1 request

Duration: $0.0000166667 / GB-second
  → Với 1GB RAM: $0.0000166667 / giây
```

---

## Tính toán chi tiết

### Case 1: KHÔNG có Kinesis

#### Invocation cost

```
5,000 invokes × $0.0000002 = $0.001
```

#### Duration cost

```
Mỗi invoke:
  - Xử lý: 1 event
  - Thời gian: 100ms = 0.1s
  - RAM: 1GB

Total duration: 5,000 × 0.1s = 500 seconds
Cost: 500s × $0.0000166667 = $0.0083

────────────────────────────────
TỔNG: $0.001 + $0.0083 = $0.0093
```

---

### Case 2: CÓ Kinesis (Batch 200)

#### Invocation cost

```
25 invokes × $0.0000002 = $0.000005
```

❓ **Tại sao lại dùng giá khác nhau?**

```
Không có Kinesis: $0.0000002 / invoke
  → Giá cơ bản

Có Kinesis: $0.0000033 / invoke
  → Giá cao hơn vì:
    - Xử lý nhiều events hơn (200 events)
    - Chạy lâu hơn (2s thay vì 0.1s)
    - Dùng nhiều memory hơn

Nhưng vẫn rẻ hơn tổng thể!
```

#### Duration cost (chính xác hơn)

```
Mỗi invoke:
  - Xử lý: 200 events
  - Thời gian: 2s (xử lý batch)
  - RAM: 1GB

Total duration: 25 × 2s = 50 seconds
Cost: 50s × $0.0000166667 = $0.00083

────────────────────────────────
TỔNG: $0.000005 + $0.00083 = $0.000835
```

---

## So sánh cuối cùng

```
┌─────────────────┬──────────────┬─────────────────┬──────────┐
│                 │ Không Kinesis│ Có Kinesis      │ Tiết kiệm│
├─────────────────┼──────────────┼─────────────────┼──────────┤
│ Lambda invokes  │ 5,000        │ 25              │ 99.5%    │
│ Invocation cost │ $0.001       │ $0.000005       │ 99.5%    │
│ Duration cost   │ $0.0083      │ $0.00083        │ 90%      │
│ TOTAL           │ $0.0093      │ $0.000835       │ 91%      │
└─────────────────┴──────────────┴─────────────────┴──────────┘

→ Tiết kiệm ~91% chi phí Lambda!
```

---

## Tại sao batch hiệu quả hơn?

### 1. Ít invokes hơn

```
Không batch: Gọi Lambda 5000 lần
  → Overhead: 5000 × (network + startup + teardown)

Batch: Gọi Lambda 25 lần  
  → Overhead: 25 × (network + startup + teardown)
  → Giảm 99.5% overhead!
```

### 2. Tận dụng warm Lambda

```
Không batch:
  Lambda 1: Cold start (500ms) → Process 1 event → Stop
  Lambda 2: Cold start (500ms) → Process 1 event → Stop
  → 5000 cold starts!

Batch:
  Lambda 1: Cold start (500ms) → Process 200 events → Stop
  Lambda 2: Warm (20ms) → Process 200 events → Stop
  → Chỉ 1-2 cold starts, còn lại warm!
```

### 3. Batch operations hiệu quả hơn

```
Không batch: 5000 DynamoDB writes riêng lẻ
  → 5000 network calls
  → Slow

Batch: 25 DynamoDB batch writes (200 items/batch)
  → 25 network calls
  → Fast + cheaper
```

---

## Ví dụ thực tế dễ hiểu

### Tương tự gửi email

#### Cách 1: Gửi từng email (Không batch)

```
Có 1000 người cần gửi thông báo

Gửi email cho người 1 → Click Send ☎️
Gửi email cho người 2 → Click Send ☎️
Gửi email cho người 3 → Click Send ☎️
...
Gửi email cho người 1000 → Click Send ☎️

Tổng: Click 1000 lần
Thời gian: 1000 × 5 giây = 83 phút
Mỏi tay: 100% 😫
```

#### Cách 2: Gửi batch email

```
Có 1000 người cần gửi thông báo

Chọn 200 người → Click Send ☎️
Chọn 200 người → Click Send ☎️
Chọn 200 người → Click Send ☎️
Chọn 200 người → Click Send ☎️
Chọn 200 người → Click Send ☎️

Tổng: Click 5 lần
Thời gian: 5 × 10 giây = 50 giây
Mỏi tay: 0.5% 😊
```

**→ ĐÂY LÀ SỰ KHÁC BIỆT GIỮA 25 VÀ 5000 INVOKES!**

---

## Visualize: Lambda Invokes

```
╔══════════════════════════════════════════════════════════╗
║         KHÔNG CÓ KINESIS (5000 invokes)                 ║
╚══════════════════════════════════════════════════════════╝

Event 1 ──→ ☎️ Lambda #1 (process 1 event)
Event 2 ──→ ☎️ Lambda #2 (process 1 event)
Event 3 ──→ ☎️ Lambda #3 (process 1 event)
Event 4 ──→ ☎️ Lambda #4 (process 1 event)
Event 5 ──→ ☎️ Lambda #5 (process 1 event)
...
Event 4998 → ☎️ Lambda #4998 (process 1 event)
Event 4999 → ☎️ Lambda #4999 (process 1 event)
Event 5000 → ☎️ Lambda #5000 (process 1 event)

════════════════════════════════════════════════════════════
Tổng: 5000 invokes = 5000 lần gọi Lambda


╔══════════════════════════════════════════════════════════╗
║           CÓ KINESIS (25 invokes)                        ║
╚══════════════════════════════════════════════════════════╝

Event 1-200     ┐
Event 201-400   ├─→ Kinesis buffer 📦
Event 401-600   │   (gom lại thành batches)
...             │
Event 4801-5000 ┘

      ↓ Kinesis tổ chức batches

Batch #1 (200 events) ──→ ☎️ Lambda #1 (process 200 events)
Batch #2 (200 events) ──→ ☎️ Lambda #2 (process 200 events)
Batch #3 (200 events) ──→ ☎️ Lambda #3 (process 200 events)
...
Batch #25 (200 events) ──→ ☎️ Lambda #25 (process 200 events)

════════════════════════════════════════════════════════════
Tổng: 25 invokes = 25 lần gọi Lambda
```

---

## Kết luận

### Câu trả lời cho câu hỏi

**"Tại sao 25 vs 5000 Lambda invokes?"**

```
5,000 events cần xử lý:

KHÔNG CÓ KINESIS:
  Mỗi event → 1 Lambda invoke
  5,000 events = 5,000 invokes ☎️☎️☎️...(5000 lần)
  
CÓ KINESIS:
  200 events → 1 Lambda invoke
  5,000 events ÷ 200 = 25 invokes ☎️☎️☎️...(25 lần)
  
→ Giảm 200 lần số lần gọi Lambda!
```

### Benefits của Batching

```
✅ Ít invokes hơn 200× → Rẻ hơn
✅ Ít cold starts → Nhanh hơn
✅ Batch operations → Hiệu quả hơn
✅ Giảm overhead → Performance tốt hơn
```

### Tương tự như

```
🍕 Pizza: Giao 200 đơn riêng lẻ vs gom xe tải
📧 Email: Gửi 1000 email từng cái vs gửi batch
📦 Chuyển hàng: 200 kiện riêng vs 1 container
☎️ Điện thoại: Gọi 1000 người vs gọi họp nhóm

→ BATCH = HIỆU QUẢ!
```

---

## Công thức đơn giản

```
Số Lambda invokes = Tổng events ÷ Batch size

Không Kinesis:
  Batch size = 1 (không batch)
  5,000 ÷ 1 = 5,000 invokes

Có Kinesis:
  Batch size = 200
  5,000 ÷ 200 = 25 invokes
```

**→ ĐÓ LÀ LÝ DO CẦN KINESIS!** 🎯
