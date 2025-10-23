# Frontend UI - Complete Interactive Elements Reference

**Generated:** 2025-10-23  
**Purpose:** Detailed documentation of every clickable/interactive element

---

## LoginCognito Screen Interactions

### Login Button
- **Type:** Primary button (full-width)
- **Label:** "Login"
- **Location:** Center of screen
- **Action:** `onClick={() => login()}`
- **Function Called:** `UserContext.login()`
- **Behavior:**
  - **Extension mode:** Calls `chrome.identity.launchWebAuthFlow()` with Cognito URL
  - **Web mode:** Sets `window.location.href` to Cognito URL
  - Opens OAuth2 authorization flow
  - Redirects to Cognito login page
  - After authentication, redirects back with `?code=`
- **Result:** User authenticates, tokens stored, app shows Capture screen

---

## Capture Screen Interactions (Pre-Recording State)

### 1. Your Name Input Field
- **Type:** Text input
- **Label:** "Your name:"
- **State:** `agentName`
- **Action:** `onChange={({ detail }) => setAgentName(detail.value)}`
- **Validation:** 
  - Required field
  - Shows error "Name required." if empty on submit
- **Default Value:** Loaded from metadata (if available from content script)
- **Max Length:** None enforced
- **Result:** Updates `agentName` state

### 2. Meeting Topic Input Field
- **Type:** Text input
- **Label:** "Meeting Topic:"
- **State:** `topic`
- **Action:** `onChange={({ detail }) => setTopic(detail.value)}`
- **Validation:**
  - Required field
  - Shows error "Topic required." if empty on submit
  - Sanitizes: Removes `/?#%+&` characters (replaced with `|`)
- **Default Value:** Loaded from metadata (meeting title from page)
- **Result:** Updates `topic` state

### 3. Start Listening Button
- **Type:** Primary button (full-width, orange)
- **Label:** "Start Listening"
- **Action:** `onClick={() => startListening()}`
- **Validation Flow:**
  1. Checks if `agentName` is not empty
  2. Checks if `topic` is not empty
  3. If validation fails: Shows error messages, stops
  4. If validation passes: Shows disclaimer modal
- **Result:** Opens disclaimer modal

### 4. Disclaimer Modal - Cancel Button
- **Type:** Link button
- **Label:** "Cancel"
- **Location:** Bottom right of modal
- **Action:** `onClick={() => setShowDisclaimer(false)}`
- **Result:** Closes modal, returns to pre-recording state

### 5. Disclaimer Modal - Agree Button
- **Type:** Primary button
- **Label:** "Agree"
- **Location:** Bottom right of modal
- **Action:** `onClick={() => { setShowDisclaimer(false); disclaimerConfirmed(); }}`
- **Function Called:** `disclaimerConfirmed() → startTranscription(user, agentName, topic)`
- **Result:** 
  - Closes modal
  - Initiates transcription start sequence
  - Changes UI to recording state

### 6. Mute Me Button (Pre-Recording)
- **Type:** Icon button with microphone icon
- **Label:** "Mute Me" / "Unmute Me" (toggles)
- **State:** `muted`
- **Action:** `onClick={() => setMuted(!muted)}`
- **Behavior:**
  - Visual toggle only (no audio yet)
  - When recording starts, mute state applies
- **Result:** Updates `muted` state

### 7. Log out Button (Pre-Recording)
- **Type:** Standard button
- **Label:** "Log out"
- **Action:** `onClick={() => logout()}`
- **Function Called:** `UserContext.logout()`
- **Result:**
  - Clears tokens from storage
  - Sets `loggedIn = false`
  - App renders LoginCognito screen

---

## Capture Screen Interactions (Recording State)

### 1. Open in LMA Button
- **Type:** Full-width button
- **Label:** "Open in LMA"
- **Action:** `onClick={async () => openInLMA()}`
- **Function Behavior:**
  ```javascript
  const url = `${settings.cloudfrontEndpoint}/#/calls/${currentCall.callId}`;
  window.open(url, '_blank', 'noreferrer');
  ```
- **Result:** Opens new browser tab with full LMA web app interface
- **URL Format:** `http://localhost:3000/#/calls/Q4 Planning - 2025-10-23-14:30:15.123`

### 2. Mute All / Unmute All Button
- **Type:** Full-width button with microphone icon
- **Label:** "Mute All" / "Unmute All" (toggles based on `paused` state)
- **State:** `paused`
- **Action:** `onClick={() => setPaused(!paused)}`
- **Behavior:**
  - **Mute All:** Zeros out ALL audio channels → no transcription
  - **Unmute All:** Restores all audio channels → transcription resumes
- **Visual Indicator:** Icon changes: 🎤 ↔ 🎤🚫
- **Result:** Toggles `paused` state, affects audio processing

### 3. Stop Listening Button
- **Type:** Primary button (full-width, orange)
- **Label:** "Stop Listening"
- **Action:** `onClick={() => stopListening()}`
- **Function Called:** `stopTranscription()`
- **Behavior:**
  1. Sends message to content script to stop audio capture
  2. Updates `callEvent` to 'END'
  3. Sends END event to WebSocket
  4. Closes WebSocket connection
  5. Resets state: `isTranscribing = false`, `paused = false`
  6. Sends stop message to meeting chat (extension mode)
  7. UI returns to pre-recording state
- **Result:** Stops recording, returns to pre-recording UI

### 4. Mute Me / Unmute Me Button (Recording)
- **Type:** Icon button with microphone icon
- **Label:** "Mute Me" / "Unmute Me" (toggles)
- **State:** `muted`
- **Action:** `onClick={() => setMuted(!muted)}`
- **Behavior:**
  - **Mute Me:** Zeros out channel 1 (personal microphone) in audio stream
  - **Unmute Me:** Restores channel 1
- **Real-time Effect:** Applied to next audio chunk sent to WebSocket
- **Result:** Toggles `muted` state, personal audio muted/unmuted

### 5. Log out Button (Recording)
- **Type:** Standard button
- **Label:** "Log out"
- **Action:** `onClick={() => logout()}`
- **Behavior:**
  1. First calls `stopTranscription()` (if recording)
  2. Then clears tokens
  3. Sets `loggedIn = false`
- **Result:** Stops recording, logs out, shows login screen

---

## Display-Only Elements (No Interaction)

### Platform Detected
- **Component:** `<ValueWithLabel>`
- **Label:** "Platform Detected:"
- **Value:** Dynamic string from `platform` state
- **Possible Values:**
  - "Zoom"
  - "Amazon Chime"
  - "Microsoft Teams"
  - "Cisco Webex"
  - "Google Meet"
  - "n/a" (if not detected or web app mode)
- **Detection Logic:** Based on `metadata.baseUrl` from content script

### Name (During Recording)
- **Component:** `<ValueWithLabel>`
- **Label:** "Name:"
- **Value:** `agentName` state (user's entered name)
- **Read-only during recording**

### Meeting Topic (During Recording)
- **Component:** `<ValueWithLabel>`
- **Label:** "Meeting Topic:"
- **Value:** `topic` state (sanitized topic string)
- **Read-only during recording**

### Active Speaker
- **Component:** `<ValueWithLabel>`
- **Label:** "Active Speaker:"
- **Value:** Dynamic string from `activeSpeaker` state
- **Update Source:** Content script detects DOM changes, sends `ActiveSpeakerChange` message
- **Real-time:** Updates as speakers change in meeting
- **Default:** "n/a"

### Version Display
- **Type:** Text
- **Location:** Bottom center
- **Value:** Extension version from `chrome.runtime.getManifest()` or "dev/web"
- **Format:** Small, gray text

---

## Content Script Interaction Triggers

These are not UI elements but background actions triggered by UI interactions:

### StartTranscription Message
- **Trigger:** User clicks [Start Listening] → [Agree]
- **Message:** `chrome.tabs.sendMessage({ action: "StartTranscription" })`
- **Recipient:** Content script on active tab
- **Content Script Action:**
  1. Calls `navigator.mediaDevices.displayMedia({ audio: true })`
  2. User selects tab to share in browser popup
  3. Creates AudioContext and AudioWorklet
  4. Starts capturing audio
  5. Sends back sampling rate
  6. Begins streaming audio chunks

### StopTranscription Message
- **Trigger:** User clicks [Stop Listening] or [Log out] (while recording)
- **Message:** `chrome.runtime.sendMessage({ action: "StopTranscription" })`
- **Recipient:** Extension background / content script
- **Content Script Action:**
  1. Stops AudioWorklet processing
  2. Closes MediaStream tracks
  3. Disconnects AudioContext

### SendChatMessage
- **Trigger:** Auto-sent on start/stop recording
- **Messages:**
  - Start: `settings.recordingMessage`
  - Stop: `settings.stopRecordingMessage`
- **Platform Support:** Zoom, Teams, Meet, Chime, Webex (platform-specific implementations)
- **Content Script Action:** Injects text into meeting chat UI

---

## State-Driven UI Changes Summary

| State Variable | UI Impact |
|----------------|-----------|
| `loggedIn` | Shows LoginCognito vs Capture |
| `isTranscribing` | Shows pre-recording vs recording UI |
| `muted` | Changes button: "Mute Me" ↔ "Unmute Me" |
| `paused` | Changes button: "Mute All" ↔ "Unmute All" |
| `platform` | Displays detected platform name |
| `activeSpeaker` | Displays current speaker (real-time) |
| `agentName` | Used in START event, displayed during recording |
| `topic` | Used in callId, displayed during recording |
| `showDisclaimer` | Shows/hides disclaimer modal |
| `nameErrorText` | Shows validation error under name field |
| `meetingTopicErrorText` | Shows validation error under topic field |

---

## Keyboard Interactions

- **Text inputs:** Standard typing, selection, copy/paste
- **Enter key in inputs:** No special behavior (must click button)
- **Tab navigation:** Follows standard Cloudscape focus order
- **Escape key:** Closes disclaimer modal (Cloudscape default)

---

## Touch/Mobile Interactions

- **Not optimized for mobile** - Extension is desktop Chrome only
- Web app mode: Standard touch events work
- No swipe gestures implemented
- All buttons have adequate touch targets (Cloudscape defaults)

---

**See also:**
- FRONTEND_UI_BLUEPRINT.md - Architecture overview
- FRONTEND_UI_FLOWS.md - Complete user flows
