# Amazon Transcribe Live Meeting Assistant - Audio Streaming Architecture

## Tổng quan

Hệ thống sử dụng **real-time streaming architecture** để truyền audio từ browser đến Amazon Transcribe để chuyển đổi giọng nói thành văn bản (Speech-to-Text).

---

## 1. Client-side: Audio Capture 🎤

### Web Audio API

```javascript
// Tạo AudioContext với sample rate 8000 Hz
audioContext = new AudioContext({ sampleRate: 8000 });

// Capture audio từ tab browser (người khác trong meeting)
displayStream = await navigator.mediaDevices.getDisplayMedia({
  preferCurrentTab: true,
  video: true,
  audio: {
    noiseSuppression: true,
    autoGainControl: true,
    echoCancellation: true,
  }
});

// Capture audio từ microphone (người dùng)
micStream = await navigator.mediaDevices.getUserMedia({
  video: false,
  audio: {
    noiseSuppression: true,
    autoGainControl: true,
    echoCancellation: true,
  }
});
```

### Audio Processing Pipeline

1. **Convert to Mono**: Mỗi stream được chuyển từ stereo → mono
   ```javascript
   const convertToMono = (audioSource) => {
     const splitter = audioContext.createChannelSplitter(2);
     const merger = audioContext.createChannelMerger(1);
     audioSource.connect(splitter);
     splitter.connect(merger, 0, 0);
     splitter.connect(merger, 1, 0);
     return merger;
   };
   ```

2. **Channel Merging**: Kết hợp 2 mono streams thành 1 stereo stream
   - **Channel 0**: Microphone audio (CALLER)
   - **Channel 1**: Display audio (AGENT)
   
   ```javascript
   let channelMerger = audioContext.createChannelMerger(2);
   monoMicSource.connect(channelMerger, 0, 0);
   monoDisplaySource.connect(channelMerger, 0, 1);
   ```

3. **AudioWorklet Processing**: Xử lý audio trong separate thread để tránh blocking main thread

---

## 2. Audio Encoding: PCM 16-bit 🔧

### PCM Encoding Function

```javascript
const pcmEncode = (input) => {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    // 16-bit signed integer encoding
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
};
```

### Thông số Audio

| Thông số | Giá trị |
|----------|---------|
| **Format** | PCM (Pulse Code Modulation) |
| **Bit depth** | 16-bit signed integer |
| **Sample rate** | 8000 Hz |
| **Channels** | 2 (stereo) |
| **Encoding** | Little-endian |

---

## 3. Transport Layer: WebSocket Streaming 🌐

### Client Side (Browser Extension)

```javascript
// Kết nối WebSocket với authentication
const { sendMessage } = useWebSocket(settings.wssEndpoint, {
  queryParams: {
    authorization: `Bearer ${user.access_token}`,
    id_token: `${user.id_token}`,
    refresh_token: `${user.refresh_token}`
  }
});

// Gửi binary audio data
audioProcessor.port.onmessage = async (event) => {
  let base64AudioData = await bytesToBase64DataUrl(event.data);
  let payload = { action: "AudioData", audio: base64AudioData };
  chrome.runtime.sendMessage(payload);
};

// Browser extension forward to WebSocket
const audioData = await dataUrlToBytes(request.audio, muted, paused);
sendMessage(audioData); // Binary message
```

### Server Side (AWS Fargate)

```javascript
// WebSocket server endpoint
server.get('/api/v1/ws', { websocket: true }, (connection, request) => {
  registerHandlers(clientIP, connection.socket, request);
});

// Xử lý binary audio messages
ws.on('message', async (data: WebSocket.RawData) => {
  if (data instanceof Buffer) {
    // Binary audio data
    socketData.audioInputStream.write(data);
    socketData.writeRecordingStream.write(data);
    socketData.recordingFileSize += data.length;
  } else {
    // Text metadata (START, END, SPEAKER_CHANGE)
    const callMetaData = JSON.parse(data.toString());
  }
});
```

---

## 4. Amazon Transcribe Integration ☁️

### Streaming to Transcribe

```javascript
// Initialize Transcribe client
const transcribeClient = new TranscribeStreamingClient({ 
  region: AWS_REGION 
});

// Async generator để stream audio chunks
const transcribeInput = async function* () {
  if (isTCAEnabled) {
    // Channel configuration cho Call Analytics
    const configuration_event = {
      ChannelDefinitions: [
        { ChannelId: 0, ParticipantRole: 'CUSTOMER' },
        { ChannelId: 1, ParticipantRole: 'AGENT' }
      ]
    };
    yield { ConfigurationEvent: configuration_event };
  }
  
  // Stream audio chunks
  for await (const chunk of audioInputStream) {
    yield { AudioEvent: { AudioChunk: chunk } };
  }
};

// Start streaming transcription
const response = await transcribeClient.send(
  new StartStreamTranscriptionCommand({
    MediaSampleRateHertz: callMetaData.samplingRate, // 8000
    MediaEncoding: 'pcm',
    AudioStream: transcribeInput(),
    LanguageCode: 'en-US', // hoặc identify-language
    EnableChannelIdentification: true,
    NumberOfChannels: 2,
    ShowSpeakerLabel: true
  })
);
```

### Nhận Transcription Results

```javascript
// Stream results từ Transcribe
const outputTranscriptStream = response.TranscriptResultStream;
const tsStream = stream.Readable.from(outputTranscriptStream);

// Process từng event
for await (const event of tsStream) {
  if (event.TranscriptEvent) {
    await writeTranscriptionSegment(
      event.TranscriptEvent,
      callMetaData,
      server
    );
  }
}
```

### Ghi vào Kinesis Data Streams

```javascript
const writeTranscriptionSegment = async (transcribeEvent, callMetadata) => {
  const kdsObject = {
    EventType: 'ADD_TRANSCRIPT_SEGMENT',
    CallId: callMetadata.callId,
    Channel: result.ChannelId === 'ch_0' ? 'CALLER' : 'AGENT',
    SegmentId: segment.SegmentId,
    StartTime: segment.StartTime,
    EndTime: segment.EndTime,
    Transcript: segment.Transcript,
    IsPartial: result.IsPartial,
    Speaker: segment.Speaker,
    // ... tokens
  };

  const putParams = {
    StreamName: kdsStreamName,
    PartitionKey: callMetadata.callId,
    Data: Buffer.from(JSON.stringify(kdsObject)),
  };

  await kinesisClient.send(new PutRecordCommand(putParams));
};
```

---

## 5. Output Pipeline 📤

```
Transcription Results (Amazon Transcribe)
  ↓
Kinesis Data Streams
  ↓
Lambda Function (Call Event Processor)
  ↓
DynamoDB (Persistent Storage) + AppSync (GraphQL API)
  ↓
CloudFront + S3 (Web UI)
  ↓
Real-time UI Updates (GraphQL Subscriptions)
```

### Event Types

- `START`: Bắt đầu cuộc gọi
- `ADD_TRANSCRIPT_SEGMENT`: Transcript segment mới
- `SPEAKER_CHANGE`: Thay đổi người nói
- `END`: Kết thúc cuộc gọi
- `ADD_S3_RECORDING_URL`: URL recording file

---

## 6. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                         │
├─────────────────────────────────────────────────────────────┤
│  Meeting App (Zoom/Teams/Meet/WebEx)                        │
│           ↓                          ↓                       │
│   Tab Audio (getDisplayMedia)    Microphone (getUserMedia)  │
│           ↓                          ↓                       │
│  Web Audio API (AudioContext @ 8kHz)                        │
│           ↓                          ↓                       │
│   Convert to Mono              Convert to Mono              │
│           └──────────┬──────────────┘                        │
│                 Channel Merger                               │
│                      ↓                                       │
│              AudioWorklet Processing                         │
│                      ↓                                       │
│              PCM 16-bit Encoding                             │
│                      ↓                                       │
│         Browser Extension (Chrome)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket (Binary + Metadata)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              AWS FARGATE (WebSocket Server)                 │
├─────────────────────────────────────────────────────────────┤
│  • JWT Authentication                                        │
│  • Binary audio stream buffering                            │
│  • S3 recording (optional)                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/2 Stream
                       ↓
┌─────────────────────────────────────────────────────────────┐
│           AMAZON TRANSCRIBE (Streaming API)                 │
├─────────────────────────────────────────────────────────────┤
│  • Real-time Speech Recognition                             │
│  • Channel identification (2 speakers)                      │
│  • Language detection                                       │
│  • PII redaction (optional)                                 │
│  • Custom vocabulary support                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ Transcription Events
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              KINESIS DATA STREAMS                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│        AWS LAMBDA (Call Event Processor)                    │
├─────────────────────────────────────────────────────────────┤
│  • Process transcript segments                              │
│  • Bedrock LLM integration (summaries)                      │
│  • Meeting assist bot                                       │
│  • Translation (Amazon Translate)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│         DynamoDB + AppSync (GraphQL)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ GraphQL Subscriptions
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              WEB UI (CloudFront + S3)                       │
│  • Real-time transcript display                             │
│  • Translation                                              │
│  • Meeting assistant chat                                   │
│  • Summaries & action items                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Các tính năng nâng cao

### Language Detection
```javascript
tsParams.IdentifyLanguage = true;
tsParams.LanguageOptions = 'en-US,es-US,fr-FR'; // Danh sách ngôn ngữ
tsParams.PreferredLanguage = 'en-US'; // Ngôn ngữ ưu tiên
```

### PII Redaction
```javascript
tsParams.ContentRedactionType = 'PII';
tsParams.PiiEntityTypes = 'NAME,ADDRESS,CREDIT_DEBIT_NUMBER,SSN';
```

### Custom Vocabulary
```javascript
tsParams.VocabularyName = CUSTOM_VOCABULARY_NAME;
tsParams.LanguageModelName = CUSTOM_LANGUAGE_MODEL_NAME;
```

### Retry Mechanism
```javascript
// Tự động retry khi streaming bị disconnect
const startTranscribeSession = async (retryCount = 0) => {
  if (retryCount >= MAX_RETRIES) {
    server.log.error('Max retries reached');
    return;
  }
  try {
    // ... start transcription
  } catch (error) {
    await startTranscribeSession(retryCount + 1);
  }
};
```

---

## 8. Performance & Latency

### Latency Breakdown

| Giai đoạn | Latency |
|-----------|---------|
| Audio capture → WebSocket | ~10-50ms |
| WebSocket → Fargate | ~50-100ms |
| Fargate → Transcribe | ~100-300ms |
| Transcribe processing | ~500-1500ms |
| Kinesis → Lambda → AppSync | ~100-300ms |
| **Total end-to-end** | **~2-3 seconds** |

### Throughput
- **Concurrent meetings**: Giới hạn bởi Transcribe quota (default 25 concurrent streams)
- **Audio bitrate**: 8000 Hz × 16-bit × 2 channels = 256 kbps
- **Network bandwidth**: ~30 KB/s per meeting

---

## 9. Key Technologies Summary

| Layer | Technology |
|-------|------------|
| **Audio Capture** | Web Audio API (getDisplayMedia, getUserMedia) |
| **Audio Processing** | AudioWorklet, AudioContext |
| **Encoding** | PCM 16-bit little-endian |
| **Transport** | WebSocket (Binary streaming) |
| **Server** | AWS Fargate (Docker container) |
| **Speech-to-Text** | Amazon Transcribe Streaming |
| **Event Streaming** | Kinesis Data Streams |
| **Processing** | AWS Lambda |
| **Storage** | DynamoDB, S3 |
| **API** | AWS AppSync (GraphQL) |
| **Frontend** | React, CloudFront |

---

## 10. Code References

### Key Files

```
lma-browser-extension-stack/
  ├── public/content_scripts/recorder/
  │   ├── recorder.js              # Audio capture & streaming
  │   └── audio-worklet.js         # Audio processing
  └── src/context/
      └── ProviderIntegrationContext.tsx  # WebSocket integration

lma-websocket-transcriber-stack/
  └── source/app/src/
      ├── index.ts                 # WebSocket server
      └── calleventdata/
          └── transcribe.ts        # Transcribe integration
```

---

## Kết luận

Hệ thống sử dụng **full-duplex streaming architecture** với:
- ✅ **Real-time audio capture** từ browser
- ✅ **Low-latency WebSocket transport** (binary streaming)
- ✅ **PCM encoding** cho raw audio quality
- ✅ **AWS Transcribe HTTP/2 streaming** với async generators
- ✅ **Event-driven processing** qua Kinesis + Lambda
- ✅ **Real-time UI updates** qua GraphQL subscriptions

Latency trung bình **2-3 giây** từ speech → text hiển thị trên UI.
