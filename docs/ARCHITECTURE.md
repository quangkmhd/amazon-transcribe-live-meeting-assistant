# Architecture Deep Dive: Amazon Transcribe Live Meeting Assistant

## 1. System Overview

The Amazon Transcribe Live Meeting Assistant is a complex, distributed, serverless architecture designed to capture, transcribe, and analyze virtual meeting audio in real-time. It operates as a bridge between your browser (where the meeting happens) and the AWS Cloud (where the heavy processing and AI summarization occur), with Supabase acting as the secure, real-time data persistence layer.

The architecture is highly modularized into AWS CloudFormation (CDK) stacks, ensuring that each component scales independently, fails gracefully, and maintains strict security boundaries.

## 2. Core Architectural Components

### 2.1. lma-browser-extension-stack (The Client)
The entry point of the system is a Chromium-based browser extension.
- **Audio Capture:** Uses the `chrome.tabCapture` API to intercept raw audio streams from Google Meet, Zoom, or Teams running in the browser tab.
- **WebSocket Client:** Establishes a persistent, bi-directional WebSocket connection to the AWS API Gateway.
- **UI/UX Layer:** A lightweight popup/sidebar built with modern web technologies that displays live transcriptions and speaker identification.

### 2.2. lma-websocket-transcriber-stack (The Ingestion Layer)
This stack handles the massive influx of audio data.
- **Amazon API Gateway (WebSocket):** Manages connection state, upgrades HTTP requests to WebSockets, and routes incoming binary audio frames.
- **AWS Lambda (Connection Manager):** Handles `$connect`, `$disconnect`, and authentication events.
- **AWS Fargate / ECS (Transcriber Service):** For continuous streaming, a persistent containerized service receives the audio buffer and streams it to Amazon Transcribe via HTTP/2 or WebSocket.

### 2.3. Amazon Transcribe (The Engine)
The core AWS service that converts speech to text.
- **Streaming Transcription:** Operates with sub-second latency.
- **Speaker Diarization:** Identifies distinct voices to attribute text to "Speaker A", "Speaker B", etc.
- **Custom Vocabulary:** Supports domain-specific jargon injected dynamically.

### 2.4. lma-ai-stack (The Intelligence Layer)
Triggered asynchronously after a meeting concludes.
- **Amazon S3:** Stores the raw JSON transcript outputs.
- **S3 Event Notifications:** Triggers an AWS Lambda function upon the creation of a new transcript file.
- **AI Processing Lambda:** Connects to an LLM (e.g., Anthropic Claude or Amazon Bedrock/Titan) to process the transcript, extracting summaries, action items, and sentiment analysis.

### 2.5. Supabase (The Data & Security Layer)
The PostgreSQL-backed Backend-as-a-Service.
- **Real-time Database:** Stores user profiles, meeting metadata, raw transcripts, and AI-generated summaries.
- **Row Level Security (RLS):** Crucial for multi-tenant isolation. Policies ensure that `Tenant A` cannot read `Tenant B`'s transcripts, enforced directly at the Postgres engine level.
- **Real-time Subscriptions:** Allows the frontend dashboard to update instantly when a new summary is generated.

## 3. Data Flow Diagram

1. **Meeting Starts:** User clicks "Start" in the Browser Extension.
2. **Connection:** Extension opens a WebSocket to API Gateway. API Gateway triggers a Lambda to validate the user via Supabase JWT.
3. **Streaming:** Audio is captured in 100ms chunks and sent as binary payloads over the WebSocket.
4. **Transcription:** The ECS Transcriber service forwards the buffer to Amazon Transcribe.
5. **Live Output:** Transcribe returns JSON payloads with transcribed text. The ECS service forwards this back to the API Gateway, which pushes it to the Browser Extension for display.
6. **Persistence:** The transcript is saved periodically to Supabase for the live dashboard.
7. **Meeting Ends:** The WebSocket disconnects. The full transcript is dumped to an S3 bucket.
8. **AI Summarization:** S3 triggers the `lma-ai-stack` Lambda. The Lambda runs the LLM prompt and writes the final `summary_text` and `action_items` to Supabase.

## 4. Database Schema (Supabase / PostgreSQL)

### Table: `users`
- `id` (uuid, PK): Matches Supabase Auth ID.
- `tenant_id` (uuid, FK): Links to the organization.
- `email` (varchar)

### Table: `meetings`
- `id` (uuid, PK)
- `tenant_id` (uuid, FK)
- `start_time` (timestamptz)
- `platform` (varchar): e.g., 'Google Meet', 'Zoom'

### Table: `transcripts`
- `id` (uuid, PK)
- `meeting_id` (uuid, FK)
- `speaker_label` (varchar)
- `text_segment` (text)
- `timestamp` (float)

### Table: `meeting_summaries`
- `id` (uuid, PK)
- `meeting_id` (uuid, FK)
- `summary_text` (text)
- `action_items` (jsonb)

## 5. Security & Multi-Tenancy Design
The system employs a strict tenant-isolation model. Every request from the browser extension carries a JWT signed by Supabase. The AWS Lambda authorizer verifies this token before allowing the WebSocket connection. Database queries from any layer use the Supabase client authenticated with the user's token, ensuring PostgreSQL RLS policies automatically filter out unauthorized rows.
