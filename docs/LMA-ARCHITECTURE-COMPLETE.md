# Live Meeting Assistant (LMA) - Complete Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Complete Data Flow](#complete-data-flow)
3. [Database Schema](#database-schema)
4. [Backend Components](#backend-components)
5. [Frontend Components](#frontend-components)
6. [GraphQL API Structure](#graphql-api-structure)
7. [Authentication & Authorization](#authentication--authorization)
8. [Migration Mapping: AWS to Soniox/Supabase](#migration-mapping-aws-to-sonioxsupabase)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER EXTENSION                           │
│  (Chrome Extension - Captures Audio + Meeting Metadata)            │
│  - User microphone audio (Channel: AGENT/CALLER)                   │
│  - Meeting app audio (Zoom, Teams, WebEx, Meet, Chime)             │
│  - Active speaker detection                                         │
│  - Meeting metadata (title, participants)                           │
└────────────────────────┬────────────────────────────────────────────┘
                         │ WebSocket (WSS)
                         │ Auth: JWT Token from Cognito
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                   WEBSOCKET SERVER (Fargate)                        │
│  - Receives stereo audio streams (2 channels)                      │
│  - Manages WebSocket connections                                    │
│  - Streams audio to Amazon Transcribe                               │
│  - Publishes events to Kinesis Data Streams                         │
│  - Creates stereo recordings in S3                                  │
└────────────┬────────────────────────────┬─────────────────────────┘
             │                            │
             │ Real-time                  │ Events
             │ Transcription              │ (Call metadata, segments)
             │                            │
┌────────────▼─────────────┐   ┌─────────▼──────────────────────────┐
│  AMAZON TRANSCRIBE       │   │   KINESIS DATA STREAMS             │
│  - Speech-to-text        │   │   - Real-time event streaming      │
│  - Speaker diarization   │   │   - Buffers transcript segments    │
│  - Custom vocabulary     │   └────────┬───────────────────────────┘
│  - PII redaction         │            │
└──────────────────────────┘            │
                                        │
                         ┌──────────────▼──────────────────┐
                         │  LAMBDA: Call Event Processor   │
                         │  - Processes transcript segments│
                         │  - Enriches with sentiment      │
                         │  - Handles meeting assistant    │
                         │  - Triggers summaries           │
                         └──────────┬──────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
┌─────────────▼──────────┐ ┌───────▼────────┐ ┌─────────▼─────────┐
│   APPSYNC GRAPHQL      │ │   DYNAMODB     │ │  MEETING ASSIST   │
│   - Real-time updates  │ │   - Calls      │ │  - QnABot         │
│   - Subscriptions      │ │   - Segments   │ │  - Bedrock KB     │
│   - Queries/Mutations  │ │   - Sentiment  │ │  - Bedrock LLMs   │
└─────────────┬──────────┘ └────────────────┘ └───────────────────┘
              │
              │ GraphQL Subscriptions
              │
┌─────────────▼──────────────────────────────────────────────────────┐
│                      WEB UI (React + CloudFront)                   │
│  - Live transcript display                                          │
│  - Speaker attribution                                              │
│  - Translation (Amazon Translate)                                   │
│  - Meeting assist chat                                              │
│  - Recording playback                                               │
│  - Meeting summaries & insights                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Stack Breakdown

**LMA consists of 8 major CloudFormation stacks:**

1. **LMA-VPC-STACK** - VPC, subnets, security groups
2. **LMA-COGNITO-STACK** - User authentication
3. **LMA-WEBSOCKET-TRANSCRIBER-STACK** - Fargate WebSocket server
4. **LMA-AI-STACK** - Core application (Lambda, AppSync, DynamoDB)
5. **LMA-MEETINGASSIST-SETUP-STACK** - QnABot + Meeting Assistant
6. **LMA-BEDROCK-KB-STACK** - Bedrock Knowledge Base (optional)
7. **LMA-BROWSER-EXTENSION-STACK** - Chrome extension
8. **LMA-VIRTUAL-PARTICIPANT-STACK** - Bot to join meetings (preview)

---

## Complete Data Flow

### 1. Meeting Start Flow

```
User → Browser Extension → WebSocket Server
│
├─ START event
│  ├─ CallId (UUID)
│  ├─ Meeting metadata (title, owner, participants)
│  ├─ Timestamp
│  └─ Auth token (JWT)
│
└─ WebSocket connection established
   └─ Lambda: Call Event Processor
      └─ GraphQL Mutation: createCall
         └─ DynamoDB: Insert Call record
            └─ AppSync: Subscription → Web UI
```

**Event Structure:**
```json
{
  "EventType": "START",
  "CallId": "uuid-v4",
  "AgentId": "user-name",
  "CustomerPhoneNumber": "meeting-title",
  "Timestamp": "2025-10-22T10:00:00Z",
  "Metadatajson": "{\"meetingPlatform\":\"Zoom\"}"
}
```

### 2. Audio Streaming & Transcription Flow

```
Browser Extension
│
├─ Audio Capture
│  ├─ Microphone (AGENT channel)
│  └─ Meeting app audio (CALLER channel)
│
└─ Send to WebSocket Server (chunks)
   │
   └─ Fargate Task
      │
      ├─ Stream to Amazon Transcribe
      │  └─ Real-time speech-to-text
      │     └─ Returns transcript segments
      │
      └─ Publish to Kinesis Data Streams
         │
         └─ Lambda: Call Event Processor
            │
            ├─ Process segment
            │  ├─ Extract speaker info
            │  ├─ Calculate sentiment
            │  └─ Format transcript
            │
            └─ GraphQL Mutation: addTranscriptSegment
               └─ DynamoDB: Insert TranscriptSegment
                  └─ AppSync: Subscription → Web UI (live update)
```

**Transcript Segment Structure:**
```json
{
  "EventType": "ADD_TRANSCRIPT_SEGMENT",
  "CallId": "uuid",
  "SegmentId": "uuid-segment-id",
  "StartTime": 1234.5,
  "EndTime": 1238.2,
  "Transcript": "Hello everyone, welcome to the meeting",
  "IsPartial": false,
  "Channel": "CALLER",
  "Speaker": "John Doe",
  "Sentiment": "POSITIVE",
  "SentimentScore": {
    "Positive": 0.85,
    "Negative": 0.05,
    "Neutral": 0.10,
    "Mixed": 0.0
  }
}
```

### 3. Meeting Assistant Flow

```
User says "OK Assistant" OR clicks "ASK ASSISTANT"
│
└─ Browser Extension / Web UI
   └─ Send message to Lambda via AppSync
      │
      └─ Lambda: Call Event Processor
         │
         ├─ Extract recent transcript context
         │
         └─ Query Meeting Assistant
            │
            ├─ OPTION 1: QnABot on AWS
            │  └─ Amazon Lex → Lambda → OpenSearch → Bedrock KB
            │
            ├─ OPTION 2: Bedrock Knowledge Base (direct)
            │  └─ Query KB with transcript context
            │
            ├─ OPTION 3: Amazon Q Business
            │  └─ Query Q Business with transcript
            │
            └─ OPTION 4: Bedrock LLM (no KB)
               └─ Direct prompt to Claude/Titan
            │
            └─ Response
               └─ GraphQL Mutation: addTranscriptSegment
                  └─ Channel: AGENT_ASSISTANT
                     └─ AppSync → Web UI (display answer)
```

### 4. Meeting End Flow

```
User clicks "Stop Streaming"
│
└─ Browser Extension
   └─ Send END event → WebSocket Server
      │
      ├─ Stop audio streaming
      ├─ Finalize S3 recording
      │
      └─ Publish END event to Kinesis
         │
         └─ Lambda: Call Event Processor
            │
            ├─ GraphQL Mutation: updateCallStatus (ENDED)
            │
            ├─ Invoke Lambda: Transcript Summarization
            │  │
            │  └─ Retrieve full transcript from DynamoDB
            │     │
            │     └─ Send to Bedrock LLM with prompts:
            │        ├─ Generate summary
            │        ├─ Extract action items
            │        ├─ Identify key topics
            │        └─ Detect issues
            │        │
            │        └─ GraphQL Mutations:
            │           ├─ addCallSummaryText
            │           ├─ addCallCategory
            │           └─ addIssuesDetected
            │
            └─ Write transcript to S3
               └─ Bedrock KB datasource sync (every 15 min)
                  └─ Index in Transcript Knowledge Base
```

---

## Database Schema

### DynamoDB Tables

LMA uses a **single-table design** in DynamoDB with the following access patterns:

#### Table: `CallsTable`

**Primary Key Structure:**
- **PK (Partition Key)**: Composite identifier
- **SK (Sort Key)**: Type-specific identifier

#### Entity Types

### 1. Call Entity

**Purpose:** Store meeting metadata and aggregated data

**Key Structure:**
- PK: `c#{CallId}`
- SK: `c#{CallId}`

**Attributes:**
```
CallId: string (UUID)
CustomerPhoneNumber: string (meeting title)
SystemPhoneNumber: string (not used in LMA)
AgentId: string (meeting owner name)
Status: "STARTED" | "TRANSCRIBING" | "ENDED" | "ERRORED"
CreatedAt: datetime
UpdatedAt: datetime
ExpiresAfter: timestamp (TTL)
RecordingUrl: string (S3 URL)
TotalConversationDurationMillis: number
CallSummaryText: string (generated by Bedrock)
CallCategories: string[] (topics extracted by LLM)
IssuesDetected: string (problems identified by LLM)
Metadatajson: string (JSON with platform, participants)
Owner: string (user email - for UBAC)
SharedWith: string (comma-separated emails)
Sentiment: {
  OverallSentiment: {
    AGENT: float,
    CALLER: float,
    AGENT_VOICETONE: float,
    CALLER_VOICETONE: float
  },
  SentimentByPeriod: {
    QUARTER: {
      AGENT: [{BeginOffsetMillis, EndOffsetMillis, Score}],
      CALLER: [...]
    }
  }
}
```

### 2. TranscriptSegment Entity

**Purpose:** Store individual transcript segments with timing and sentiment

**Key Structure:**
- PK: `c#{CallId}`
- SK: `ts#{timestamp}#{SegmentId}`

**Attributes:**
```
CallId: string
SegmentId: string (UUID)
StartTime: float (seconds from call start)
EndTime: float
Transcript: string (actual words spoken)
IsPartial: boolean (true for interim results)
Channel: "CALLER" | "AGENT" | "AGENT_ASSISTANT" | "CHAT_ASSISTANT" | "CATEGORY_MATCH"
Speaker: string (speaker name or "Assistant")
Sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED"
SentimentScore: {
  Positive: float,
  Negative: float,
  Neutral: float,
  Mixed: float
}
SentimentWeighted: float
CreatedAt: datetime
UpdatedAt: datetime
ExpiresAfter: timestamp (TTL)
Owner: string (user email)
SharedWith: string
```

### 3. CallList Entity

**Purpose:** Enable efficient list queries and date-based filtering

**Key Structure:**
- PK: `cl#{date}#{shard}` or `cl#{date}#{hour}`
- SK: `cl#{timestamp}#{CallId}`

**Attributes:**
```
CallId: string
CreatedAt: datetime
Owner: string
SharedWith: string
```

### 4. VirtualParticipant Entity (Preview Feature)

**Purpose:** Store bot participant info for scheduled/joined meetings

**Key Structure:**
- PK: `vp#{id}`
- SK: `vp#{id}`

**Attributes:**
```
id: string (UUID)
meetingName: string
meetingPlatform: "Zoom" | "Teams" | "WebEx" | "Meet" | "Chime"
meetingId: string
meetingPassword: string (encrypted)
meetingTime: timestamp
scheduledFor: datetime
isScheduled: boolean
scheduleId: string (EventBridge rule ID)
status: "PENDING" | "ACTIVE" | "ENDED"
owner: string
Owner: string (duplicate for compatibility)
SharedWith: string
createdAt: datetime
updatedAt: datetime
CallId: string (linked to Call when bot joins)
```

### Access Patterns

1. **Get Call by ID**
   - Query: `PK = c#{CallId} AND SK = c#{CallId}`

2. **Get Transcript Segments for Call**
   - Query: `PK = c#{CallId} AND begins_with(SK, "ts#")`
   - Sort by SK (timestamp ascending)

3. **List Calls by Date**
   - Query: `PK = cl#{date}#{shard}`
   - Pagination with SK

4. **List Calls by Date and Hour**
   - Query: `PK = cl#{date}#{hour}`

5. **Get User's Calls (with UBAC)**
   - Query with filter: `Owner = user@email.com OR contains(SharedWith, user@email.com)`

---

## Backend Components

### 1. WebSocket Server (Fargate)

**File:** `lma-websocket-transcriber-stack/source/app/src/index.ts`

**Key Responsibilities:**
- Accept WebSocket connections from browser extension
- Validate JWT tokens (Cognito)
- Receive stereo audio streams (2 channels)
- Stream audio to Amazon Transcribe
- Receive transcription results
- Publish events to Kinesis Data Streams
- Record stereo audio to S3

**Key Code Flow:**
```typescript
// WebSocket message types
START: {
  callId: string,
  agentId: string,
  fromNumber: string, // meeting title
  toNumber: string,
  metadata: { platform: string }
}

AUDIO_CHUNK: {
  callId: string,
  audioChunk: Buffer, // PCM audio data
  channel: 0 | 1
}

SPEAKER_UPDATE: {
  callId: string,
  speaker: string,
  channel: "AGENT" | "CALLER"
}

END: {
  callId: string
}
```

**Transcribe Integration:**
```typescript
// Streams to Amazon Transcribe Streaming API
const transcribeStream = client.startStreamTranscription({
  LanguageCode: "en-US", // or identify-language
  MediaSampleRateHertz: 16000 | 8000,
  MediaEncoding: "pcm",
  AudioStream: audioStream,
  ShowSpeakerLabel: true,
  EnableChannelIdentification: true,
  NumberOfChannels: 2,
  VocabularyName: customVocab,
  VocabularyFilterName: profanityFilter,
  ContentRedactionType: "PII"
});
```

**Kinesis Publishing:**
```typescript
kinesis.putRecord({
  StreamName: process.env.KINESIS_STREAM_NAME,
  PartitionKey: callId,
  Data: JSON.stringify({
    EventType: "ADD_TRANSCRIPT_SEGMENT",
    CallId: callId,
    // ... segment data
  })
});
```

### 2. Call Event Processor Lambda

**File:** `lma-ai-stack/source/lambda_functions/call_event_processor/call_event_processor.py`

**Key Responsibilities:**
- Process events from Kinesis Data Streams
- Handle call lifecycle (START, END)
- Process transcript segments
- Enrich with sentiment analysis
- Handle meeting assistant queries
- Execute GraphQL mutations

**Event Handlers:**

```python
def process_event(event: dict):
    event_type = event.get("EventType")
    
    if event_type == "START":
        handle_call_start(event)
    elif event_type == "ADD_TRANSCRIPT_SEGMENT":
        handle_transcript_segment(event)
    elif event_type == "END":
        handle_call_end(event)
    elif event_type == "MEETING_ASSIST":
        handle_meeting_assist(event)

def handle_call_start(event):
    # GraphQL mutation: createCall
    call_data = {
        "CallId": event["CallId"],
        "AgentId": event.get("AgentId"),
        "CustomerPhoneNumber": event.get("CustomerPhoneNumber"),
        "Status": "STARTED",
        "CreatedAt": datetime.now(),
        "Owner": get_user_from_token(event)
    }
    execute_graphql_mutation("createCall", call_data)

def handle_transcript_segment(event):
    # Add sentiment analysis
    sentiment = analyze_sentiment(event["Transcript"])
    
    # GraphQL mutation: addTranscriptSegment
    segment_data = {
        **event,
        "Sentiment": sentiment["Sentiment"],
        "SentimentScore": sentiment["SentimentScore"]
    }
    execute_graphql_mutation("addTranscriptSegment", segment_data)

def handle_call_end(event):
    # Update call status
    execute_graphql_mutation("updateCallStatus", {
        "CallId": event["CallId"],
        "Status": "ENDED"
    })
    
    # Trigger summarization
    invoke_lambda("TranscriptSummarization", {
        "CallId": event["CallId"]
    })
```

### 3. Transcript Summarization Lambda

**File:** `lma-ai-stack/source/lambda_functions/transcript_summarization/`

**Purpose:** Generate post-meeting summaries using Bedrock LLMs

**Process:**
1. Retrieve full transcript from DynamoDB
2. Construct prompts for Bedrock
3. Generate summaries, action items, topics
4. Update Call record via GraphQL

**Key Prompts:**

```python
PROMPTS = {
    "summary": """
    Based on the following meeting transcript, provide a concise summary:
    
    {transcript}
    
    Summary:
    """,
    
    "action_items": """
    Extract all action items from this meeting transcript with owners and due dates:
    
    {transcript}
    
    Action Items:
    """,
    
    "topics": """
    Identify the key topics discussed in this meeting:
    
    {transcript}
    
    Topics:
    """
}

def generate_summary(call_id: str):
    # Get transcript
    segments = get_transcript_segments(call_id)
    transcript = "\n".join([
        f"{seg['Speaker']}: {seg['Transcript']}"
        for seg in segments
    ])
    
    # Call Bedrock
    summary = call_bedrock(
        model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        prompt=PROMPTS["summary"].format(transcript=transcript)
    )
    
    # Update call
    execute_graphql_mutation("addCallSummaryText", {
        "CallId": call_id,
        "CallSummaryText": summary
    })
```

### 4. Meeting Assistant Integration

**Files:**
- `lma-meetingassist-setup-stack/` - QnABot setup
- `lma-bedrock-kb-stack/` - Knowledge Base setup

**Architecture:**

```
User Query → Lambda → QnABot → Router:
                                  │
                                  ├─ Amazon Lex (intent detection)
                                  ├─ OpenSearch (FAQ matching)
                                  ├─ Bedrock Knowledge Base
                                  ├─ Amazon Q Business
                                  └─ Bedrock LLM (fallback)
```

**Query Processing:**

```python
def handle_meeting_assist(event):
    call_id = event["CallId"]
    query = event.get("Query") or generate_smart_query(call_id)
    
    # Get recent context
    recent_segments = get_recent_segments(call_id, last_n=10)
    context = format_context(recent_segments)
    
    # Query meeting assist service
    if ASSIST_TYPE == "BEDROCK_KNOWLEDGE_BASE":
        response = query_bedrock_kb(query, context)
    elif ASSIST_TYPE == "Q_BUSINESS":
        response = query_q_business(query, context)
    elif ASSIST_TYPE == "BEDROCK_AGENT":
        response = query_bedrock_agent(query, context)
    else:
        response = query_bedrock_llm(query, context)
    
    # Add as transcript segment
    execute_graphql_mutation("addTranscriptSegment", {
        "CallId": call_id,
        "Channel": "AGENT_ASSISTANT",
        "Speaker": "Assistant",
        "Transcript": response,
        "IsPartial": False
    })
```

---

## Frontend Components

### 1. Browser Extension

**Path:** `lma-browser-extension-stack/src/`

**Key Files:**
- `background.js` - Background service worker
- `content.js` - Injected into meeting pages
- `components/screens/Capture.tsx` - Main UI component

**Functionality:**

#### Meeting Detection
```javascript
// content.js - Detect meeting platform
const SUPPORTED_PLATFORMS = {
  'zoom.us': {
    name: 'Zoom',
    meetingTitleSelector: '.meeting-topic-text',
    activeSpeakerSelector: '.active-speaker-name'
  },
  'teams.microsoft.com': {
    name: 'Teams',
    meetingTitleSelector: '.ts-meeting-title',
    activeSpeakerSelector: '.active-speaker'
  },
  // ... more platforms
};

function detectMeeting() {
  const hostname = window.location.hostname;
  return SUPPORTED_PLATFORMS[hostname];
}
```

#### Audio Capture
```javascript
// Capture.tsx
const startCapture = async () => {
  // Get microphone stream
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 16000
    }
  });
  
  // Get tab audio (meeting app)
  const tabStream = await navigator.mediaDevices.getDisplayMedia({
    audio: {
      echoCancellation: false,
      sampleRate: 16000
    },
    video: true // Required but not used
  });
  
  // Create audio processor
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const micSource = audioContext.createMediaStreamSource(micStream);
  const tabSource = audioContext.createMediaStreamSource(tabStream);
  
  // Process audio in chunks
  const processor = audioContext.createScriptProcessor(4096, 2, 2);
  processor.onaudioprocess = (e) => {
    const micData = e.inputBuffer.getChannelData(0);
    const tabData = e.inputBuffer.getChannelData(1);
    
    sendAudioChunk({
      mic: convertToPCM(micData),
      tab: convertToPCM(tabData)
    });
  };
};
```

#### WebSocket Communication
```typescript
class LMAWebSocket {
  private ws: WebSocket;
  
  connect(token: string) {
    this.ws = new WebSocket(
      `${WS_URL}?token=${encodeURIComponent(token)}`
    );
    
    this.ws.onopen = () => {
      this.send({
        type: 'START',
        callId: generateUUID(),
        agentId: userName,
        fromNumber: meetingTitle,
        metadata: { platform: 'Zoom' }
      });
    };
  }
  
  sendAudio(chunk: { mic: Buffer, tab: Buffer }) {
    // Send as binary message
    const combined = new Uint8Array(chunk.mic.length + chunk.tab.length);
    combined.set(chunk.mic, 0);
    combined.set(chunk.tab, chunk.mic.length);
    this.ws.send(combined);
  }
  
  updateSpeaker(speaker: string, channel: 'AGENT' | 'CALLER') {
    this.send({
      type: 'SPEAKER_UPDATE',
      speaker,
      channel
    });
  }
}
```

### 2. Web UI Application

**Path:** `lma-ai-stack/source/ui/src/`

**Key Technologies:**
- React + TypeScript
- AWS Amplify (authentication)
- Apollo Client (GraphQL)
- Material-UI components

**Key Components:**

#### Meeting List
```typescript
// components/MeetingList.tsx
const MeetingList: React.FC = () => {
  // GraphQL subscription for real-time updates
  const { data: newCall } = useSubscription(ON_CREATE_CALL);
  const { data: updatedCall } = useSubscription(ON_UPDATE_CALL);
  
  // Query calls
  const { data, loading } = useQuery(LIST_CALLS, {
    variables: {
      startDateTime: startDate,
      endDateTime: endDate
    }
  });
  
  return (
    <div>
      {data?.listCalls?.Calls?.map(call => (
        <CallCard
          key={call.CallId}
          call={call}
          status={call.Status}
        />
      ))}
    </div>
  );
};
```

#### Meeting Detail / Live Transcript
```typescript
// components/MeetingDetail.tsx
const MeetingDetail: React.FC<{ callId: string }> = ({ callId }) => {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  
  // Subscribe to new segments
  useSubscription(ON_ADD_TRANSCRIPT_SEGMENT, {
    variables: { CallId: callId },
    onSubscriptionData: ({ subscriptionData }) => {
      const newSegment = subscriptionData.data.onAddTranscriptSegment;
      
      if (newSegment.IsPartial) {
        // Update last segment
        setSegments(prev => [...prev.slice(0, -1), newSegment]);
      } else {
        // Add new segment
        setSegments(prev => [...prev, newSegment]);
      }
    }
  });
  
  // Query existing segments
  const { data } = useQuery(GET_TRANSCRIPT_SEGMENTS, {
    variables: { callId, isPartial: false }
  });
  
  // Translation
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null);
  const [translatedSegments, setTranslatedSegments] = useState<Map<string, string>>(new Map());
  
  useEffect(() => {
    if (targetLanguage) {
      segments.forEach(async (segment) => {
        if (!translatedSegments.has(segment.SegmentId)) {
          const translated = await translateText(segment.Transcript, targetLanguage);
          setTranslatedSegments(prev => new Map(prev).set(segment.SegmentId, translated));
        }
      });
    }
  }, [segments, targetLanguage]);
  
  return (
    <div>
      <TranscriptView
        segments={segments}
        translations={translatedSegments}
        targetLanguage={targetLanguage}
      />
      <MeetingAssistPanel callId={callId} />
    </div>
  );
};
```

#### Meeting Assistant Panel
```typescript
// components/MeetingAssistPanel.tsx
const MeetingAssistPanel: React.FC<{ callId: string }> = ({ callId }) => {
  const [query, setQuery] = useState('');
  const [sendChatMessage] = useMutation(SEND_CHAT_MESSAGE);
  
  // Subscribe to assistant responses
  useSubscription(ON_SEND_CHAT_MESSAGE, {
    variables: { CallId: callId }
  });
  
  const askAssistant = async (customQuery?: string) => {
    const result = await sendChatMessage({
      variables: {
        input: {
          CallId: callId,
          Message: customQuery || query || "ASK_ASSISTANT"
        }
      }
    });
  };
  
  return (
    <div>
      <button onClick={() => askAssistant()}>ASK ASSISTANT</button>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Ask a question..."
      />
      <ChatMessages callId={callId} />
    </div>
  );
};
```

---

## GraphQL API Structure

### Queries

```graphql
# Get single call
getCall(CallId: ID!): Call

# Get transcript segments
getTranscriptSegments(
  callId: ID!
  isPartial: Boolean
): TranscriptSegmentList

# Get segments with sentiment only
getTranscriptSegmentsWithSentiment(
  callId: ID!
): TranscriptSegmentsWithSentimentList

# List calls with date filters
listCalls(
  endDateTime: AWSDateTime
  startDateTime: AWSDateTime
): CallList

listCallsDateHour(
  date: AWSDate
  hour: Int
): CallList

# Query transcript knowledge base
queryKnowledgeBase(
  input: String!
  sessionId: String
): String

# Virtual participant queries
listVirtualParticipants: [VirtualParticipant]
getVirtualParticipant(id: ID!): VirtualParticipant

# Parse meeting invitation text
parseMeetingInvitation(invitationText: String!): String
```

### Mutations

```graphql
# Call lifecycle
createCall(input: CreateCallInput!): CreateCallOutput
updateCallStatus(input: UpdateCallStatusInput!): Call
deleteCall(input: DeleteCallInput!): DeleteCallOutput

# Transcript segments
addTranscriptSegment(input: AddTranscriptSegmentInput!): TranscriptSegment
deleteTranscriptSegment(input: DeleteTranscriptSegmentInput!): DeleteTranscriptSegmentOutput

# Call updates
updateCallAggregation(input: UpdateCallAggregationInput!): Call
updateRecordingUrl(input: UpdateRecordingUrlInput!): Call
addCallCategory(input: AddCallCategoryInput!): Call
addIssuesDetected(input: AddIssuesDetectedInput!): Call
addCallSummaryText(input: AddCallSummaryTextInput!): Call

# Sharing
shareCall(input: ShareCallInput!): ShareCallOutput
unshareCall(input: UnshareCallInput!): UnshareCallOutput
shareMeetings(input: ShareMeetingsInput!): ShareMeetingsOutput

# Chat/Assistant
sendChatMessage(input: SendChatMessageInput!): SendChatMessageOutput
addChatToken(input: AddChatTokenInput!): ChatToken

# Virtual participant
createVirtualParticipant(input: CreateVirtualParticipantInput!): VirtualParticipant
updateVirtualParticipant(input: UpdateVirtualParticipantInput!): VirtualParticipant
endVirtualParticipant(input: EndVirtualParticipantInput!): VirtualParticipant
```

### Subscriptions

```graphql
# Real-time call events
onCreateCall: CreateCallOutput
onUpdateCall(CallId: ID): Call
onDeleteCall: DeleteCallOutput

# Real-time transcript segments
onAddTranscriptSegment(
  CallId: ID
  Channel: String
): TranscriptSegment

# Real-time chat messages
onSendChatMessage(CallId: ID): SendChatMessageOutput
onAddChatToken(CallId: ID!, MessageId: ID!): ChatToken

# Sharing events
onShareMeetings: ShareMeetingsOutput
onShareCall: ShareCallOutput
onUnshareCall: UnshareCallOutput

# Virtual participant updates
onUpdateVirtualParticipant: VirtualParticipant
```

---

## Authentication & Authorization

### Cognito User Pool

**Stack:** `LMA-COGNITO-STACK`

**Features:**
- Email-based authentication
- JWT tokens for API access
- Admin vs. non-admin users
- Domain-based signup (optional)

**User Attributes:**
```json
{
  "sub": "uuid",
  "email": "user@example.com",
  "email_verified": true,
  "custom:isAdmin": "true" | "false"
}
```

### User-Based Access Control (UBAC)

**Introduced in v0.2.0**

**Principles:**
1. Each user can only see their own meetings
2. Admin user can see all meetings
3. Meetings can be shared with specific users
4. GraphQL resolvers enforce access control

**Implementation:**

```python
# Lambda resolver for listCalls
def list_calls(event, context):
    user_email = event["identity"]["claims"]["email"]
    is_admin = event["identity"]["claims"].get("custom:isAdmin") == "true"
    
    if is_admin:
        # Return all calls
        return query_all_calls()
    else:
        # Filter by owner or shared
        return query_calls_for_user(user_email)

def query_calls_for_user(email):
    # DynamoDB query with filter expression
    response = dynamodb.query(
        IndexName="OwnerIndex",
        KeyConditionExpression="Owner = :email",
        FilterExpression="Owner = :email OR contains(SharedWith, :email)",
        ExpressionAttributeValues={":email": email}
    )
    return response["Items"]
```

### WebSocket Authentication

**Token Validation in Fargate:**

```typescript
// Validate JWT from query parameter
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: "access",
  clientId: process.env.CLIENT_ID
});

async function authenticateWebSocket(token: string) {
  try {
    const payload = await verifier.verify(token);
    return {
      authenticated: true,
      email: payload["username"] || payload["email"],
      isAdmin: payload["custom:isAdmin"] === "true"
    };
  } catch (error) {
    return { authenticated: false };
  }
}
```

---

## Migration Mapping: AWS to Soniox/Supabase

### Component Migration Map

| **AWS Service** | **LMA Usage** | **Soniox/Supabase Equivalent** | **Migration Notes** |
|-----------------|---------------|--------------------------------|---------------------|
| **Amazon Transcribe** | Real-time speech-to-text | **Soniox Speech-to-Text** | - Same WebSocket streaming pattern<br>- Soniox provides better accuracy<br>- Support for speaker diarization<br>- Custom vocabulary support |
| **DynamoDB** | Calls, segments, metadata | **Supabase (PostgreSQL)** | - Relational model clearer than single-table<br>- Real-time subscriptions via PostgREST<br>- RBAC with Row Level Security (RLS) |
| **AppSync GraphQL** | Real-time API | **Supabase Realtime** | - Postgres LISTEN/NOTIFY<br>- Similar subscription pattern<br>- Can keep GraphQL layer if desired |
| **Cognito** | Authentication | **Supabase Auth** | - Email/password, OAuth, magic links<br>- JWT tokens compatible<br>- Built-in RBAC |
| **Kinesis Data Streams** | Event streaming | **Supabase Edge Functions + Webhooks** | - Replace with direct Lambda/Edge Function calls<br>- Or use Postgres triggers |
| **Lambda** | Event processing | **Supabase Edge Functions (Deno)** | - Similar serverless model<br>- TypeScript/Deno runtime<br>- Direct DB access |
| **S3** | Recording storage | **Supabase Storage** | - Object storage API<br>- Public/private buckets<br>- CDN integration |
| **Bedrock LLM** | Summarization, assistant | **Keep Bedrock or OpenAI API** | - No change needed<br>- Or migrate to OpenAI/Anthropic direct APIs |
| **Bedrock Knowledge Base** | Meeting assistant | **Supabase Vector + pgvector** | - Store embeddings in Postgres<br>- Use pgvector for similarity search<br>- Or keep Bedrock KB |
| **CloudFront + S3** | UI hosting | **Vercel / Netlify / Supabase Hosting** | - Modern hosting platforms<br>- Better CI/CD integration |
| **Fargate** | WebSocket server | **Fly.io / Render / Railway** | - Deploy same Node.js app<br>- Auto-scaling WebSocket support<br>- Lower cost than Fargate |

---

### Proposed New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER EXTENSION                            │
│                 (Same - minimal changes)                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │ WebSocket (WSS)
                      │ Auth: JWT from Supabase Auth
┌─────────────────────▼───────────────────────────────────────────┐
│          WEBSOCKET SERVER (Fly.io/Render)                       │
│  - Same Node.js code with minor changes                         │
│  - Validate Supabase JWT                                        │
│  - Stream to Soniox Speech-to-Text API                          │
│  - Publish to Supabase (direct or via Edge Functions)           │
└──────┬────────────────────────┬─────────────────────────────────┘
       │                        │
       │                        │
┌──────▼──────────┐   ┌─────────▼──────────────────────────────┐
│  SONIOX API     │   │   SUPABASE                             │
│  - Speech-to-   │   │   ┌─────────────────────────────────┐  │
│    text         │   │   │  PostgreSQL Database            │  │
│  - Speaker      │   │   │  - meetings table               │  │
│    diarization  │   │   │  - transcript_segments table    │  │
└─────────────────┘   │   │  - users table (auth.users)     │  │
                      │   │  - Row Level Security (RLS)     │  │
                      │   └─────────────────────────────────┘  │
                      │   ┌─────────────────────────────────┐  │
                      │   │  Supabase Realtime              │  │
                      │   │  - Postgres LISTEN/NOTIFY       │  │
                      │   │  - WebSocket to clients         │  │
                      │   └─────────────────────────────────┘  │
                      │   ┌─────────────────────────────────┐  │
                      │   │  Edge Functions (Deno)          │  │
                      │   │  - process_transcript_segment   │  │
                      │   │  - generate_summary             │  │
                      │   │  - meeting_assistant            │  │
                      │   └─────────────────────────────────┘  │
                      │   ┌─────────────────────────────────┐  │
                      │   │  Storage                        │  │
                      │   │  - Audio recordings             │  │
                      │   └─────────────────────────────────┘  │
                      │   ┌─────────────────────────────────┐  │
                      │   │  Auth                           │  │
                      │   │  - Email/password               │  │
                      │   │  - JWT tokens                   │  │
                      │   └─────────────────────────────────┘  │
                      └────────────────────────────────────────┘
                                        │
                                        │ Realtime subscriptions
                                        │
┌───────────────────────────────────────▼─────────────────────────┐
│                    WEB UI (Next.js + Vercel)                    │
│  - Supabase client library                                      │
│  - Real-time subscriptions                                      │
│  - Authentication                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

### Database Schema Migration

#### Supabase PostgreSQL Schema

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Users (handled by Supabase Auth)
-- auth.users table is built-in

-- Meetings table (replaces Call)
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('STARTED', 'TRANSCRIBING', 'ENDED', 'ERRORED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_millis INTEGER,
    recording_url TEXT,
    summary TEXT,
    topics TEXT[],
    issues_detected TEXT,
    metadata JSONB,
    
    -- Sentiment aggregation
    overall_sentiment JSONB,
    
    -- Sharing
    shared_with TEXT[],
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    
    -- Indexes
    INDEX idx_meetings_owner (owner_id),
    INDEX idx_meetings_created (created_at DESC),
    INDEX idx_meetings_status (status)
);

-- Enable RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own meetings"
    ON meetings FOR SELECT
    USING (
        auth.uid() = owner_id 
        OR 
        auth.email() = ANY(shared_with)
    );

CREATE POLICY "Users can create their own meetings"
    ON meetings FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own meetings"
    ON meetings FOR UPDATE
    USING (auth.uid() = owner_id);

-- Transcript segments table
CREATE TABLE transcript_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
    segment_id TEXT NOT NULL,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    transcript TEXT NOT NULL,
    is_partial BOOLEAN NOT NULL DEFAULT FALSE,
    channel TEXT NOT NULL CHECK (channel IN ('AGENT', 'CALLER', 'AGENT_ASSISTANT', 'CHAT_ASSISTANT')),
    speaker TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Sentiment
    sentiment TEXT CHECK (sentiment IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED')),
    sentiment_score JSONB,
    sentiment_weighted FLOAT,
    
    -- Indexes
    INDEX idx_segments_meeting (meeting_id),
    INDEX idx_segments_time (meeting_id, start_time),
    INDEX idx_segments_partial (meeting_id, is_partial),
    
    UNIQUE (meeting_id, segment_id)
);

-- Enable RLS
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;

-- RLS Policy (inherit from meetings)
CREATE POLICY "Users can view segments of their meetings"
    ON transcript_segments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM meetings
            WHERE meetings.id = meeting_id
            AND (meetings.owner_id = auth.uid() OR auth.email() = ANY(meetings.shared_with))
        )
    );

-- Virtual participants table
CREATE TABLE virtual_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES auth.users(id) NOT NULL,
    meeting_name TEXT NOT NULL,
    meeting_platform TEXT NOT NULL,
    meeting_id TEXT NOT NULL,
    meeting_password TEXT,
    meeting_time TIMESTAMPTZ,
    is_scheduled BOOLEAN DEFAULT FALSE,
    schedule_id TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meeting_record_id UUID REFERENCES meetings(id),
    
    INDEX idx_vp_owner (owner_id),
    INDEX idx_vp_status (status)
);

-- Enable RLS
ALTER TABLE virtual_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own virtual participants"
    ON virtual_participants FOR ALL
    USING (auth.uid() = owner_id);

-- Meeting assistant embeddings (for RAG)
CREATE TABLE meeting_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI ada-002 dimension
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_embeddings_meeting (meeting_id)
);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_meeting_embeddings(
    query_embedding VECTOR(1536),
    match_threshold FLOAT,
    match_count INT,
    user_id UUID
)
RETURNS TABLE (
    id UUID,
    meeting_id UUID,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        meeting_embeddings.id,
        meeting_embeddings.meeting_id,
        meeting_embeddings.content,
        1 - (meeting_embeddings.embedding <=> query_embedding) AS similarity
    FROM meeting_embeddings
    INNER JOIN meetings ON meetings.id = meeting_embeddings.meeting_id
    WHERE 
        1 - (meeting_embeddings.embedding <=> query_embedding) > match_threshold
        AND (meetings.owner_id = user_id OR auth.email() = ANY(meetings.shared_with))
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- Realtime publication setup
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE transcript_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE virtual_participants;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_virtual_participants_updated_at
    BEFORE UPDATE ON virtual_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

### WebSocket Server Migration

**Current (AWS):**
```typescript
// Validate Cognito JWT
import { CognitoJwtVerifier } from "aws-jwt-verify";
```

**New (Supabase):**
```typescript
// Validate Supabase JWT
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function authenticateWebSocket(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    userId: user.id,
    email: user.email
  };
}

// Replace Amazon Transcribe with Soniox
import WebSocket from 'ws';

function streamToSoniox(audioStream: ReadableStream) {
  const sonioxWs = new WebSocket('wss://api.soniox.com/transcribe-websocket', {
    headers: {
      'Authorization': `Bearer ${process.env.SONIOX_API_KEY}`
    }
  });
  
  sonioxWs.on('open', () => {
    // Send config
    sonioxWs.send(JSON.stringify({
      type: 'config',
      model: 'default',
      enable_speaker_diarization: true,
      num_audio_channels: 2
    }));
  });
  
  // Stream audio
  audioStream.on('data', (chunk) => {
    sonioxWs.send(chunk);
  });
  
  // Receive transcripts
  sonioxWs.on('message', (data) => {
    const result = JSON.parse(data.toString());
    if (result.type === 'transcript') {
      handleTranscript(result);
    }
  });
}

// Replace Kinesis with direct Supabase insert
async function handleTranscript(transcript) {
  // Insert directly into Supabase
  const { data, error } = await supabase
    .from('transcript_segments')
    .insert({
      meeting_id: currentMeetingId,
      segment_id: transcript.segment_id,
      start_time: transcript.start_time,
      end_time: transcript.end_time,
      transcript: transcript.text,
      is_partial: transcript.is_partial,
      channel: transcript.channel,
      speaker: transcript.speaker
    });
  
  // Supabase Realtime will automatically notify subscribers
}
```

---

### Frontend Migration

**Current (AWS Amplify + Apollo):**
```typescript
import { Amplify } from 'aws-amplify';
import { ApolloClient } from '@apollo/client';

Amplify.configure({
  Auth: { /* Cognito config */ },
  API: { /* AppSync config */ }
});
```

**New (Supabase):**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Authentication
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

// Real-time subscriptions
const channel = supabase
  .channel('meetings')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'transcript_segments',
      filter: `meeting_id=eq.${meetingId}`
    },
    (payload) => {
      console.log('New segment:', payload.new);
      setSegments(prev => [...prev, payload.new]);
    }
  )
  .subscribe();

// Queries
const { data: meetings } = await supabase
  .from('meetings')
  .select('*')
  .order('created_at', { ascending: false });
```

---

### Cost Comparison

#### Current AWS Costs (per month)

| Service | Usage | Cost |
|---------|-------|------|
| Fargate (0.25 vCPU) | 24/7 | ~$10 |
| QnABot (OpenSearch) | 1 node | ~$100 |
| Transcribe | 100 hours | ~$240 (at $2.40/hr) |
| DynamoDB | On-demand | ~$25 |
| Lambda | Moderate | ~$10 |
| AppSync | Moderate | ~$10 |
| S3 + CloudFront | Moderate | ~$20 |
| **TOTAL** | | **~$415/month** |

#### Proposed Soniox/Supabase Costs (per month)

| Service | Usage | Cost |
|---------|-------|------|
| Fly.io/Render | WebSocket server | ~$7 |
| Supabase Pro | Database + Realtime + Auth + Storage | $25 |
| Soniox | 100 hours @ $0.016/min | ~$96 |
| Edge Functions | Moderate | Included in Supabase |
| Vercel (Hobby) | UI hosting | $0 (or $20 for Pro) |
| Bedrock (if kept) | LLM usage | ~$50 |
| **TOTAL** | | **~$178/month** |

**Savings: ~$237/month (57% reduction)**

**Key savings:**
- Soniox is 60% cheaper than Transcribe ($0.016/min vs $0.04/min)
- Supabase Pro ($25) replaces DynamoDB, AppSync, Cognito
- No OpenSearch/QnABot costs (use pgvector instead)

---

### Migration Checklist

#### Phase 1: Database Migration
- [ ] Set up Supabase project
- [ ] Create PostgreSQL schema
- [ ] Configure Row Level Security policies
- [ ] Migrate existing DynamoDB data (export/import scripts)
- [ ] Test RLS policies with sample users

#### Phase 2: Backend Migration
- [ ] Sign up for Soniox API
- [ ] Update WebSocket server to use Soniox
- [ ] Replace Kinesis with direct Supabase inserts
- [ ] Migrate Lambda functions to Supabase Edge Functions
- [ ] Update authentication to use Supabase Auth
- [ ] Test end-to-end transcription flow

#### Phase 3: Frontend Migration
- [ ] Replace AWS Amplify with Supabase client
- [ ] Update authentication flows
- [ ] Replace AppSync subscriptions with Supabase Realtime
- [ ] Update GraphQL queries to Supabase REST/RPC
- [ ] Deploy to Vercel/Netlify

#### Phase 4: Meeting Assistant Migration
- [ ] Set up pgvector for embeddings
- [ ] Create embedding generation pipeline
- [ ] Implement vector search
- [ ] Or keep Bedrock KB and update API calls

#### Phase 5: Testing & Deployment
- [ ] Load testing WebSocket server
- [ ] Test real-time subscriptions under load
- [ ] Verify UBAC with multiple users
- [ ] Performance benchmarks (latency, throughput)
- [ ] Migration runbook for production

---

## Key Files Reference

### Backend
- `lma-websocket-transcriber-stack/source/app/src/index.ts` - WebSocket server
- `lma-ai-stack/source/lambda_functions/call_event_processor/call_event_processor.py` - Main event processor
- `lma-ai-stack/source/appsync/schema.graphql` - GraphQL schema
- `lma-ai-stack/source/lambda_functions/transcript_summarization/` - Summarization

### Frontend
- `lma-browser-extension-stack/src/components/screens/Capture.tsx` - Extension UI
- `lma-ai-stack/source/ui/src/` - React web app
- `lma-ai-stack/source/ui/src/graphql/` - GraphQL queries/mutations

### Infrastructure
- `lma-main.yaml` - Main CloudFormation template
- `lma-ai-stack/template.yaml` - AI stack template
- `lma-websocket-transcriber-stack/template.yaml` - WebSocket stack template

---

## Next Steps for Meetly Migration

1. **Review this documentation** with the team
2. **Set up Supabase project** with schema
3. **Test Soniox API** with sample audio
4. **Create POC** with simplified flow:
   - WebSocket server → Soniox → Supabase
   - Simple React UI with real-time updates
5. **Incremental migration** from LMA codebase
6. **Deploy to production** with monitoring

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-22  
**Author:** AI Assistant (based on LMA codebase analysis)
