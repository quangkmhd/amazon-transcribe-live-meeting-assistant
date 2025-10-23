COMPREHENSIVE CODEBASE ANALYSIS: Live Meeting Assistant (LMA)
Executive Summary
This is Amazon Live Meeting Assistant (LMA) - a sophisticated, enterprise-grade AWS solution for real-time meeting transcription, analysis, and AI-powered assistance. The codebase is a multi-stack CloudFormation project designed to capture audio from browser-based meetings, transcribe it using Amazon Transcribe, and provide intelligent insights using Amazon Bedrock, Amazon Q Business, or Knowledge Bases.

1. COMPLETE DIRECTORY STRUCTURE AND FILE INVENTORY
Root Level Structure
amazon-transcribe-live-meeting-assistant/
├── .gitignore                          # Git ignore rules
├── AGENTS.md                           # Agent coding guidelines and MCP instructions
├── README.md                           # Main documentation (418 lines)
├── lma-main.yaml                       # Main CloudFormation entry point (empty placeholder)
├── docs/                               # Architecture documentation (8 files)
├── images/                             # Documentation images (1 item)
├── patches/                            # QnABot patches (4 items)
├── utilities/                          # Utility scripts (8 items)
│   ├── custom-vocab/                   # Custom vocabulary tools
│   └── websocket-client/               # WebSocket testing client
├── lma-ai-stack/                       # Core application stack (231 items)
├── lma-bedrockagent-stack/             # Bedrock Agent integration (2 items)
├── lma-bedrockkb-stack/                # Bedrock Knowledge Base stack (13 items)
├── lma-browser-extension-stack/        # Chrome extension (59 items)
├── lma-cognito-stack/                  # Authentication stack (1 item)
├── lma-llm-template-setup-stack/       # LLM template configuration (5 items)
├── lma-meetingassist-setup-stack/      # Meeting assistant setup (19 items)
├── lma-virtual-participant-stack/      # Virtual participant bot (17 items)
├── lma-vpc-stack/                      # Network infrastructure (2 items)
├── lma-websocket-transcriber-stack/    # WebSocket server stack (26 items)
├── qnabot-on-aws/                      # QnABot solution (1034 items)
└── soniox_examples/                    # Soniox speech-to-text examples (168 items)
2. PROJECT PURPOSE AND MAIN FUNCTIONALITY
What This Project Does
Live Meeting Assistant (LMA) is a comprehensive AWS solution that provides:

Real-time Speech-to-Text Transcription - Uses Amazon Transcribe for low-latency, accurate transcription with speaker attribution
Live Translation - Translates conversations into 75+ languages using Amazon Translate
AI-Powered Meeting Assistant - Context-aware Q&A using Amazon Q Business, Bedrock Knowledge Bases, or Bedrock LLMs
On-Demand Summaries - Generate meeting summaries, action items, and insights using Amazon Bedrock
Meeting Recording - Stores stereo audio recordings in S3
Meeting Inventory & Search - Searchable database of all meetings with cross-meeting queries
Browser Integration - Chrome extension captures audio and metadata from Zoom, Teams, WebEx, Meet, and Chime
Key Use Cases
Taking notes during meetings automatically
Real-time fact-checking and information lookup
Quick catch-up summaries for late joiners
Language translation for multilingual meetings
Post-meeting action item tracking
Searchable meeting history and knowledge base
3. DETAILED COMPONENT BREAKDOWN
3.1 LMA-AI-STACK (Core Application)
Location: 
/lma-ai-stack/
 Purpose: Central application logic, GraphQL API, Lambda functions, and web UI

Key Subdirectories:
A. Lambda Functions (
source/lambda_functions/
)

call_event_processor/
 - Main event processor consuming Kinesis streams
Processes transcript segments from WebSocket server
Enriches with sentiment analysis (Amazon Comprehend)
Handles meeting assistant requests
Manages GraphQL mutations to DynamoDB
Key file: 
lambda_function.py
 (139 lines)
bedrock_summary_lambda/
 - Generates post-meeting summaries
Uses Bedrock LLMs (Claude/Titan) to summarize transcripts
Extracts action items, topics, issues
Triggered at meeting end
meeting_controls_resolver/
 - GraphQL resolver for meeting controls
Start/stop/pause meeting operations
query_knowledgebase_resolver/
 - Queries Bedrock Knowledge Base
Searches meeting transcripts across all meetings
virtual_participant_manager/
 - Manages virtual participant lifecycle
Starts/stops Fargate tasks for virtual participants
meeting_invitation_parser/
 - Parses meeting invitations
Extracts meeting details from calendar invites
async_agent_assist_orchestrator/
 - Orchestrates agent assistance
async_transcript_summary_orchestrator/
 - Manages summary generation
fetch_transcript/
 - Retrieves transcript data
start_codebuild/
 - Triggers CodeBuild for deployments
strands_chat_interface/
 - Chat interface integration
B. Lambda Layers (
source/lambda_layers/
)

transcript_enrichment_layer/ - Shared utilities for transcript processing
appsync_utils.py - AppSync GraphQL client
transcript_batch_processor.py - Batch processing logic
Dependencies: AWS SDK, PowerTools
C. AppSync GraphQL API (
source/appsync/
)

schema.graphql
 - Complete GraphQL schema (531 lines)
Defines Call, TranscriptSegment, CallList entities
Mutations: createCall, addTranscriptSegment, updateCallStatus
Subscriptions: Real-time updates for live transcription
Query resolvers for meeting data
D. Web UI (
source/ui/
)

Technology: React 17 with AWS Amplify
Key Features:
Live transcript display with speaker attribution
Translation interface
Meeting assistant chat
Recording playback
Meeting list and search
User authentication (Cognito)
Package Dependencies (
package.json
):

json
- React 17.0.2
- AWS Amplify 4.3.21
- @awsui/components-react 3.0.496 (CloudScape Design System)
- GraphQL client libraries
- Audio player components
- Markdown rendering
E. Build System

Makefile
 (796 lines) - Sophisticated build automation
Python virtual environments (dev & build)
SAM build integration
Linting: cfn-lint, pylint, flake8, mypy, eslint
Formatters: black, prettier
Security: bandit scanning
3.2 LMA-WEBSOCKET-TRANSCRIBER-STACK (Audio Streaming)
Location: 
/lma-websocket-transcriber-stack/
 Purpose: WebSocket server running on AWS Fargate to handle real-time audio streaming

Architecture:
Runtime: Node.js 16 on Fargate (0.25 vCPU)
Container: Docker with multi-stage build
Framework: Fastify + @fastify/websocket
Key Components:
A. Application (
source/app/src/
)

index.ts
 - Main WebSocket server (637 lines)
Fastify server setup (port 8080)
JWT verification (AWS Cognito)
WebSocket connection handling
Audio streaming to Amazon Transcribe
Event publishing to Kinesis
S3 recording creation (WAV format)
B. Core Modules:

calleventdata.ts - Manages call events
START, END, RECORDING events
Kinesis Data Streams publishing
Call metadata management
utils/ - Utility functions
WAV header creation
JWT verification
Error logging
Client IP detection
C. Dependencies (
package.json
):

json
- @aws-sdk/client-transcribe-streaming
- @aws-sdk/client-kinesis
- @aws-sdk/client-s3
- fastify 3.27.3
- aws-jwt-verify 4.0.0
- TypeScript 4.6.0
D. Lambda Functions (
source/lambda_functions/
)

pca_integration/ - Post Call Analytics integration
start_codebuild/
 - Deployment triggers
3.3 LMA-BROWSER-EXTENSION-STACK (Chrome Extension)
Location: 
/lma-browser-extension-stack/
 Purpose: Chrome extension for capturing meeting audio and metadata

Technology Stack:
Framework: React + TypeScript
Build: Webpack-based Chrome extension builder
Manifest: Chrome Extension Manifest V3
Key Features:
Detects meeting platforms (Zoom, Teams, WebEx, Meet, Chime)
Captures microphone audio (AGENT channel)
Captures meeting app audio (CALLER channel)
Active speaker detection
WebSocket streaming to Fargate server
Meeting metadata extraction (title, participants)
Structure (
src/
):
components/
 (15 items) - React UI components
Login form
Meeting controls
Status indicators
context/
 (4 items) - React context providers
Authentication state
Meeting state
App.tsx
 - Main extension application
Build Output:
Packaged as lma-chrome-extension.zip
Distributed via CloudFormation stack outputs
Loaded unpacked in Chrome
3.4 LMA-MEETINGASSIST-SETUP-STACK (AI Assistant)
Location: 
/lma-meetingassist-setup-stack/
 Purpose: Configures meeting assistant using QnABot on AWS

Components:
A. QnABot Integration (
src/
)

Lambda functions for QnABot customization
Integration with Amazon Lex V2
OpenSearch for FAQ storage
Custom prompts and responses
B. Lambda Layers:

boto3_layer/
 - Updated AWS SDK
strands_layer/
 - Custom utilities
C. Demo Data:

qna-ma-demo.jsonl
 - Sample Q&A content
qna-ma-healthcare-demo.jsonl
 - Healthcare-specific examples
D. Supported Backends:

Amazon Q Business - Enterprise knowledge management
Bedrock Knowledge Base - Document-based RAG
Bedrock Agent - Agentic workflows with actions
Bedrock LLM - Direct LLM queries (no KB)
Documentation:

README_QBUSINESS.md
 - Q Business integration guide (8653 bytes)
README_BEDROCK_AGENT.md
 - Bedrock Agent setup (7054 bytes)
3.5 LMA-BEDROCK-KB-STACK (Knowledge Base Management)
Location: 
/lma-bedrockkb-stack/
 Purpose: Creates and manages Bedrock Knowledge Bases

Features:
Document Knowledge Base - For meeting assistant context
S3 bucket data sources
Web crawler for public URLs
Embeddings: Titan Text Embeddings V2
Transcript Knowledge Base - For cross-meeting queries
Stores meeting summaries and transcripts
Auto-syncs every 15 minutes (EventBridge)
User-based access control (UBAC)
Lambda Functions (
src/
):
KB creation and configuration
Data source management
Sync scheduling
OpenSearch integration
Lambda Layer:
opensearchpy_layer/
 - OpenSearch Python client
3.6 LMA-VIRTUAL-PARTICIPANT-STACK (Bot Participant)
Location: 
/lma-virtual-participant-stack/
 Purpose: Autonomous bot that joins meetings as a separate participant

Architecture:
Runtime: ECS Fargate task
Browser: Headless Puppeteer (Chrome)
Orchestration: AWS Step Functions state machine
Capabilities:
Joins Chime and Zoom meetings programmatically
Captures audio without requiring browser extension
Posts chat messages (intro, recording status)
Scheduled meeting support
Docker containerized (
backend/Dockerfile
)
Status: Preview/Beta
Limited platform support (Chime, Zoom only)
Lacks comprehensive error handling
No pause/resume controls yet
Backend (
backend/
):
Node.js application with Puppeteer
Meeting platform adapters
Audio capture and streaming
Step Functions integration
3.7 LMA-VPC-STACK (Network Infrastructure)
Location: 
/lma-vpc-stack/
 Purpose: Provisions VPC, subnets, security groups, and NAT gateways

Resources:
VPC with public/private subnets
Security groups for Fargate tasks
NAT gateways for private subnet access
VPC endpoints for AWS services
3.8 LMA-COGNITO-STACK (Authentication)
Location: 
/lma-cognito-stack/
 Purpose: User authentication and authorization

Features:
Cognito User Pool for authentication
Admin and non-admin user roles
Email-based user verification
Domain-based auto-registration
User-Based Access Control (UBAC)
3.9 QNABOT-ON-AWS (Embedded Solution)
Location: 
/qnabot-on-aws/
 (1034 items) Purpose: Full QnABot on AWS open-source solution

Key Components:
Lambda functions (26+ functions)
Amazon Lex integration
OpenSearch for FAQ storage
CloudFormation templates
Web designer UI
Import/export functionality
Lambda hook SDK
Documentation:

README.md
 (29,349 bytes)
CHANGELOG.md
 (55,828 bytes)
3.10 SONIOX_EXAMPLES (Alternative Transcription)
Location: 
/soniox_examples/
 (168 items) Purpose: Examples for Soniox speech-to-text API (alternative to Amazon Transcribe)

Contents:
Python implementation
Node.js implementation
React demo application
React Native demo
WebSocket streaming examples
3.11 UTILITIES (Development Tools)
Location: 
/utilities/

A. Custom Vocabulary (
custom-vocab/
)
Tools for creating Amazon Transcribe custom vocabularies
Improves accuracy for domain-specific terms
B. WebSocket Client (
websocket-client/
)
Testing tool for WebSocket server
Simulates browser extension connections
4. COMPLETE TECHNOLOGY STACK
Languages:
Python 3.8+ - Lambda functions, backend processing
TypeScript/JavaScript (Node.js 16) - WebSocket server, browser extension
JavaScript (React 17) - Web UI
GraphQL - API schema definition
AWS Services Used:
Compute:
AWS Lambda (serverless functions)
AWS Fargate (WebSocket server, Virtual Participant)
Amazon ECS (container orchestration)
Storage:
Amazon S3 (recordings, transcripts, artifacts)
Amazon DynamoDB (single-table design for calls/segments)
Amazon OpenSearch Service (QnABot FAQ storage)
AI/ML:
Amazon Transcribe (speech-to-text)
Amazon Translate (translation)
Amazon Comprehend (sentiment analysis)
Amazon Bedrock (LLMs: Claude 3.x, Titan)
Amazon Bedrock Knowledge Bases (RAG)
Amazon Bedrock Agents (agentic workflows)
Amazon Q Business (enterprise knowledge)
Integration:
AWS AppSync (GraphQL API, real-time subscriptions)
Amazon Kinesis Data Streams (event streaming)
Amazon EventBridge (scheduling, triggers)
AWS Step Functions (workflow orchestration)
Networking:
Amazon VPC (network isolation)
Application Load Balancer (WebSocket traffic)
Amazon CloudFront (static asset delivery)
Security & Management:
Amazon Cognito (authentication)
AWS IAM (authorization)
AWS Systems Manager Parameter Store (configuration)
AWS CloudWatch (logging, monitoring)
Development & Deployment:
AWS CloudFormation (infrastructure as code)
AWS SAM (Serverless Application Model)
AWS CodeBuild (CI/CD)
Frontend Frameworks:
React 17.0.2
AWS Amplify 4.3.21
CloudScape Design System (@awsui/components-react)
React Router 5.3.0
Backend Frameworks:
Fastify 3.27.3 (WebSocket server)
AWS Lambda Powertools (Python observability)
Boto3 (AWS SDK for Python)
AWS SDK v3 (JavaScript)
Build Tools:
Make (build automation)
npm/Node.js (JavaScript package management)
pip/Python (Python package management)
SAM CLI (deployment)
Docker (containerization)
Code Quality Tools:
Python: pylint, flake8, mypy, black, bandit
JavaScript: ESLint, Prettier
CloudFormation: cfn-lint
YAML: yamllint
5. ARCHITECTURE AND DATA FLOW
5.1 High-Level Architecture
Browser Extension (Chrome)
    ↓ (WebSocket + JWT Auth)
Fargate WebSocket Server
    ↓ (Audio Stream)
Amazon Transcribe
    ↓ (Transcript Segments)
Kinesis Data Streams
    ↓ (Events)
Lambda: Call Event Processor
    ↓ (GraphQL Mutations)
AppSync API ←→ DynamoDB
    ↓ (Subscriptions)
React Web UI
5.2 Complete Data Flow
Step 1: Meeting Start
User opens Chrome extension and logs in (Cognito)
User joins meeting in browser (Zoom/Teams/WebEx/Meet/Chime)
Extension detects meeting platform and extracts metadata
User clicks "Start Listening"
Extension establishes WebSocket connection to Fargate server
Sends START event with CallId, meeting title, owner, timestamp
Lambda processes START event → GraphQL createCall mutation → DynamoDB
AppSync subscription notifies Web UI → Meeting appears "In Progress"
Step 2: Audio Streaming & Transcription
Extension captures dual audio streams:
Microphone (AGENT channel)
Meeting app audio (CALLER channel)
Sends audio chunks via WebSocket (PCM format)
Fargate server:
Streams audio to Amazon Transcribe (real-time API)
Receives transcript segments with timestamps
Detects active speaker changes from extension
Publishes events to Kinesis Data Streams:
ADD_TRANSCRIPT_SEGMENT events
Speaker attribution data
Lambda Call Event Processor:
Reads from Kinesis
Enriches with sentiment (Amazon Comprehend)
Formats transcript segments
GraphQL addTranscriptSegment mutation → DynamoDB
AppSync subscription → Web UI updates live transcript display
Step 3: Meeting Assistant Queries
Trigger: User says "OK Assistant" OR clicks "ASK ASSISTANT"

Extension/Web UI sends message via AppSync
Lambda processes assistant request:
Extracts recent transcript context
Routes to configured backend:
Option A: QnABot → Lex → Lambda → OpenSearch → Bedrock KB
Option B: Direct Bedrock Knowledge Base query
Option C: Amazon Q Business query
Option D: Direct Bedrock LLM (Claude/Titan)
Response formatted as transcript segment (Channel: AGENT_ASSISTANT)
GraphQL mutation → DynamoDB → AppSync → Web UI displays answer
Step 4: Meeting End
User clicks "Stop Streaming"
Extension sends END event → WebSocket server
Fargate server:
Stops audio streaming
Finalizes stereo WAV recording
Uploads to S3
Publishes END event to Kinesis
Lambda processes END:
Updates call status → ENDED
Invokes Bedrock Summary Lambda
Summary Lambda:
Retrieves full transcript from DynamoDB
Sends prompts to Bedrock (Claude):
Generate overall summary
Extract action items
Identify key topics
Detect issues/concerns
Writes results via GraphQL mutations
Transcript written to S3 (for KB sync)
EventBridge triggers KB data source sync (every 15 min)
Web UI displays post-meeting summaries
6. DATABASE SCHEMA (DynamoDB)
Single-Table Design: CallsTable
Primary Key Structure:

PK (Partition Key): Entity identifier
SK (Sort Key): Type-specific identifier
Entity Types:
1. Call Entity
PK: c#{CallId}
SK: c#{CallId}

Attributes:
- CallId: UUID
- CustomerPhoneNumber: Meeting title
- AgentId: Owner name
- Status: STARTED | TRANSCRIBING | ENDED | ERRORED
- CreatedAt, UpdatedAt: Timestamps
- RecordingUrl: S3 URL
- CallSummaryText: Bedrock-generated summary
- CallCategories: [topics]
- IssuesDetected: Problems identified
- Sentiment: { OverallSentiment, SentimentByPeriod }
- Owner: User email (UBAC)
- SharedWith: Comma-separated emails
- ExpiresAfter: TTL timestamp
2. TranscriptSegment Entity
PK: c#{CallId}
SK: ts#{timestamp}#{SegmentId}

Attributes:
- SegmentId: UUID
- StartTime, EndTime: Float (seconds)
- Transcript: Spoken text
- IsPartial: Boolean
- Channel: CALLER | AGENT | AGENT_ASSISTANT | CHAT_ASSISTANT
- Speaker: Name or "Assistant"
- Sentiment: POSITIVE | NEGATIVE | NEUTRAL | MIXED
- SentimentScore: { Positive, Negative, Neutral, Mixed }
- Owner, SharedWith: UBAC fields
3. CallList Entity
PK: cl#{date}#{shard}
SK: cl#{timestamp}#{CallId}

Purpose: Efficient date-based queries
Used by: Meeting list page
Access Patterns:
Get call by ID: Query PK=c#{CallId}, SK=c#{CallId}
Get all segments for call: Query PK=c#{CallId}, SK begins_with "ts#"
List calls by date: Query PK=cl#{date}#{shard}
Filter by owner: Query with Owner attribute filter (UBAC)
7. GRAPHQL API STRUCTURE
Schema Overview (
schema.graphql
)
Types:
Call - Meeting metadata and aggregated data
CallListItem - Simplified call info for listings
TranscriptSegment - Individual transcript pieces
SentimentAggregation - Sentiment scores by period
CallList - Paginated call collection
Key Mutations:
graphql
createCall(input: CreateCallInput!): Call
addTranscriptSegment(input: AddTranscriptSegmentInput!): TranscriptSegment
updateCallStatus(callId: ID!, status: CallStatus!): Call
updateCall(input: UpdateCallInput!): Call
shareTranscriptSegment(input: ShareTranscriptSegmentInput!): Output
deleteTranscriptSegment(input: DeleteTranscriptSegmentInput!): Output
Key Queries:
graphql
getCall(callId: ID!): Call
listCalls(nextToken: String, maxItems: Int): CallList
getTranscriptSegments(callId: ID!): [TranscriptSegment]
Subscriptions (Real-time):
graphql
onCreateCall: Call
onUpdateCall: Call
onAddTranscriptSegment: TranscriptSegment
Authorization:
@aws_cognito_user_pools - User authentication
@aws_iam - Service-to-service
8. AUTHENTICATION & AUTHORIZATION
Amazon Cognito Integration
User Types:
Admin User - Full access to all meetings
Email specified during stack deployment
Can see all users' meetings
Can manage users
Non-Admin Users - Limited to own meetings
Auto-registered if domain matches
Can only see own meetings (UBAC)
Can share meetings with others
User-Based Access Control (UBAC)
Owner field on all entities (email address)
SharedWith field - Comma-separated email list
GraphQL resolvers filter by authenticated user
Transcript KB queries filtered by owner
Authentication Flow:
User logs in via Amplify Auth UI
Cognito returns JWT tokens
Tokens included in:
AppSync GraphQL requests (Authorization header)
WebSocket connections (query parameter)
JWT verified at each entry point
9. CONFIGURATION FILES AND SETUP
CloudFormation Templates:
lma-main.yaml
 - Main stack entry point (empty, uses nested stacks)
lma-ai-stack/template.yaml - Core application (SAM template)
lma-websocket-transcriber-stack/template.yaml - WebSocket server
lma-browser-extension-stack/template.yaml
 - Extension packaging
lma-meetingassist-setup-stack/template.yaml
 - QnABot setup (50,945 bytes)
lma-bedrockkb-stack/template.yaml
 - Knowledge Base creation
lma-vpc-stack/template.yaml
 - Network infrastructure
lma-cognito-stack/template.yaml - Authentication
lma-virtual-participant-stack/template.yaml
 - Virtual bot (56,908 bytes)
Build Configuration:
Makefile (
lma-ai-stack/Makefile
)
Targets: install, build, lint, test, package, deploy, publish
Required ENV: CONFIG_ENV (maps to SAM config-env)
Optional Config Files:
config.mk
 - Shared configuration
config-$(USER).mk - User-specific overrides
SAM Configuration (samconfig.toml)
Generated per environment
Contains stack parameters, S3 buckets, regions
Python Requirements:
requirements/requirements-build.txt - Build dependencies
requirements/requirements-dev.txt - Dev dependencies (linters, formatters)
Per-Lambda 
requirements.txt
 - Function-specific deps
Node.js Configuration:
package.json
 - Build scripts, dependencies
tsconfig.json
 - TypeScript compiler options
.eslintrc.json
 - Linting rules
.prettierrc
 - Code formatting
Environment Variables (WebSocket Server):
bash
AWS_REGION=us-east-1
RECORDINGS_BUCKET_NAME=<bucket>
RECORDING_FILE_PREFIX=lma-audio-recordings/
SHOULD_RECORD_CALL=true
CPU_HEALTH_THRESHOLD=50
LOCAL_TEMP_DIR=/tmp/
WS_LOG_LEVEL=debug
SSM Parameters:
/LMA/Settings - JSON configuration
AssistantWakePhraseRegEx
CategoryAlertRegex
Meeting assistant settings
LLM prompts
10. ENTRY POINTS AND EXECUTION FLOW
Primary Entry Points:
1. Browser Extension
File: 
lma-browser-extension-stack/src/index.tsx

React application initialization
Chrome extension lifecycle hooks
WebSocket client creation
Audio capture setup
2. WebSocket Server
File: 
lma-websocket-transcriber-stack/source/app/src/index.ts

Fastify server initialization (port 8080)
WebSocket route: /api/v1/audio-ws
Health check: /health
Container runs as node user
Docker Entrypoint:

dockerfile
ENTRYPOINT ["node", "/app/dist/index.js"]
3. Web UI
File: 
lma-ai-stack/source/ui/src/index.js

React application root
Amplify configuration
AppSync client setup
Router initialization
Build Command:

bash
npm run build  # Creates optimized production build
4. Lambda Functions
Handler Format: lambda_function.lambda_handler (Python)

Execution Trigger:

Call Event Processor: Kinesis Data Stream (batch processing)
Summary Lambda: Direct invoke from Call Event Processor
GraphQL Resolvers: AppSync integration
Virtual Participant Manager: AppSync mutation
5. Step Functions (Virtual Participant)
State Machine: SchedulerStateMachine

Handles POST/GET/DELETE operations
Launches Fargate tasks
Manages meeting schedules
11. EXTERNAL DEPENDENCIES
Python Packages:
boto3 - AWS SDK
aws-lambda-powertools - Observability
cryptography - Encryption utilities
debugpy - Debugging (optional)
Node.js Packages:
WebSocket Server:

@aws-sdk/* - AWS SDK v3 modules
fastify - Web framework
aws-jwt-verify - JWT validation
uuid - UUID generation
block-stream2 - Stream processing
Browser Extension:

react - UI framework
typescript - Type safety
webpack - Module bundler
Web UI:

aws-amplify - AWS integration
@awsui/components-react - CloudScape UI
graphql-tag - GraphQL queries
react-router-dom - Routing
react-markdown - Markdown rendering
axios - HTTP client
AWS Service Dependencies:
Transcribe streaming API
Bedrock runtime API
DynamoDB streams
S3 GetObject/PutObject
Cognito UserPools
AppSync GraphQL
12. MISSING OR INCOMPLETE COMPONENTS
Identified Gaps:
Empty Main Template
lma-main.yaml
 is empty (0 bytes)
Should contain nested stack definitions
Currently deployment uses S3-hosted templates
Virtual Participant (Beta Status)
Limited to Chime and Zoom
No UI error handling
No pause/resume controls
No status visibility in UI
Browser Extension Platform Support
Only Chrome currently supported
Firefox, Edge, Safari planned but not implemented
Documentation Gaps
No CHANGELOG.md in root (only in qnabot-on-aws)
VERSION file contains placeholder token
Missing API documentation for developers
Testing Infrastructure
Test files exist but no comprehensive test suite documentation
No integration test framework visible
Limited E2E testing setup
Soniox Integration
soniox_examples/
 present but not integrated into main stacks
Appears to be alternative to Amazon Transcribe
No CloudFormation deployment for Soniox path
13. POTENTIAL ISSUES AND RECOMMENDATIONS
Security Considerations:
Issues:
JWT in WebSocket Query String - Tokens
The model's generation exceeded the maximum output token limit.
I'll provide a condensed comprehensive analysis that fits within the token limit.

6 more
Document entry points and execution flow

8
Provide analysis summary and recommendations

COMPLETE CODEBASE ANALYSIS: Amazon Live Meeting Assistant (LMA)
📋 EXECUTIVE SUMMARY
Project: Amazon Live Meeting Assistant (LMA)
Type: Enterprise-grade AWS CloudFormation multi-stack solution
Purpose: Real-time meeting transcription, AI-powered assistance, and intelligent meeting analytics
Architecture: Serverless microservices with event-driven processing
Languages: Python 3.8+, TypeScript/Node.js 16, React 17
Primary AWS Services: Transcribe, Bedrock, AppSync, Lambda, Fargate, DynamoDB, S3, Kinesis

1. DIRECTORY STRUCTURE & COMPONENTS
amazon-transcribe-live-meeting-assistant/
├── 📁 lma-ai-stack/ (231 items)           # Core application: Lambda, AppSync, Web UI
├── 📁 lma-websocket-transcriber-stack/     # Fargate WebSocket server (Node.js)
├── 📁 lma-browser-extension-stack/         # Chrome extension (React+TypeScript)
├── 📁 lma-meetingassist-setup-stack/       # QnABot + AI assistant configuration
├── 📁 lma-bedrockkb-stack/                 # Knowledge Base management
├── 📁 lma-virtual-participant-stack/       # Bot participant (Puppeteer+Fargate)
├── 📁 lma-vpc-stack/                       # Network infrastructure
├── 📁 lma-cognito-stack/                   # Authentication (Cognito User Pool)
├── 📁 qnabot-on-aws/ (1034 items)         # Embedded QnABot solution
├── 📁 soniox_examples/ (168 items)        # Alternative speech-to-text examples
├── 📁 docs/                                # Architecture documentation
├── 📁 utilities/                           # Dev tools (websocket-client, custom-vocab)
├── 📁 patches/                             # QnABot patches
├── 📄 README.md (418 lines)               # Main documentation
├── 📄 AGENTS.md                            # Coding guidelines for AI agents
└── 📄 lma-main.yaml                        # CloudFormation entry point
2. WHAT THIS PROJECT DOES
Core Functionality
Real-time Transcription - Captures audio from browser meetings (Zoom, Teams, WebEx, Meet, Chime) and transcribes using Amazon Transcribe with speaker attribution
AI Meeting Assistant - Answers questions using Amazon Q Business, Bedrock Knowledge Bases, or Bedrock LLMs with meeting context
Live Translation - Translates conversations into 75+ languages via Amazon Translate
Automated Summaries - Generates meeting summaries, action items, topics, and issues using Bedrock (Claude/Titan)
Meeting Recording - Stores stereo WAV recordings in S3
Searchable Archive - Cross-meeting queries via Bedrock Knowledge Base
User-Based Access Control - Each user sees only their meetings (admin sees all)
Use Cases
Automatic note-taking during meetings
Real-time fact-checking and information lookup
Quick catch-up for late joiners
Multilingual meeting support
Post-meeting action item extraction
Historical meeting search and analysis
3. ARCHITECTURE & DATA FLOW
High-Level Architecture
Chrome Extension → WebSocket (Fargate) → Amazon Transcribe
                                       ↓
                              Kinesis Data Streams
                                       ↓
                          Lambda: Call Event Processor
                                       ↓
                    AppSync GraphQL ←→ DynamoDB
                                       ↓
                               React Web UI
Complete Data Flow
Meeting Start:

User opens Chrome extension, logs in (Cognito JWT)
Joins meeting in browser, clicks "Start Listening"
Extension establishes WebSocket to Fargate server
Sends START event → Kinesis → Lambda → GraphQL createCall → DynamoDB
Web UI receives real-time update via AppSync subscription
Audio Streaming:

Extension captures dual audio: microphone (AGENT) + meeting audio (CALLER)
Streams PCM audio chunks to Fargate WebSocket server
Fargate streams to Amazon Transcribe real-time API
Receives transcript segments → publishes to Kinesis
Lambda processes segments: adds sentiment (Comprehend), formats data
GraphQL addTranscriptSegment → DynamoDB → AppSync → Web UI live updates
Meeting Assistant:

User says "OK Assistant" or clicks button
Lambda extracts recent transcript context
Routes to configured backend:
QnABot → Lex → OpenSearch → Bedrock KB
Direct Bedrock Knowledge Base query
Amazon Q Business query
Direct Bedrock LLM (no KB)
Response added as transcript segment (AGENT_ASSISTANT channel)
Meeting End:

User clicks "Stop Streaming" → END event → Kinesis
Fargate finalizes stereo WAV recording → uploads to S3
Lambda invokes Bedrock Summary Lambda
Summary Lambda: retrieves transcript, sends prompts to Bedrock
Generates: summary, action items, topics, issues → saves to DynamoDB
Transcript saved to S3, synced to Knowledge Base every 15 min
4. KEY COMPONENTS DETAILED
A. lma-ai-stack (Core Application)
Lambda Functions:

call_event_processor/
 - Main event handler (Kinesis consumer, sentiment analysis, GraphQL mutations)
bedrock_summary_lambda/
 - Post-meeting summarization with Bedrock
query_knowledgebase_resolver/
 - Cross-meeting search
virtual_participant_manager/
 - Manages Fargate bot lifecycle
meeting_controls_resolver/
 - Start/stop/pause operations
AppSync GraphQL API (
schema.graphql
 - 531 lines):

Types: Call, TranscriptSegment, CallList, SentimentAggregation
Mutations: createCall, addTranscriptSegment, updateCallStatus
Subscriptions: Real-time updates for live transcription
Authorization: @aws_cognito_user_pools, @aws_iam
Web UI (
source/ui/
 - React 17):

AWS Amplify + CloudScape Design System
Live transcript display with speaker attribution
Translation interface, meeting assistant chat
Recording playback, meeting list
Dependencies: react 17.0.2, aws-amplify 4.3.21, @awsui/components-react 3.0.496
Build System (
Makefile
 - 796 lines):

Python virtual envs (dev & build)
SAM build integration
Linting: cfn-lint, pylint, flake8, mypy, eslint, prettier
Security: bandit scanning
B. lma-websocket-transcriber-stack (Audio Server)
Technology: Node.js 16 on Fargate (0.25 vCPU), Fastify + WebSocket Dockerfile: Multi-stage build (builder → runtime)

Key Files:

index.ts
 (637 lines) - Main WebSocket server, JWT verification, audio streaming
calleventdata.ts - Kinesis event publishing, call metadata management
utils/ - WAV header creation, JWT verification, error handling
Flow:

Accepts WebSocket connections on port 8080
Verifies Cognito JWT tokens
Streams audio to Amazon Transcribe Streaming API
Publishes events to Kinesis Data Streams
Creates stereo WAV recordings in S3
C. lma-browser-extension-stack (Chrome Extension)
Technology: React + TypeScript, Chrome Manifest V3

Features:

Auto-detects meeting platforms (Zoom, Teams, WebEx, Meet, Chime)
Captures microphone + meeting app audio
Active speaker detection
Meeting metadata extraction (title, participants)
WebSocket streaming to Fargate
Structure:

src/components/
 (15 items) - UI components
src/context/
 (4 items) - React context providers
App.tsx
 - Main extension application
D. lma-meetingassist-setup-stack (AI Assistant)
Purpose: Configures meeting assistant using QnABot on AWS

Supported Backends:

Amazon Q Business - Enterprise knowledge management
Bedrock Knowledge Base - Document RAG
Bedrock Agent - Agentic workflows with actions
Bedrock LLM - Direct queries (no KB)
Components:

QnABot Lambda functions
Amazon Lex V2 integration
OpenSearch for FAQ storage
Custom prompts and responses
Demo Q&A content (JSONL format)
E. lma-virtual-participant-stack (Beta)
Technology: ECS Fargate + Puppeteer (headless Chrome), Step Functions

Capabilities:

Joins Chime/Zoom meetings programmatically
Captures audio without browser extension
Posts chat messages (intro, recording status)
Scheduled meeting support
Status: Preview - Limited platforms, lacks error handling, no pause/resume

5. DATABASE SCHEMA (DynamoDB)
Single-Table Design: CallsTable

Entity Types:

1. Call Entity

PK: c#{CallId}
SK: c#{CallId}
Attributes: CallId, Status, RecordingUrl, CallSummaryText, CallCategories, 
            IssuesDetected, Sentiment, Owner, SharedWith, ExpiresAfter
2. TranscriptSegment Entity

PK: c#{CallId}
SK: ts#{timestamp}#{SegmentId}
Attributes: SegmentId, StartTime, EndTime, Transcript, IsPartial, Channel,
            Speaker, Sentiment, SentimentScore, Owner, SharedWith
3. CallList Entity

PK: cl#{date}#{shard}
SK: cl#{timestamp}#{CallId}
Purpose: Efficient date-based queries for meeting list
Channels: CALLER, AGENT, AGENT_ASSISTANT, CHAT_ASSISTANT, CATEGORY_MATCH
Status: STARTED, TRANSCRIBING, ENDED, ERRORED

6. TECHNOLOGY STACK
Languages
Python 3.8+ (Lambda functions)
TypeScript/JavaScript Node.js 16 (WebSocket server, extension)
JavaScript React 17 (Web UI)
GraphQL (API schema)
AWS Services
Compute: Lambda, Fargate, ECS
Storage: S3, DynamoDB, OpenSearch
AI/ML: Transcribe, Translate, Comprehend, Bedrock (Claude 3.x, Titan), Bedrock KB, Bedrock Agents, Q Business
Integration: AppSync, Kinesis, EventBridge, Step Functions
Networking: VPC, ALB, CloudFront
Security: Cognito, IAM, SSM Parameter Store
Monitoring: CloudWatch

Frameworks
Fastify 3.27.3 (WebSocket)
AWS Amplify 4.3.21 (Frontend)
CloudScape Design System (UI components)
AWS Lambda Powertools (Python observability)
Boto3 (Python AWS SDK)
AWS SDK v3 (JavaScript)
7. CONFIGURATION & DEPLOYMENT
Build Commands (from AGENTS.md)
bash
# Build (requires CONFIG_ENV)
CONFIG_ENV=dev make build

# Lint
make lint

# Test
pytest <test_file>.py    # Python
npm test                 # JavaScript (in component dir)
Key Configuration Files
Makefile
 - Build automation
samconfig.toml - SAM deployment config
template.yaml
 - CloudFormation per stack
package.json
 - Node.js dependencies
requirements.txt
 - Python dependencies
.eslintrc.json
, 
.prettierrc
 - Code style
.pylintrc
, 
.flake8
, 
mypy.ini
 - Python linting
Environment Variables (WebSocket Server)
AWS_REGION, RECORDINGS_BUCKET_NAME, SHOULD_RECORD_CALL,
KINESIS_STREAM_NAME, CPU_HEALTH_THRESHOLD
SSM Parameters
/LMA/Settings - JSON config with AssistantWakePhraseRegEx, CategoryAlertRegex, LLM prompts

8. ENTRY POINTS
Browser Extension: 
lma-browser-extension-stack/src/index.tsx
WebSocket Server: 
lma-websocket-transcriber-stack/source/app/src/index.ts
 (port 8080)
Web UI: 
lma-ai-stack/source/ui/src/index.js
Lambda: lambda_function.lambda_handler (Python)
Step Functions: SchedulerStateMachine (Virtual Participant)
9. ISSUES & RECOMMENDATIONS
Missing/Incomplete
❌ 
lma-main.yaml
 is empty (should contain nested stacks)
⚠️ Virtual Participant beta: Chime/Zoom only, no error handling
⚠️ Browser extension Chrome-only (Firefox/Edge planned)
⚠️ No CHANGELOG.md in root, VERSION file has placeholder
⚠️ Soniox examples present but not integrated
Recommendations
Security:

Rotate JWT tokens regularly
Enable CloudTrail for audit logging
Implement rate limiting on WebSocket server
Add WAF rules for Web UI CloudFront distribution
Performance:

Monitor Transcribe concurrent stream limits (default 25)
Optimize DynamoDB capacity (consider on-demand)
Implement caching for frequent Knowledge Base queries
Add CloudWatch alarms for Lambda errors
Documentation:

Create API documentation (OpenAPI/Swagger)
Add architecture diagrams to docs/
Document disaster recovery procedures
Create developer onboarding guide
Code Quality:

Add integration tests (currently limited)
Implement E2E testing framework
Add code coverage targets
Create CI/CD pipeline documentation
Features:

Complete Virtual Participant (UI, error handling)
Add Firefox/Edge browser extension support
Integrate Soniox as alternative to Transcribe
Add meeting scheduling interface
Implement meeting templates
10. PLAIN-LANGUAGE SUMMARY
What it is: LMA is an AI-powered meeting assistant that listens to your online meetings, transcribes everything in real-time, answers questions based on your company's knowledge, and generates summaries and action items automatically.

How it works: You install a Chrome browser extension that captures audio from your Zoom/Teams/WebEx meetings. The audio is sent to AWS where it's transcribed, analyzed for sentiment, and made searchable. An AI assistant can answer questions during the meeting using your company's documents. After the meeting, AI generates summaries and extracts action items.

Key benefits: Never miss meeting notes, get instant answers during calls, automatically track action items, search across all past meetings, and support multiple languages.

11. TECHNICAL SUMMARY FOR DEVELOPERS
Architecture: Event-driven serverless microservices using AWS CloudFormation nested stacks. Audio flows from browser → Fargate WebSocket → Transcribe → Kinesis → Lambda → AppSync/DynamoDB → React UI. Real-time updates via GraphQL subscriptions.

Tech Stack: Python 3.8+ (Lambda), Node.js 16 (Fargate), React 17 (UI), GraphQL (AppSync), DynamoDB single-table design. AI via Bedrock (Claude 3.x), Transcribe, Q Business, and Knowledge Bases.

Deployment: Infrastructure as Code (CloudFormation/SAM). Multi-stage Dockerfile for WebSocket server. Chrome extension packaged via Webpack. Build automation via Make. Linting with pylint, flake8, mypy, ESLint, prettier.

Key Patterns: Single-table DynamoDB design, event sourcing with Kinesis, GraphQL subscriptions for real-time, JWT authentication, Lambda layers for shared code, Fargate for long-running processes.

Extension Points: Custom Lambda functions for enrichment, custom LLM prompts via SSM, QnABot for conversation design, Knowledge Base for domain data, webhook integrations.

✅ ANALYSIS COMPLETE
This codebase is a production-ready, enterprise-grade AWS solution with comprehensive features. The architecture is well-designed using AWS best practices. Main areas for improvement: complete beta features, expand platform support, enhance documentation, and add comprehensive testing.
