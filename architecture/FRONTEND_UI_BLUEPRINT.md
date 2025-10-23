# Frontend UI Blueprint - Complete Visual Architecture

**Generated:** 2025-10-23  
**Project:** Live Meeting Assistant - Browser Extension UI  
**Framework:** React 18.2 + AWS Cloudscape Design System  
**Type:** Chrome Extension (Side Panel) + Web App

---

## Executive Summary

This is a **single-page application (SPA)** that conditionally renders two main screens based on authentication state:
- **LoginCognito** (unauthenticated users)
- **Capture** (authenticated users)

The application operates as both a **Chrome browser extension** (with side panel UI) and a **standalone web application**. It integrates with video conferencing platforms (Zoom, Teams, Google Meet, Webex, Chime) to capture and transcribe audio in real-time.

### Key Characteristics
- **No traditional routing** - Uses conditional rendering based on `loggedIn` state
- **Chrome Extension** - Manifest V3, side panel UI
- **Real-time audio streaming** - WebSocket + Web Audio API
- **Multi-platform support** - Zoom, Teams, Meet, Webex, Chime
- **AWS Cloudscape UI** - Enterprise design system
- **OAuth2 authentication** - AWS Cognito

---

## Architecture Overview

### Technology Stack
```
Frontend Framework:    React 18.2
UI Component Library:  AWS Cloudscape Design System v3
State Management:      React Context API (4 contexts)
WebSocket:             react-use-websocket v4.7
Styling:               CSS + Cloudscape Global Styles
Audio Processing:      Web Audio API + AudioWorklet
Platform:              Chrome Extension (Manifest v3) + Web App
Build Tool:            Create React App (react-scripts 5.0.1)
```

### Application Structure
```
App.tsx (Root Component)
│
├─ Context Providers (Nested, top → bottom):
│  ├─ SettingsProvider        (loads lma_config.json)
│  ├─ UserProvider             (authentication & token management)
│  ├─ NavigationProvider       (screen navigation state)
│  └─ IntegrationProvider      (WebSocket, audio capture, transcription)
│
└─ AppLayout (Cloudscape)
   │
   └─ Content (Conditional Render):
      │
      ├─ IF loggedIn = false → <LoginCognito />
      └─ IF loggedIn = true  → <Capture />
```

---

## Complete File Structure

```
lma-browser-extension-stack/
├── public/
│   ├── content_scripts/        # Platform-specific audio capture
│   │   ├── mutation-summary.js
│   │   ├── providers/
│   │   │   ├── zoom.js         # Zoom integration
│   │   │   ├── teams.js        # MS Teams integration
│   │   │   ├── meet.js         # Google Meet integration
│   │   │   ├── chime.js        # Amazon Chime integration
│   │   │   └── webex.js        # Cisco Webex integration
│   │   └── recorder/
│   │       ├── recorder.js      # Audio capture engine
│   │       └── audio-worklet.js # Real-time audio processing
│   ├── manifest.json           # Chrome extension config
│   ├── lma_config.json         # App settings
│   └── index.html              # Entry point
│
├── src/
│   ├── components/
│   │   ├── screens/            # Main UI screens
│   │   │   ├── LoginCognito.tsx   # Login screen (active)
│   │   │   ├── Capture.tsx        # Main recording interface (active)
│   │   │   ├── Meeting.tsx        # Transcript view (unused)
│   │   │   └── Login.tsx          # Old login (deprecated)
│   │   └── views/              # Reusable components
│   │       ├── ValueWithLabel.tsx   # Label-value display
│   │       ├── UserMessage.tsx      # User transcript message
│   │       ├── OtherMessage.tsx     # Other participant message
│   │       └── AssistantMessage.tsx # AI assistant response
│   │
│   ├── context/                # Global state management
│   │   ├── SettingsContext.tsx       # App configuration
│   │   ├── UserContext.tsx           # Authentication
│   │   ├── NavigationContext.tsx     # Screen navigation
│   │   └── ProviderIntegrationContext.tsx  # Audio/WebSocket
│   │
│   ├── App.tsx                 # Root component
│   └── index.tsx               # React entry point
│
└── package.json                # Dependencies
```

---

## Page Hierarchy & Routing

### No Traditional Routing
**Important:** This app uses **conditional rendering** instead of React Router:
- No URL paths like `/login`, `/dashboard`
- Navigation is state-based (managed by `loggedIn` boolean)
- Single-page interface that swaps components

### Render Logic
```tsx
function App() {
  const { loggedIn } = useUserContext();
  
  return (
    <AppLayout
      navigationHide={true}
      toolsHide={true}
      content={loggedIn ? <Capture /> : <LoginCognito />}
    />
  );
}
```

---

## Screen Components

### 1. LoginCognito Screen
**File:** `src/components/screens/LoginCognito.tsx`  
**Purpose:** Initial authentication screen using AWS Cognito OAuth2

**Visual Layout:**
```
┌────────────────────────────────────────┐
│                                        │
│              [Amazon Q Logo]           │
│                                        │
│        Amazon Live Meeting             │
│              Assistant                 │
│                                        │
│   Powered by Amazon Transcribe and     │
│          Amazon Bedrock                │
│                                        │
│      ┌─────────────────────────┐      │
│      │      [Login Button]      │      │
│      └─────────────────────────┘      │
│                                        │
│            version: x.x.x              │
└────────────────────────────────────────┘
```

**Interactive Elements:**
| Element | Action | Result |
|---------|--------|--------|
| **Login Button** | Click | Opens Cognito OAuth flow → redirects → exchanges code for tokens → logs in |

**Behavior:**
1. On mount: Checks for URL param `?code=` (OAuth callback)
2. If code found: Auto-exchanges for token and logs in
3. After login: Stores tokens in `chrome.storage.local` or `localStorage`
4. Sets `loggedIn = true` → App re-renders to show Capture screen

See **FRONTEND_UI_FLOWS.md** for complete login flow diagram.

---

### 2. Capture Screen (Main Application)
**File:** `src/components/screens/Capture.tsx`  
**Purpose:** Primary interface for controlling transcription

**Two Visual States:**

#### A. Pre-Recording (isTranscribing = false)
```
┌────────────────────────────────────────────────────────┐
│  Amazon Live Meeting Assistant                         │
│  Powered by Amazon Transcribe and Amazon Bedrock       │
├────────────────────────────────────────────────────────┤
│  Meeting Details                                       │
├────────────────────────────────────────────────────────┤
│  Platform Detected: Zoom                               │
│                                                        │
│  Your name:                                            │
│  ┌──────────────────────────────────────────────┐     │
│  │ [Input: Enter your name]                     │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  Meeting Topic:                                        │
│  ┌──────────────────────────────────────────────┐     │
│  │ [Input: Enter meeting topic]                 │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  ┌──────────────────────────────────────────────┐     │
│  │     [Start Listening] (Primary Button)       │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  ┌───────────────┐  ┌───────────────┐                │
│  │ 🎤 Mute Me    │  │  Log out      │                │
│  └───────────────┘  └───────────────┘                │
└────────────────────────────────────────────────────────┘
```

#### B. Recording Active (isTranscribing = true)
```
┌────────────────────────────────────────────────────────┐
│  Amazon Live Meeting Assistant                         │
├────────────────────────────────────────────────────────┤
│  Meeting Details                                       │
├────────────────────────────────────────────────────────┤
│  Platform Detected: Zoom                               │
│                                                        │
│  ┌──────────────────────────────────────────────┐     │
│  │      [Open in LMA] (External Link)           │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  Name: John Doe                                        │
│  Meeting Topic: Q4 Planning Meeting                    │
│  Active Speaker: Jane Smith                            │
│                                                        │
│  ┌──────────────────────────────────────────────┐     │
│  │     🎤 Mute All / Unmute All (Toggle)        │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  ┌──────────────────────────────────────────────┐     │
│  │     [Stop Listening] (Primary Button)        │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  ┌───────────────┐  ┌───────────────┐                │
│  │ 🎤 Mute/Unmute│  │  Log out      │                │
│  └───────────────┘  └───────────────┘                │
└────────────────────────────────────────────────────────┘
```

**All Interactive Elements:** See **FRONTEND_UI_INTERACTIONS.md**

---

## View Components (Reusable)

### ValueWithLabel
Simple label-value display
```tsx
<ValueWithLabel label="Platform Detected:">{platform}</ValueWithLabel>
```

### UserMessage
Right-aligned transcript message from current user

### OtherMessage
Left-aligned transcript message from other participants

### AssistantMessage
AI response with Amazon Q logo

---

## Context Providers (State Management)

### 1. SettingsContext
Loads configuration from `lma_config.json`:
```typescript
{
  wssEndpoint: "ws://localhost:8080/api/v1/ws",
  clientId: "test-client-id",
  cognitoDomain: "http://localhost:3000",
  cloudfrontEndpoint: "http://localhost:3000",
  recordingDisclaimer: "...",
  recordingMessage: "...",
  stopRecordingMessage: "..."
}
```

### 2. UserContext
Manages authentication:
- Stores OAuth tokens (id_token, access_token, refresh_token)
- Handles login/logout
- Token expiry checking and refresh
- Storage: `chrome.storage.local` (extension) or `localStorage` (web)

### 3. NavigationContext
Screen navigation state (currently unused in practice)

### 4. IntegrationProvider
Core transcription logic:
- WebSocket connection management
- Audio capture coordination
- Platform detection
- Mute/pause controls
- Active speaker tracking

See **FRONTEND_UI_STATE.md** for complete state documentation.

---

## Browser Extension Integration

### Manifest V3 Configuration
- **Side panel UI** at `index.html`
- **Permissions:** storage, sidePanel, identity, tabs, scripting, activeTab
- **Content scripts** injected per platform (zoom.js, teams.js, etc.)
- **Audio capture** via displayMedia API

### Content Script Architecture
```
Meeting URL detected → Inject platform script
         ↓
  Observe DOM for metadata
         ↓
  Capture tab audio
         ↓
  Process in AudioWorklet
         ↓
  Send to extension via messages
         ↓
  Forward to WebSocket
```

See **FRONTEND_UI_EXTENSION.md** for complete extension documentation.

---

## WebSocket Communication

### Message Types

**1. START Event (JSON)**
```json
{
  "callEvent": "START",
  "agentId": "John Doe",
  "callId": "Q4 Planning - 2025-10-23-14:30:15.123",
  "samplingRate": 48000
}
```

**2. Audio Data (Binary)**
- Raw PCM 16-bit audio chunks
- Sent every ~23-43ms

**3. SPEAKER_CHANGE Event (JSON)**
Updates active speaker name

**4. END Event (JSON)**
Signals transcription stop

See **FRONTEND_UI_PROTOCOL.md** for complete protocol documentation.

---

## Complete Documentation Index

This blueprint is part of a comprehensive UI documentation suite:

1. **FRONTEND_UI_BLUEPRINT.md** (this file) - Architecture overview
2. **FRONTEND_UI_FLOWS.md** - Complete user interaction flows
3. **FRONTEND_UI_INTERACTIONS.md** - Detailed button/element interactions
4. **FRONTEND_UI_STATE.md** - State management deep dive
5. **FRONTEND_UI_EXTENSION.md** - Browser extension details
6. **FRONTEND_UI_PROTOCOL.md** - WebSocket communication protocol
7. **FRONTEND_UI_VISUAL_MAP.md** - Complete visual navigation diagram

---

**Analysis completed by:** Cascade AI Frontend Architect  
**Date:** October 23, 2025  
**Framework:** React 18.2 + Cloudscape Design System  
**Codebase:** Latest (main branch)
