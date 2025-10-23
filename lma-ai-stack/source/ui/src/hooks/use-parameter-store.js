/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { useState, useEffect } from 'react';

// AWS SSM disabled - project migrated to Supabase
// All settings should be managed via environment variables or Supabase config

const useParameterStore = () => {
  const [settings] = useState({
    // WebSocket endpoint for real-time transcription
    WSEndpoint: process.env.REACT_APP_WS_SERVER_URL || 'ws://localhost:8080/api/v1/ws',

    // Recording disclaimer message
    recordingDisclaimer:
      'By proceeding, you confirm that you have obtained consent from all participants to record this meeting. ' +
      'This recording will be transcribed and may be stored for analysis purposes. ' +
      'Do you agree to start recording?',

    // Supabase configuration
    supabaseUrl: process.env.REACT_APP_SUPABASE_URL,
    supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,

    // Feature flags
    enableRealtime: process.env.REACT_APP_ENABLE_REALTIME === 'true',
    enableMeetingSummaries: process.env.REACT_APP_ENABLE_MEETING_SUMMARIES === 'true',
    enableSpeakerLabels: process.env.REACT_APP_ENABLE_SPEAKER_LABELS === 'true',
    enableRecording: process.env.REACT_APP_ENABLE_RECORDING === 'true',
    enableSpeakerDetection: process.env.REACT_APP_ENABLE_SPEAKER_DETECTION === 'true',
  });

  useEffect(() => {
    // AWS SSM parameter store disabled
    // Settings now managed via environment variables
    console.log('[useParameterStore] Loaded settings from environment variables:', {
      WSEndpoint: settings.WSEndpoint,
      enableRealtime: settings.enableRealtime,
      enableRecording: settings.enableRecording,
    });
  }, []);

  return settings;
};

export default useParameterStore;
