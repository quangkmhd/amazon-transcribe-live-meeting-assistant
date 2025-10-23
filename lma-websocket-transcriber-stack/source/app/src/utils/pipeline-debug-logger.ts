import fs from 'fs';
import path from 'path';

/**
 * Pipeline Debug Logger
 * Tracks the complete transcript pipeline from audio reception to UI display
 */

export enum PipelineStage {
  // Stage 1: Audio Reception
  AUDIO_RECEIVED = '1️⃣ AUDIO_RECEIVED',
  AUDIO_BUFFERED = '1️⃣ AUDIO_BUFFERED',
  
  // Stage 2: STT Processing
  STT_SENT = '2️⃣ STT_SENT',
  STT_PARTIAL = '2️⃣ STT_PARTIAL',
  STT_FINAL = '2️⃣ STT_FINAL',
  STT_ERROR = '2️⃣ STT_ERROR',
  
  // Stage 3: Database Operations
  DB_INSERT_START = '3️⃣ DB_INSERT_START',
  DB_INSERT_SUCCESS = '3️⃣ DB_INSERT_SUCCESS',
  DB_INSERT_ERROR = '3️⃣ DB_INSERT_ERROR',
  
  // Stage 4: Edge Function Processing
  EDGE_POLL_START = '4️⃣ EDGE_POLL_START',
  EDGE_PROCESSING = '4️⃣ EDGE_PROCESSING',
  EDGE_COMPLETE = '4️⃣ EDGE_COMPLETE',
  EDGE_ERROR = '4️⃣ EDGE_ERROR',
  
  // Stage 5: Realtime Broadcast
  REALTIME_BROADCAST = '5️⃣ REALTIME_BROADCAST',
  
  // Stage 6: UI Display
  UI_RECEIVED = '6️⃣ UI_RECEIVED',
}

interface PipelineLogEntry {
  timestamp: string;
  stage: PipelineStage;
  callId: string;
  sequenceNumber?: number;
  speaker?: string;
  transcript?: string;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

class PipelineDebugLogger {
  private logFile: string;
  private startTime: Date;
  private stageTimings: Map<string, number> = new Map();

  constructor(callId: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = path.join(process.cwd(), 'debug-logs');
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.logFile = path.join(logDir, `pipeline-${callId}-${timestamp}.txt`);
    this.startTime = new Date();
    
    this.writeHeader(callId);
  }

  private writeHeader(callId: string): void {
    const header = `
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPT PIPELINE DEBUG LOG                            │
│                                                                             │
│  Call ID: ${callId.padEnd(63)}│
│  Started: ${this.startTime.toISOString().padEnd(63)}│
└─────────────────────────────────────────────────────────────────────────────┘

PIPELINE STAGES:
  1️⃣  AUDIO RECEPTION       → Browser sends PCM audio via WebSocket
  2️⃣  STT PROCESSING        → Soniox API transcribes audio + speaker diarization
  3️⃣  DATABASE INSERT       → Save to transcript_events table (staging)
  4️⃣  EDGE FUNCTION         → Process and move to transcripts table (final)
  5️⃣  REALTIME BROADCAST    → Supabase Realtime pushes to subscribers
  6️⃣  UI DISPLAY            → React UI receives and renders transcript

═════════════════════════════════════════════════════════════════════════════

`;
    fs.writeFileSync(this.logFile, header);
  }

  log(entry: PipelineLogEntry): void {
    const elapsed = Date.now() - this.startTime.getTime();
    const elapsedStr = `[+${(elapsed / 1000).toFixed(3)}s]`;
    
    let logLine = `${elapsedStr.padEnd(12)} ${entry.stage.padEnd(30)}`;
    
    if (entry.sequenceNumber !== undefined) {
      logLine += ` | Seq: ${entry.sequenceNumber.toString().padEnd(6)}`;
    }
    
    if (entry.speaker) {
      logLine += ` | Speaker: ${entry.speaker.padEnd(15)}`;
    }
    
    if (entry.duration !== undefined) {
      logLine += ` | Duration: ${entry.duration.toFixed(0)}ms`;
    }
    
    if (entry.transcript) {
      const truncated = entry.transcript.length > 50 
        ? entry.transcript.substring(0, 50) + '...' 
        : entry.transcript;
      logLine += `\n${''.padEnd(55)}└─ Text: "${truncated}"`;
    }
    
    if (entry.error) {
      logLine += `\n${''.padEnd(55)}└─ ❌ ERROR: ${entry.error}`;
    }
    
    if (entry.metadata) {
      const metaStr = JSON.stringify(entry.metadata, null, 2)
        .split('\n')
        .map(line => ''.padEnd(55) + '   ' + line)
        .join('\n');
      logLine += `\n${metaStr}`;
    }
    
    logLine += '\n';
    
    // Track stage timing
    if (!this.stageTimings.has(entry.stage)) {
      this.stageTimings.set(entry.stage, elapsed);
    }
    
    fs.appendFileSync(this.logFile, logLine);
  }

  logAudioReceived(callId: string, audioSize: number, sequenceNumber: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.AUDIO_RECEIVED,
      callId,
      sequenceNumber,
      metadata: { audioSize, format: 'PCM 16-bit' }
    });
  }

  logSTTSent(callId: string, audioSize: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.STT_SENT,
      callId,
      metadata: { audioSize }
    });
  }

  logSTTPartial(callId: string, transcript: string, speaker: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.STT_PARTIAL,
      callId,
      speaker,
      transcript
    });
  }

  logSTTFinal(callId: string, transcript: string, speaker: string, confidence?: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.STT_FINAL,
      callId,
      speaker,
      transcript,
      metadata: { confidence, isFinal: true }
    });
  }

  logSTTError(callId: string, error: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.STT_ERROR,
      callId,
      error
    });
  }

  logDBInsertStart(callId: string, eventData: any): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.DB_INSERT_START,
      callId,
      metadata: {
        table: 'transcript_events',
        speaker: eventData.speaker,
        segmentId: eventData.segment_id
      }
    });
  }

  logDBInsertSuccess(callId: string, duration: number, recordId?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.DB_INSERT_SUCCESS,
      callId,
      duration,
      metadata: { recordId }
    });
  }

  logDBInsertError(callId: string, error: string, duration: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.DB_INSERT_ERROR,
      callId,
      error,
      duration
    });
  }

  logEdgeProcessing(callId: string, batchSize: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.EDGE_PROCESSING,
      callId,
      metadata: { batchSize }
    });
  }

  logRealtimeBroadcast(callId: string, metadata?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.REALTIME_BROADCAST,
      callId,
      metadata
    });
  }

  logEdgePollStart(callId: string, metadata?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.EDGE_POLL_START,
      callId,
      metadata
    });
  }

  logEdgeComplete(callId: string, processedCount: number, duration: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.EDGE_COMPLETE,
      callId,
      duration,
      metadata: { processedCount }
    });
  }

  logEdgeError(callId: string, error: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.EDGE_ERROR,
      callId,
      error
    });
  }

  logUIReceived(callId: string, transcript: string, speaker: string, metadata?: Record<string, any>): void {
    this.log({
      timestamp: new Date().toISOString(),
      stage: PipelineStage.UI_RECEIVED,
      callId,
      speaker,
      transcript: transcript.substring(0, 100), // Truncate long transcripts
      metadata
    });
  }

  getLogContent(): string {
    try {
      return fs.readFileSync(this.logFile, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read log file: ${error}`);
    }
  }

  writeSummary(): void {
    const totalTime = Date.now() - this.startTime.getTime();
    
    const summary = `
═════════════════════════════════════════════════════════════════════════════

PIPELINE SUMMARY:
  Total Processing Time: ${(totalTime / 1000).toFixed(3)}s
  
  Stage Timings (first occurrence):
`;
    
    fs.appendFileSync(this.logFile, summary);
    
    const sortedStages = Array.from(this.stageTimings.entries())
      .sort((a, b) => a[1] - b[1]);
    
    sortedStages.forEach(([stage, timing]) => {
      const line = `    ${stage.padEnd(35)} → +${(timing / 1000).toFixed(3)}s\n`;
      fs.appendFileSync(this.logFile, line);
    });
    
    const footer = `
═════════════════════════════════════════════════════════════════════════════
End of log: ${new Date().toISOString()}
═════════════════════════════════════════════════════════════════════════════
`;
    
    fs.appendFileSync(this.logFile, footer);
  }

  getLogFilePath(): string {
    return this.logFile;
  }
}

// Global logger registry
const loggers = new Map<string, PipelineDebugLogger>();

export function getPipelineLogger(callId: string): PipelineDebugLogger {
  if (!loggers.has(callId)) {
    loggers.set(callId, new PipelineDebugLogger(callId));
  }
  return loggers.get(callId)!;
}

export function closePipelineLogger(callId: string): void {
  const logger = loggers.get(callId);
  if (logger) {
    logger.writeSummary();
    loggers.delete(callId);
  }
}

export { PipelineDebugLogger };
