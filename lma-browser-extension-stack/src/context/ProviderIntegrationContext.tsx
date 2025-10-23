/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
/* eslint-disable @typescript-eslint/no-empty-function */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useSettings } from './SettingsContext';
import { useUserContext } from './UserContext';
import { useSupabase } from './SupabaseContext';

type Call = {
  callEvent: string,
  agentId: string,
  fromNumber: string,
  toNumber: string,
  callId: string,
  samplingRate: number,
  activeSpeaker: string,
}

const initialIntegration = {
  currentCall: {} as Call,
  isTranscribing: false,
  muted: false,
  setMuted: (muteValue: boolean) => { },
  paused: false,
  setPaused: (pauseValue: boolean) => { },
  fetchMetadata: () => { },
  startTranscription: (user: any, userName: string, meetingTopic: string) => { },
  stopTranscription: () => { },
  metadata: {
    userName: "",
    meetingTopic: ""
  },
  platform: "n/a",
  activeSpeaker: "n/a",
  sendRecordingMessage: () => { }
};
const IntegrationContext = createContext(initialIntegration);

function IntegrationProvider({ children }: any) {

  const [currentCall, setCurrentCall] = useState({} as Call);
  const { user, checkTokenExpired, login } = useUserContext();
  const { user: supabaseUser, session } = useSupabase();
  const settings = useSettings();
  const [metadata, setMetadata] = useState({
    userName: "",
    meetingTopic: ""
  });
  const [platform, setPlatform] = useState("n/a");
  const [activeSpeaker, setActiveSpeaker] = useState("n/a");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [shouldConnect, setShouldConnect] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  const { sendMessage, readyState, getWebSocket } = useWebSocket(settings.wssEndpoint as string, {
    queryParams: {
      authorization: `Bearer ${session?.access_token || user.access_token}`,
      id_token: `${session?.access_token || user.id_token}`,
      refresh_token: `${session?.refresh_token || user.refresh_token}`
    },
    onOpen: (event) => {
      console.log('WebSocket connection opened:', event);
      
      // In web app mode (non-extension), send START message when connection opens
      if (!chrome.runtime && currentCall && currentCall.callId && shouldConnect) {
        console.log('Sending START message to WebSocket:', currentCall);
        setTimeout(() => {
          sendMessage(JSON.stringify(currentCall));
          setIsTranscribing(true);
          console.log('Transcription started via onOpen callback');
        }, 500);
      }
    },
    onClose: (event) => {
      console.log('WebSocket connection closed:', event);
      stopTranscription();
    },
    onError: (event) => {
      console.error('WebSocket error:', event);
      stopTranscription();
    },
  }, shouldConnect);

  // Connection status tracking (for debugging if needed)
  // const connectionStatus = {
  //   [ReadyState.CONNECTING]: 'Connecting',
  //   [ReadyState.OPEN]: 'Open',
  //   [ReadyState.CLOSING]: 'Closing',
  //   [ReadyState.CLOSED]: 'Closed',
  //   [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  // }[readyState];

  const dataUrlToBytes = async (dataUrl: string, isMuted: boolean, isPaused: boolean) => {
    const res = await fetch(dataUrl);
    const dataArray = new Uint8Array(await res.arrayBuffer());
    if (isPaused) {
      // mute all channels by sending just zeroes
      return new Uint8Array(dataArray.length);
    } else if (isMuted) {
      // mute only the one channel by mutating the zeroes of only one channel (channel 1)
      for (let i = 2; i < dataArray.length; i += 4) {
        dataArray[i] = 0;
        dataArray[i + 1] = 0;
      }
    }
    return dataArray;
  }

  const updateMetadata = useCallback((newMetadata: any) => {
    console.log("newMetadata.baseUrl" + newMetadata.baseUrl);
    if (newMetadata && newMetadata.baseUrl && newMetadata.baseUrl === "https://app.zoom.us") {
      setPlatform("Zoom");
    } else if (newMetadata && newMetadata.baseUrl && newMetadata.baseUrl === "https://app.chime.aws") {
      setPlatform("Amazon Chime");
    } else if (newMetadata.baseUrl === "https://teams.microsoft.com" || newMetadata.baseUrl === "https://teams.live.com") {
      setPlatform("Microsoft Teams");
    } else if (newMetadata && newMetadata.baseUrl && newMetadata.baseUrl.includes("webex.com")) {
      setPlatform("Cisco Webex");
    } else if (newMetadata && newMetadata.baseUrl && newMetadata.baseUrl === "https://meet.google.com") {
        setPlatform("Google Meet");
    }
    
    setMetadata(newMetadata);
  }, [metadata, setMetadata, platform, setPlatform]);

  const fetchMetadata = async () => {
    if (chrome && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) {
        const _response = await chrome.tabs.sendMessage(tab.id, { action: "FetchMetadata" });
        console.log("Received response from Metadata query!", _response);
        updateMetadata(_response);
      }
    } else {
      // Web app mode: use default metadata
      console.log('Web app mode: Using default metadata');
      updateMetadata({
        baseUrl: window.location.origin,
        userName: '',
        meetingTopic: ''
      });
    }
    return {};
  }

  const sendRecordingMessage = useCallback(async () => {
    if (chrome && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { action: "SendChatMessage", message: settings.recordingMessage });
      }
    } else {
      console.log('Web app mode: Recording message not sent (no chat integration)');
    }
    return {};
  }, [settings]);

  const sendStopMessage = useCallback(async () => {
    if (chrome && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, { action: "SendChatMessage", message: settings.stopRecordingMessage });
      }
    } else {
      console.log('Web app mode: Stop recording message not sent (no chat integration)');
    }
    return {};
  }, [settings]);

  const getTimestampStr = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // JavaScript months start at 0
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const millisecond = String(now.getMilliseconds()).padStart(3, '0');
    const formattedDate = `${year}-${month}-${day}-${hour}:${minute}:${second}.${millisecond}`;
    return formattedDate;
  }

  const startTranscription = useCallback(async (user: any, userName: string, meetingTopic: string) => {
    const isSupabaseAuth = supabaseUser !== null && session !== null;
    const isCognitoAuth = user && user.access_token && !(await checkTokenExpired(user));
    
    if (!isSupabaseAuth && !isCognitoAuth) {
      console.error('User not authenticated');
      login();
      return;
    }

    setShouldConnect(true);
    
    // Get user email from Supabase or Cognito
    const userEmail = supabaseUser?.email || user?.attributes?.email || 'unknown@example.com';
    
    const callMetadata = {
      callEvent: 'START',
      agentId: userName,
      fromNumber: '+9165551234',
      toNumber: '+8001112222',
      callId: `${meetingTopic} - ${getTimestampStr()}`,
      samplingRate: 8000,
      activeSpeaker: 'n/a',
      owner_email: userEmail
    }

    setCurrentCall(callMetadata);

    try {
      if (chrome.runtime) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab.id) {
          await chrome.tabs.sendMessage(tab.id, { action: "StartTranscription" });
          // We send a message here, but not actually start the stream until we receive a new message with the sample rate.
        }
      } else {
        // Web app mode (non-extension): Start transcription directly
        console.log('Web app mode: Starting transcription without Chrome extension APIs');
        
        // Wait for WebSocket to be ready, then send START message
        setTimeout(() => {
          if (readyState === ReadyState.OPEN) {
            sendMessage(JSON.stringify(callMetadata));
            setIsTranscribing(true);
            console.log('Transcription started in web app mode');
          } else {
            console.warn('WebSocket not ready, waiting for connection...');
            // Will be handled by the onOpen callback in useWebSocket
          }
        }, 1000);
      }
    } catch (exception) {
      console.error('Error starting transcription:', exception);
      alert("If you recently installed or update LMA, please refresh the browser's page and try again.");
    }
  }, [supabaseUser, session, checkTokenExpired, login, setShouldConnect, setCurrentCall, readyState, sendMessage, setIsTranscribing]);

  const stopTranscription = useCallback(() => {
    if (isTranscribing) {
      if (chrome.runtime) {
        chrome.runtime.sendMessage({ action: "StopTranscription" });
      }
      if (readyState === ReadyState.OPEN) {
        currentCall.callEvent = 'END';
        sendMessage(JSON.stringify(currentCall));
        getWebSocket()?.close();
      }
      setShouldConnect(false);
      setIsTranscribing(false);
      setPaused(false);
      sendStopMessage();
    }
  }, [readyState, shouldConnect, isTranscribing, paused, setIsTranscribing, getWebSocket, sendMessage, setPaused, sendStopMessage, sendRecordingMessage]);

  useEffect(() => {
    if (chrome.runtime) {
      const handleRuntimeMessage = async (request: any, _sender: any, _sendResponse: any) => {
        if (request.action === "TranscriptionStopped") {
          stopTranscription();
        } else if (request.action === "UpdateMetadata") {
          updateMetadata(request.metadata);
        } else if (request.action === "SamplingRate") {
          // This event should only bubble up once at the start of recording in the injected code
          currentCall.samplingRate = request.samplingRate;
          currentCall.callEvent = 'START';
          sendMessage(JSON.stringify(currentCall));
          setIsTranscribing(true);
          sendRecordingMessage();
        } else if (request.action === "AudioData") {
          if (readyState === ReadyState.OPEN) {
            const audioData = await dataUrlToBytes(request.audio, muted, paused);
            sendMessage(audioData);
          }
        } else if (request.action === "ActiveSpeakerChange") {
          currentCall.callEvent = 'SPEAKER_CHANGE';
          currentCall.activeSpeaker = request.active_speaker;
          setActiveSpeaker(request.active_speaker);
          sendMessage(JSON.stringify(currentCall));
        } else if (request.action === "MuteChange") {
          setMuted(request.mute);
        }
      };
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
      // Clean up the listener when the component unmounts
      return () => chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    }
  }, [currentCall, metadata, readyState, muted, paused, activeSpeaker, isTranscribing, setMuted,
    setActiveSpeaker, sendMessage, setPlatform, setIsTranscribing, sendRecordingMessage, updateMetadata
  ]);

  return (
    <IntegrationContext.Provider value={{
      currentCall, isTranscribing, muted, setMuted, paused, setPaused,
      fetchMetadata, startTranscription, stopTranscription, metadata, platform,
      activeSpeaker, sendRecordingMessage
    }}>
      {children}
    </IntegrationContext.Provider>
  );
}
export function useIntegration() {
  return useContext(IntegrationContext);
}
export default IntegrationProvider;