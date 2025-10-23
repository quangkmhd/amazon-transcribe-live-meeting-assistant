# Kinesis Data Streams Flow - Ví dụ Chi tiết

## Ví dụ: Cuộc họp "Daily Standup - 2025-01-22 09:00"

**Participants:**
- Alice (Microphone - Channel 0)
- Bob (Display audio - Channel 1)

---

## BƯỚC 1: Transcribe → Kinesis (Write Events)

### Timeline: 09:00:05 - Alice nói "Good morning team"

Transcribe streaming phát ra **nhiều events nhỏ lẻ** theo thời gian thực:

```javascript
// Event 1 - Partial result (09:00:05.100)
{
  "EventType": "ADD_TRANSCRIPT_SEGMENT",
  "CallId": "Daily Standup - 2025-01-22 09:00",
  "Channel": "CALLER",
  "SegmentId": "Alice-5.0-ch_0",
  "StartTime": 5.0,
  "EndTime": 5.2,
  "Transcript": "Good",
  "IsPartial": true,  // ← Chưa chắc chắn
  "Speaker": "Alice"
}

// Event 2 - Partial result (09:00:05.300)
{
  "EventType": "ADD_TRANSCRIPT_SEGMENT",
  "CallId": "Daily Standup - 2025-01-22 09:00",
  "Channel": "CALLER",
  "SegmentId": "Alice-5.0-ch_0",
  "StartTime": 5.0,
  "EndTime": 5.5,
  "Transcript": "Good morning",
  "IsPartial": true,
  "Speaker": "Alice"
}

// Event 3 - Final result (09:00:05.700)
{
  "EventType": "ADD_TRANSCRIPT_SEGMENT",
  "CallId": "Daily Standup - 2025-01-22 09:00",
  "Channel": "CALLER",
  "SegmentId": "Alice-5.0-ch_0",
  "StartTime": 5.0,
  "EndTime": 6.2,
  "Transcript": "Good morning team",
  "IsPartial": false,  // ← Final result
  "Speaker": "Alice",
  "CreatedAt": "2025-01-22T09:00:05.700Z"
}
```

### WebSocket Server ghi vào Kinesis

```javascript
// File: transcribe.ts - writeTranscriptionSegment()

// Mỗi event được ghi RIÊNG LẺ vào Kinesis
const putParams = {
  StreamName: 'LMA-CallDataStream',
  PartitionKey: 'Daily Standup - 2025-01-22 09:00',  // ← Quan trọng!
  Data: Buffer.from(JSON.stringify({
    EventType: 'ADD_TRANSCRIPT_SEGMENT',
    Transcript: 'Good morning team',
    IsPartial: false,
    // ... full event data
  }))
};

await kinesisClient.send(new PutRecordCommand(putParams));
// ✅ Ghi THÀNH CÔNG - event được lưu trong Kinesis
```

---

## BƯỚC 2: Kinesis Buffer & Batch (Vai trò chính)

### Kinesis nhận liên tục nhiều events

**09:00:05 → 09:00:15 (10 giây đầu meeting):**

```
Kinesis Stream: LMA-CallDataStream
Shard: shardId-000000000000

┌─────────────────────────────────────────────────┐
│  BUFFERED EVENTS (Partition: Daily Standup...) │
├─────────────────────────────────────────────────┤
│  Event 001: ADD_TRANSCRIPT_SEGMENT (Alice)      │
│  Event 002: ADD_TRANSCRIPT_SEGMENT (Alice)      │
│  Event 003: ADD_TRANSCRIPT_SEGMENT (Alice)      │
│  Event 004: SPEAKER_CHANGE (Bob)                │
│  Event 005: ADD_TRANSCRIPT_SEGMENT (Bob)        │
│  Event 006: ADD_TRANSCRIPT_SEGMENT (Bob)        │
│  Event 007: ADD_TRANSCRIPT_SEGMENT (Bob)        │
│  Event 008: SPEAKER_CHANGE (Alice)              │
│  Event 009: ADD_TRANSCRIPT_SEGMENT (Alice)      │
│  ...
│  Event 198: ADD_TRANSCRIPT_SEGMENT (Bob)        │
│  Event 199: ADD_TRANSCRIPT_SEGMENT (Alice)      │
│  Event 200: ADD_TRANSCRIPT_SEGMENT (Alice)      │ ← Đạt BatchSize
└─────────────────────────────────────────────────┘
```

### Kinesis tự động tạo Batch

```yaml
# Configuration từ lma-ai-stack.yaml
Events:
  TranscriptKds:
    Type: Kinesis
    Properties:
      BatchSize: 200                    # ← Thu thập 200 events
      MaximumBatchingWindowInSeconds: 0 # ← Gửi ngay khi đủ 200
      ParallelizationFactor: 10         # ← 10 Lambda instances đồng thời
      StartingPosition: LATEST
```

**Kinesis tạo batch:**

```json
{
  "Records": [
    {
      "kinesis": {
        "sequenceNumber": "49625706758465165165165001",
        "partitionKey": "Daily Standup - 2025-01-22 09:00",
        "data": "eyJFdmVudFR5cGUiOiJBRERfVFJBTlNDUklQVF9TRUdNRU5UIi...",
        "approximateArrivalTimestamp": 1737536405.700
      },
      "eventSource": "aws:kinesis"
    },
    // ... 199 records nữa
  ]
}
```

---

## BƯỚC 3: Kinesis → Lambda (Invoke with Batch)

### Lambda được invoke với 200 events cùng lúc

```python
# File: lambda_function.py - Call Event Processor

@LOGGER.inject_lambda_context
def handler(event, context: LambdaContext):
    """
    event = {
      "Records": [
        { /* Event 1 */ },
        { /* Event 2 */ },
        ...
        { /* Event 200 */ }
      ]
    }
    """
    
    LOGGER.debug(f"Received batch of {len(event['Records'])} records")
    # Output: Received batch of 200 records
    
    # Xử lý BATCH
    event_processor_results = EVENT_LOOP.run_until_complete(
        process_event(event=event)
    )
    
    return
```

### Lambda xử lý batch hiệu quả

```python
# File: transcript_batch_processor.py

async def handle_event(self, event):
    """Xử lý cả batch 200 records"""
    
    records = event.get('Records', [])
    
    for record in records:
        # Decode từng record
        data = base64.b64decode(record['kinesis']['data'])
        call_event = json.loads(data)
        
        if call_event['EventType'] == 'ADD_TRANSCRIPT_SEGMENT':
            await self._process_transcript_segment(call_event)
        elif call_event['EventType'] == 'SPEAKER_CHANGE':
            await self._process_speaker_change(call_event)
        elif call_event['EventType'] == 'START':
            await self._process_call_start(call_event)
        elif call_event['EventType'] == 'END':
            await self._process_call_end(call_event)
```

### Lambda thực hiện enrichment

```python
async def _process_transcript_segment(self, segment):
    """Xử lý 1 transcript segment"""
    
    # 1. Sentiment Analysis (nếu enabled)
    if IS_SENTIMENT_ANALYSIS_ENABLED:
        sentiment = await comprehend_client.detect_sentiment(
            Text=segment['Transcript'],
            LanguageCode='en'
        )
        segment['Sentiment'] = sentiment['Sentiment']  # POSITIVE/NEGATIVE/NEUTRAL
    
    # 2. Check wake phrase (trigger assistant)
    if SETTINGS['AssistantWakePhraseRegEx'].match(segment['Transcript']):
        # "OK Assistant" detected!
        await self._trigger_agent_assist(segment)
    
    # 3. Category alert check
    if SETTINGS['AlertRegEx'].match(segment['Transcript']):
        # Sensitive keyword detected!
        await self._send_sns_alert(segment)
    
    # 4. Store to DynamoDB
    await self._write_to_dynamodb(segment)
    
    # 5. Send real-time update via AppSync
    await self._send_appsync_mutation(segment)
```

---

## BƯỚC 4: Lambda → AppSync → Web UI

### Lambda gọi AppSync GraphQL Mutation

```python
# File: event_processor/execute_process_event_api_mutation.py

async def execute_process_event_api_mutation(
    appsync_client, 
    call_event
):
    """Gửi update đến AppSync"""
    
    mutation = """
    mutation AddTranscriptSegment(
      $CallId: ID!
      $SegmentId: String!
      $Transcript: String!
      $Speaker: String!
      $Sentiment: String
    ) {
      addTranscriptSegment(
        CallId: $CallId
        SegmentId: $SegmentId
        Transcript: $Transcript
        Speaker: $Speaker
        Sentiment: $Sentiment
      ) {
        CallId
        SegmentId
        Transcript
        CreatedAt
      }
    }
    """
    
    variables = {
        'CallId': call_event['CallId'],
        'SegmentId': call_event['SegmentId'],
        'Transcript': call_event['Transcript'],
        'Speaker': call_event['Speaker'],
        'Sentiment': call_event.get('Sentiment', 'NEUTRAL')
    }
    
    # Gọi AppSync GraphQL API
    result = await appsync_client.execute(
        mutation=mutation,
        variables=variables
    )
    
    # ✅ AppSync nhận mutation
```

### AppSync broadcast đến Web UI (GraphQL Subscription)

```graphql
# Web UI subscribe to real-time updates

subscription OnTranscriptSegmentAdded($CallId: ID!) {
  onTranscriptSegmentAdded(CallId: $CallId) {
    CallId
    SegmentId
    StartTime
    EndTime
    Transcript
    Speaker
    Sentiment
    IsPartial
    CreatedAt
  }
}
```

### Web UI nhận real-time update

```typescript
// Web UI code (React)

useEffect(() => {
  const subscription = API.graphql(
    graphqlOperation(onTranscriptSegmentAdded, {
      CallId: "Daily Standup - 2025-01-22 09:00"
    })
  ).subscribe({
    next: ({ value }) => {
      const segment = value.data.onTranscriptSegmentAdded;
      
      console.log('New transcript segment:', segment);
      // {
      //   CallId: "Daily Standup - 2025-01-22 09:00",
      //   Transcript: "Good morning team",
      //   Speaker: "Alice",
      //   Sentiment: "POSITIVE",
      //   StartTime: 5.0,
      //   EndTime: 6.2,
      //   IsPartial: false
      // }
      
      // Update UI
      setTranscriptSegments(prev => [...prev, segment]);
    }
  });
  
  return () => subscription.unsubscribe();
}, []);
```

### UI hiển thị transcript

```
┌──────────────────────────────────────────────────┐
│  Daily Standup - 2025-01-22 09:00               │
├──────────────────────────────────────────────────┤
│  [09:00:05] Alice: Good morning team  😊 POSITIVE│
│  [09:00:08] Bob: Hello everyone  😊 POSITIVE     │
│  [09:00:12] Alice: Let's start with updates      │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

---

## SO SÁNH: Có vs Không có Kinesis

### ❌ KHÔNG CÓ KINESIS (Gọi Lambda trực tiếp)

**Timeline cho câu "Good morning team":**

```
09:00:05.100 - Event 1 (Partial: "Good")
  → Transcribe Server gọi Lambda
  → Lambda start (cold start 500ms)
  → Process 1 event
  → Lambda end
  Cost: 1 invoke

09:00:05.300 - Event 2 (Partial: "Good morning")  
  → Transcribe Server gọi Lambda
  → Lambda start (cold start 500ms)
  → Process 1 event
  → Lambda end
  Cost: 1 invoke

09:00:05.700 - Event 3 (Final: "Good morning team")
  → Transcribe Server gọi Lambda
  → Lambda start
  → Process 1 event
  → Lambda end
  Cost: 1 invoke

Total: 3 Lambda invokes cho 1 câu nói
```

**Vấn đề:**
- 🔴 Transcribe server phải **đợi** Lambda response → slow
- 🔴 Lambda bị **cold start** liên tục → latency cao
- 🔴 **3 invokes** cho 1 câu → chi phí cao × 1000
- 🔴 Nếu Lambda fail → **mất event**, không retry

---

### ✅ CÓ KINESIS (Batch processing)

**Timeline:**

```
09:00:05 - 09:00:15 (10 giây)
  → Transcribe ghi 200 events vào Kinesis
  → Transcribe server KHÔNG BỊ BLOCK
  → Kinesis buffer events

09:00:15 - Kinesis tự động trigger Lambda
  → Lambda nhận batch 200 events
  → Process tất cả cùng lúc
  → Write bulk to DynamoDB/AppSync
  
Total: 1 Lambda invoke cho 200 events
```

**Lợi ích:**
- ✅ Transcribe server **không block** → fast
- ✅ Lambda **warm** (được gọi thường xuyên) → low latency  
- ✅ **1 invoke** cho 200 events → chi phí thấp ÷ 200
- ✅ Kinesis **retry** tự động nếu Lambda fail
- ✅ **Ordering guaranteed** theo PartitionKey

---

## Detailed Flow với Metrics

### Ví dụ: Meeting 30 phút với 2 người

**Transcribe Output:**
```
5,000 transcript events (partial + final)
+ 50 speaker change events
+ 2 call control events (START/END)
= 5,052 total events
```

### ❌ Không có Kinesis

```
Lambda Invokes:     5,052 invokes
Lambda Duration:    100ms/invoke × 5,052 = 8.4 minutes compute
Lambda Cost:        5,052 × $0.0000002 = $0.001
DynamoDB:           5,052 individual writes (slow)
Latency:            High (cold starts, network overhead)
Risk:               High (no retry, events can be lost)
```

### ✅ Có Kinesis

```
Kinesis Events:     5,052 events written
Kinesis Batches:    5,052 ÷ 200 = 26 batches
Lambda Invokes:     26 invokes
Lambda Duration:    2s/invoke × 26 = 52 seconds compute
Lambda Cost:        26 × $0.0000033 = $0.000086
DynamoDB:           26 batch writes (fast)
Kinesis Cost:       5,052 units = $0.000007
Latency:            Low (warm Lambda, batch operations)
Risk:               Low (retry, durability, ordering)

TOTAL COST:         $0.000093 (vs $0.001 = 90% cheaper!)
```

---

## TÓM TẮT VAI TRÒ KINESIS

### Kinesis là "Buffer & Orchestrator" thông minh

```
┌─────────────────────────────────────────────────────┐
│         KINESIS DATA STREAMS                        │
├─────────────────────────────────────────────────────┤
│  1. 📥 NHẬN events nhỏ lẻ từ Transcribe            │
│     - Ghi nhanh, không block Transcribe             │
│     - Partition theo CallId (guarantee ordering)    │
│                                                      │
│  2. 🗃️ BUFFER trong 24 giờ                         │
│     - Độ tin cậy cao (không mất data)              │
│     - Có thể replay nếu cần                         │
│                                                      │
│  3. 📦 BATCH 200 events thành 1 lô                 │
│     - Giảm số lần gọi Lambda (÷200)                 │
│     - Efficient processing                          │
│                                                      │
│  4. ⚡ PARALLEL processing 10 Lambda instances     │
│     - Mỗi meeting 1 partition                       │
│     - Scale tự động theo load                       │
│                                                      │
│  5. 🔄 RETRY tự động khi Lambda fail               │
│     - BisectBatchOnFunctionError                    │
│     - MaximumRetryAttempts: 2                       │
│                                                      │
│  6. 📊 GUARANTEE thứ tự events                     │
│     - Cùng PartitionKey = same order                │
│     - Quan trọng cho transcript timeline            │
└─────────────────────────────────────────────────────┘
```

---

## Kết luận

**Kinesis Data Streams đóng vai trò:**

1. **Decoupling**: Tách biệt Transcribe ↔ Lambda → không block nhau
2. **Batching**: 200 events → 1 Lambda invoke → tiết kiệm 90% cost
3. **Reliability**: Auto retry, data retention 24h
4. **Ordering**: Guarantee thứ tự events theo CallId
5. **Scalability**: Parallel processing nhiều meetings
6. **Performance**: Reduce Lambda cold starts, batch operations

**→ Không thể thiếu trong production system!** 🎯
