# Frontend UI - Complete User Interaction Flows

**Generated:** 2025-10-23  
**Purpose:** Visual diagrams of all user interaction paths

---

## Flow 1: Login Flow

```
User Opens Extension → Check Auth → Not Logged In
         ↓
Show LoginCognito Screen
         ↓
User Clicks [Login] → OAuth Flow → Cognito Login
         ↓
Redirect with ?code → Exchange Code → Get Tokens
         ↓
Store Tokens → setLoggedIn(true) → Show Capture Screen
```

**Detailed Steps:**
1. App renders, checks `loggedIn` state
2. If false, shows LoginCognito screen
3. User clicks Login button
4. Extension: `chrome.identity.launchWebAuthFlow()` / Web: redirect
5. User authenticates on Cognito
6. Redirect back with `?code=xxx`
7. `exchangeCodeForToken()` POSTs to Cognito `/oauth2/token`
8. Receives: `{id_token, access_token, refresh_token}`
9. Stores in `chrome.storage.local` or `localStorage`
10. Sets `loggedIn = true`, app re-renders to Capture

---

## Flow 2: Start Transcription Flow

```
User on Capture (Pre-Recording State)
         ↓
Fill Name + Topic → Click [Start Listening]
         ↓
Validate Form → Show Disclaimer Modal
         ↓
User Clicks [Agree] → startTranscription()
         ↓
Check Token → Create CallMetadata → Connect WebSocket
         ↓
[Extension] Message Content Script → Start Audio Capture
         ↓
Detect Sampling Rate → Send START Event → Recording Active
```

**Key Actions:**
- Validates name and topic fields (required)
- Shows legal disclaimer modal
- Creates call metadata with timestamp
- Opens WebSocket connection
- Extension: Triggers tab audio capture via content script
- Web: Direct WebSocket connection
- Sends START event with call metadata
- UI changes to recording state

---

## Flow 3: Audio Streaming (Continuous)

```
Content Script AudioWorklet (every 2.67ms)
         ↓
Convert to PCM → Base64 Encode → Send to Extension
         ↓
Extension Receives → Decode → Apply Mute/Pause Logic
         ↓
Send Binary Data to WebSocket → Server Forwards to Soniox
         ↓
Soniox Returns Transcripts → Saved to Database
         ↓
[Loop Repeats ~43 times/second]
```

**Mute Logic:**
- **Personal Mute** (Mute Me): Zeros channel 1 only
- **All Pause** (Mute All): Zeros all channels

---

## Flow 4: Stop Transcription Flow

```
User Clicks [Stop Listening] → stopTranscription()
         ↓
[Extension] Stop Content Script Audio
         ↓
Send END Event → Close WebSocket
         ↓
Reset State → UI Returns to Pre-Recording
```

**Cleanup Actions:**
- Stops audio capture in content script
- Sends END event with final call metadata
- Closes WebSocket connection
- Resets: `isTranscribing`, `paused`, `shouldConnect`
- Sends stop message to meeting chat (extension mode)

---

## Flow 5: Token Refresh (Background)

```
checkTokenExpired() → Parse JWT → Check exp Field
         ↓
Token Expired? → Has refresh_token?
         ↓
POST to Cognito with refresh_token
         ↓
Receive New Tokens → Store → Update User State
```

**Automatic Refresh:**
- Happens before any authenticated action
- Silently refreshes without user interaction
- If refresh fails, forces re-login

---

## Flow 6: Logout Flow

```
User Clicks [Log out] → logout()
         ↓
Stop Recording (if active)
         ↓
Clear Tokens from Storage
         ↓
setLoggedIn(false) → Show LoginCognito Screen
```

---

## Flow 7: Open in LMA Flow

```
User Clicks [Open in LMA] (during recording)
         ↓
Construct URL: ${cloudfrontEndpoint}/#/calls/${callId}
         ↓
window.open() → Opens New Tab with Full Transcript UI
```

**Opens External Web App:**
- Full transcript view
- Language selection
- AI assistant interaction
- Speaker diarization display

---

**See also:**
- FRONTEND_UI_BLUEPRINT.md - Architecture overview
- FRONTEND_UI_INTERACTIONS.md - Detailed button interactions
