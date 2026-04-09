# API & Interface Reference: Amazon Transcribe Live Meeting Assistant

This document provides an exhaustive reference for the APIs, WebSocket events, and database interfaces used in the Live Meeting Assistant.

## 1. WebSocket API (Ingestion Layer)

The WebSocket API is the primary conduit for streaming audio and receiving real-time transcripts.

### Endpoint
`wss://[api-id].execute-api.[region].amazonaws.com/production/stream`

### 1.1. Connection & Authentication
Clients must pass a valid JWT token in the connection request (either via query string or a specialized connect message, depending on the AWS API Gateway configuration).

### 1.2. Client-to-Server Messages (Upstream)

#### `start_session`
Initializes a new transcription session.
```json
{
  "action": "start_session",
  "meetingId": "string (optional)",
  "tenantId": "uuid",
  "languageCode": "en-US",
  "sampleRate": 44100
}
```

#### Audio Buffer payload
Raw binary audio data. Must be sent strictly as an `ArrayBuffer` or `Blob`.
- **Chunk Size:** Recommended 100ms - 250ms of audio.
- **Format:** PCM 16-bit or Opus (depending on Transcribe configuration).

#### `end_session`
Signals the end of the meeting.
```json
{
  "action": "end_session"
}
```

### 1.3. Server-to-Client Messages (Downstream)

#### `transcript_update`
Fired continuously as Amazon Transcribe processes the audio.
```json
{
  "event": "transcript_update",
  "isPartial": boolean,
  "speaker": "spk_1",
  "text": "Hello everyone, let's get started.",
  "startTime": 12.45,
  "endTime": 15.20
}
```
*Note: `isPartial: true` means the sentence is still being formed. The UI should overwrite the current line until `isPartial: false` is received.*

## 2. Supabase Database API

The frontend and external analytics tools interact with Supabase via its REST/GraphQL API.

### 2.1. Fetching a Meeting Summary
Retrieves the AI-generated summary and action items for a given meeting.

**JavaScript Client:**
```javascript
const { data, error } = await supabase
  .from('meeting_summaries')
  .select('summary_text, action_items')
  .eq('meeting_id', 'uuid-here')
  .single();
```

**Returns:**
```json
{
  "summary_text": "The team discussed...",
  "action_items": [
    "Deploy the new stack to staging.",
    "Review the PR by EOD."
  ]
}
```

### 2.2. Fetching Full Transcripts
Retrieves the chronological transcript.

**JavaScript Client:**
```javascript
const { data, error } = await supabase
  .from('transcripts')
  .select('speaker_label, text_segment, timestamp')
  .eq('meeting_id', 'uuid-here')
  .order('timestamp', { ascending: true });
```

## 3. Local Development Scripts (package.json)

The project includes several CLI scripts for development and testing.

### `npm run start:websocket`
Starts a local mock WebSocket server on `localhost:8080` that mimics the AWS API Gateway behavior. Useful for testing the browser extension without deploying to AWS.

### `npm run test`
Executes the Playwright test suite to verify UI components and basic E2E workflows.

### `npm run test:rls`
Executes the `scripts/test-rls-isolation.js` script. This script authenticates as two different test users belonging to different tenants and attempts to cross-read data to mathematically prove that Supabase Row Level Security is functioning correctly.

## 4. AWS CDK Deployment Commands

### `cdk synth`
Synthesizes the CloudFormation templates locally to verify stack definitions.

### `cdk deploy lma-ai-stack`
Deploys only the AI summarization pipeline.

### `cdk destroy --all`
Tears down all AWS resources associated with the Live Meeting Assistant to prevent billing charges.
