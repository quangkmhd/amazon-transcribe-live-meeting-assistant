/**
 * Pipeline Logger Utility
 * Sends stage 6 (UI_RECEIVED) logs to backend for complete pipeline tracking
 */

import { useSettings } from '../context/SettingsContext';

interface UIReceivedLogData {
  callId: string;
  transcript: string;
  speaker: string;
  metadata?: {
    timestamp?: string;
    segmentId?: string;
    confidence?: number;
  };
}

/**
 * Log when UI receives and displays a transcript
 * This completes the pipeline tracking from audio → STT → DB → Edge → Realtime → UI
 */
export async function logUIReceived(data: UIReceivedLogData): Promise<void> {
  try {
    // Get backend endpoint from settings
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';
    
    const response = await fetch(`${backendUrl}/api/v1/pipeline-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: data.callId,
        stage: '6️⃣ UI_RECEIVED',
        transcript: data.transcript,
        speaker: data.speaker,
        metadata: {
          ...data.metadata,
          receivedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
        },
      }),
    });

    if (!response.ok) {
      console.warn('[Pipeline Logger] Failed to send UI log:', response.statusText);
    }
  } catch (error) {
    // Don't fail the UI if logging fails
    console.error('[Pipeline Logger] Error sending UI log:', error);
  }
}

/**
 * Debounced version to avoid spamming logs for rapid transcript updates
 */
let logQueue: UIReceivedLogData[] = [];
let flushTimer: NodeJS.Timeout | null = null;

export function logUIReceivedDebounced(data: UIReceivedLogData): void {
  logQueue.push(data);
  
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  
  // Flush logs every 2 seconds
  flushTimer = setTimeout(() => {
    if (logQueue.length > 0) {
      // Log only the most recent transcript per speaker
      const latest = logQueue[logQueue.length - 1];
      logUIReceived(latest);
      logQueue = [];
    }
  }, 2000);
}
