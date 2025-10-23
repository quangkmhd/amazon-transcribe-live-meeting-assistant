# Frontend UI - Complete Visual Navigation Map

**Generated:** 2025-10-23  
**Purpose:** Visual representation of entire UI structure

---

## Application State Tree

```
                         ┌─────────────────┐
                         │   App Starts    │
                         └────────┬────────┘
                                  ↓
                    ┌─────────────────────────┐
                    │  Check Authentication   │
                    └─────────┬───────────────┘
                              ↓
              ┌───────────────┴────────────────┐
              ↓                                ↓
    ┌──────────────────┐            ┌──────────────────┐
    │  loggedIn: false │            │  loggedIn: true  │
    └────────┬─────────┘            └────────┬─────────┘
             ↓                                ↓
    ┌──────────────────┐            ┌──────────────────┐
    │  LoginCognito    │            │  Capture Screen  │
    │     Screen       │            └────────┬─────────┘
    └────────┬─────────┘                     ↓
             │                   ┌───────────┴────────────┐
             │                   ↓                        ↓
             │         ┌──────────────────┐   ┌──────────────────┐
             │         │ isTranscribing:  │   │ isTranscribing:  │
             │         │     false        │   │     true         │
             │         │                  │   │                  │
             │         │ (Pre-Recording)  │   │   (Recording)    │
             │         └──────────────────┘   └──────────────────┘
             │                   ↑                        ↓
             │                   │                        │
             │                   └────────────────────────┘
             │                      [Start] → [Stop]
             │
             └─→ [Login] → Returns to Capture (loggedIn=true)
```

---

## Complete Screen Layout Diagrams

### LoginCognito Screen

```
┌────────────────────────────────────────────────────────────┐
│                      Browser Extension                     │
│                   (or Web App Window)                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                                                            │
│                     ┌──────────────┐                       │
│                     │              │                       │
│                     │  Amazon Q    │                       │
│                     │    Logo      │                       │
│                     │  (q_svg.svg) │                       │
│                     │              │                       │
│                     └──────────────┘                       │
│                                                            │
│                                                            │
│              ┌──────────────────────────┐                  │
│              │   Amazon Live Meeting    │                  │
│              │       Assistant          │                  │
│              └──────────────────────────┘                  │
│                                                            │
│              ┌──────────────────────────┐                  │
│              │ Powered by Amazon        │                  │
│              │ Transcribe and Amazon    │                  │
│              │ Bedrock                  │                  │
│              └──────────────────────────┘                  │
│                                                            │
│                                                            │
│           ┌────────────────────────────────┐               │
│           │                                │               │
│           │        [Login Button]          │ ← Click Here │
│           │        (Primary Orange)        │               │
│           │                                │               │
│           └────────────────────────────────┘               │
│                                                            │
│                                                            │
│                                                            │
│                     version: 1.2.3                         │
│                    (or "dev/web")                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### Capture Screen - Pre-Recording State

```
┌────────────────────────────────────────────────────────────┐
│  Header: Amazon Live Meeting Assistant                    │
│  Subheader: Powered by Amazon Transcribe and Bedrock      │
├────────────────────────────────────────────────────────────┤
│  Container: Meeting Details                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Platform Detected: [Zoom | Teams | Meet | etc.]          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Label: Your name:                                    │ │
│  │ ┌──────────────────────────────────────────────────┐ │ │
│  │ │ [Text Input Field]                               │ │ │
│  │ │ Placeholder: "Enter your name"                   │ │ │
│  │ └──────────────────────────────────────────────────┘ │ │
│  │ Error: "Name required." (if validation fails)       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Label: Meeting Topic:                                │ │
│  │ ┌──────────────────────────────────────────────────┐ │ │
│  │ │ [Text Input Field]                               │ │ │
│  │ │ Placeholder: "Meeting room topic"                │ │ │
│  │ └──────────────────────────────────────────────────┘ │ │
│  │ Error: "Topic required." (if validation fails)      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │        [Start Listening]  (Primary Button)          │ │ ← Main Action
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌────────────────────┐  ┌────────────────────┐          │
│  │  🎤 Mute Me        │  │    Log out         │          │
│  │  (Toggle Button)   │  │    (Button)        │          │
│  └────────────────────┘  └────────────────────┘          │
│                                                            │
│                     version: 1.2.3                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Modal Overlay When [Start Listening] Clicked:**

```
┌────────────────────────────────────────────────────────────┐
│                       [Dimmed Background]                  │
│                                                            │
│      ┌────────────────────────────────────────────┐       │
│      │  Important:                           [X]  │       │
│      ├────────────────────────────────────────────┤       │
│      │                                            │       │
│      │  ⚠️  You are responsible for complying    │       │
│      │  with legal, corporate, and ethical       │       │
│      │  restrictions that apply to recording     │       │
│      │  meetings and calls. Do not use this      │       │
│      │  solution to stream, record, or           │       │
│      │  transcribe calls if otherwise            │       │
│      │  prohibited.                               │       │
│      │                                            │       │
│      │                                            │       │
│      │               [Cancel]    [Agree]          │       │ ← Agree = Start
│      │               (Link)      (Primary)        │       │
│      └────────────────────────────────────────────┘       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### Capture Screen - Recording State

```
┌────────────────────────────────────────────────────────────┐
│  Header: Amazon Live Meeting Assistant                    │
│  Subheader: Powered by Amazon Transcribe and Bedrock      │
├────────────────────────────────────────────────────────────┤
│  Container: Meeting Details                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Platform Detected: Zoom                                   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │        [Open in LMA]  (External Link Button)        │ │ ← Opens new tab
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Name: John Doe                                            │
│  Meeting Topic: Q4 Planning Meeting                        │
│  Active Speaker: Jane Smith  ← Updates in real-time       │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │      🎤 [Mute All / Unmute All]  (Toggle)           │ │ ← Pauses all audio
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │        [Stop Listening]  (Primary Button)           │ │ ← Stops recording
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌────────────────────┐  ┌────────────────────┐          │
│  │  🎤 Mute Me /      │  │    Log out         │          │
│  │     Unmute Me      │  │    (Button)        │          │
│  │  (Toggle Button)   │  │                    │          │
│  └────────────────────┘  └────────────────────┘          │
│                                                            │
│                     version: 1.2.3                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy Visualization

```
App.tsx
│
├─── Context Providers (Wrapping Everything)
│    │
│    ├─── SettingsProvider
│    │    └─── Provides: config from lma_config.json
│    │
│    ├─── UserProvider
│    │    └─── Provides: user tokens, login/logout functions
│    │
│    ├─── NavigationProvider
│    │    └─── Provides: currentScreen state (unused in practice)
│    │
│    └─── IntegrationProvider
│         └─── Provides: WebSocket, audio state, transcription control
│
└─── AppLayout (Cloudscape)
     │
     └─── Content (Conditional)
          │
          ├─── IF loggedIn = false
          │    │
          │    └─── LoginCognito.tsx
          │         │
          │         ├─── ContentLayout
          │         │    └─── Container
          │         │         ├─── SpaceBetween (vertical layout)
          │         │         │    ├─── Grid: Amazon Q Logo
          │         │         │    ├─── Grid: Title Text
          │         │         │    ├─── Grid: Subtitle Text
          │         │         │    ├─── Grid: Login Button
          │         │         │    └─── Grid: Version Text
          │
          └─── IF loggedIn = true
               │
               └─── Capture.tsx
                    │
                    ├─── ContentLayout
                    │    ├─── Header: Title + Description
                    │    │
                    │    └─── Container: Meeting Details
                    │         │
                    │         ├─── Modal (Disclaimer)
                    │         │    └─── Shown when showDisclaimer = true
                    │         │
                    │         └─── SpaceBetween (vertical layout)
                    │              │
                    │              ├─── ValueWithLabel: Platform
                    │              │
                    │              ├─── IF isTranscribing = false
                    │              │    ├─── FormField: Name Input
                    │              │    ├─── FormField: Topic Input
                    │              │    └─── Button: Start Listening
                    │              │
                    │              ├─── IF isTranscribing = true
                    │              │    ├─── Button: Open in LMA
                    │              │    ├─── ValueWithLabel: Name
                    │              │    ├─── ValueWithLabel: Topic
                    │              │    ├─── ValueWithLabel: Active Speaker
                    │              │    ├─── Button: Mute All / Unmute All
                    │              │    └─── Button: Stop Listening
                    │              │
                    │              ├─── Grid (2 columns)
                    │              │    ├─── Button: Mute Me / Unmute Me
                    │              │    └─── Button: Log out
                    │              │
                    │              └─── Grid: Version Text
```

---

## Navigation Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION FLOW                         │
└─────────────────────────────────────────────────────────────┘

    START
      ↓
┌─────────────┐
│ LoginCognito│
│   Screen    │
└──────┬──────┘
       │
       │ [Login Button]
       ↓
  (OAuth Flow)
       ↓
┌──────────────────────────────────────────────────────┐
│             Capture Screen (Pre-Recording)           │
│                                                      │
│  [Name Input]  [Topic Input]  [Start Listening]     │
└──────┬───────────────────────────────────────────────┘
       │
       │ [Start Listening] → [Agree]
       ↓
┌──────────────────────────────────────────────────────┐
│             Capture Screen (Recording)               │
│                                                      │
│  [Open in LMA]  [Mute All]  [Stop Listening]        │
│                                                      │
│  Real-time:                                          │
│  • Active Speaker updates                            │
│  • Audio streaming                                   │
│  • WebSocket connection active                       │
└──────┬───────────────────────────────────────────────┘
       │
       │ [Stop Listening]
       ↓
┌──────────────────────────────────────────────────────┐
│             Capture Screen (Pre-Recording)           │
│                  [Returns to start state]            │
└──────────────────────────────────────────────────────┘
       │
       │ [Log out]
       ↓
┌─────────────┐
│ LoginCognito│
│   Screen    │
└─────────────┘
```

---

## External Integrations Visual Map

```
┌──────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Side Panel UI (React App)                         │ │
│  │                                                    │ │
│  │  LoginCognito / Capture Screens                   │ │
│  └─────────┬──────────────────────────────────────────┘ │
│            │                                             │
│            │ chrome.runtime.sendMessage()                │
│            │ chrome.tabs.sendMessage()                   │
│            ↓                                             │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Service Worker (service-worker.js)                │ │
│  └─────────┬──────────────────────────────────────────┘ │
│            │                                             │
└────────────┼─────────────────────────────────────────────┘
             │
             │ Injects scripts
             ↓
┌──────────────────────────────────────────────────────────┐
│          MEETING PLATFORM (Zoom / Teams / etc.)          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Content Script (zoom.js / teams.js / etc.)        │ │
│  │                                                    │ │
│  │  • Captures tab audio via displayMedia API        │ │
│  │  • Observes DOM for active speaker                │ │
│  │  • Reads meeting metadata                         │ │
│  │  • Injects chat messages                          │ │
│  └─────────┬──────────────────────────────────────────┘ │
│            │                                             │
└────────────┼─────────────────────────────────────────────┘
             │
             │ Sends audio + metadata
             ↓
┌──────────────────────────────────────────────────────────┐
│              EXTENSION BACKGROUND                        │
│                                                          │
│  Receives: Audio chunks, metadata, speaker changes      │
│  Processes: Mute/pause logic, format conversion         │
│  Forwards: To WebSocket server                          │
└─────────┬────────────────────────────────────────────────┘
          │
          │ WebSocket connection
          │ ws://localhost:8080/api/v1/ws
          ↓
┌──────────────────────────────────────────────────────────┐
│              BACKEND SERVER (Node.js/Fastify)            │
│                                                          │
│  • Receives audio + control messages                    │
│  • Forwards to Soniox STT API                           │
│  • Saves transcripts to Supabase                        │
└──────────────────────────────────────────────────────────┘
```

---

## State Transition Diagram

```
                    ┌──────────────┐
                    │  App Loads   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ Check Tokens │
                    └──────┬───────┘
                           ↓
               ┌───────────┴────────────┐
               ↓                        ↓
        ┌──────────────┐         ┌──────────────┐
        │ No Tokens    │         │ Valid Tokens │
        │              │         │              │
        │ loggedIn:    │         │ loggedIn:    │
        │   false      │         │   true       │
        └──────┬───────┘         └──────┬───────┘
               ↓                        ↓
        ┌──────────────┐         ┌──────────────┐
        │ LoginCognito │         │   Capture    │
        │              │         │ (Pre-Record) │
        └──────┬───────┘         └──────┬───────┘
               │                        │
               │ [Login Success]        │
               └──────────┬─────────────┘
                          ↓
                   ┌──────────────┐
                   │   Capture    │
                   │ (Pre-Record) │
                   │              │
                   │ isTranscrib- │
                   │ ing: false   │
                   └──────┬───────┘
                          │
                          │ [Start + Agree]
                          ↓
                   ┌──────────────┐
                   │   Capture    │
                   │ (Recording)  │
                   │              │
                   │ isTranscrib- │
                   │ ing: true    │
                   └──────┬───────┘
                          │
                          │ [Stop]
                          ↓
                   ┌──────────────┐
                   │   Capture    │
                   │ (Pre-Record) │
                   └──────┬───────┘
                          │
                          │ [Logout]
                          ↓
                   ┌──────────────┐
                   │ LoginCognito │
                   └──────────────┘
```

---

**See also:**
- FRONTEND_UI_BLUEPRINT.md - Architecture overview
- FRONTEND_UI_FLOWS.md - User interaction flows
- FRONTEND_UI_INTERACTIONS.md - Detailed element interactions
