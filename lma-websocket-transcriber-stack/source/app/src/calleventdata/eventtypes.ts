/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import stream from 'stream';
import { WriteStream } from 'fs';
import WebSocket from 'ws';

export type Uuid = string;             // UUID as defined by RFC#4122

export type EventType = 
    | 'START' // required
    | 'ADD_TRANSCRIPT_SEGMENT' // required 
    | 'UPDATE_AGENT' // optional
    | 'ADD_S3_RECORDING_URL'  // optional
    | 'ADD_CALL_CATEGORY' // optional
    | 'END'; // required

export type CallEventBase<Type extends EventType = EventType> = {
    EventType: Type,
    CallId: Uuid,
    CreatedAt?: string,
    UpdatedAt?: string,
};

export type CallStartEvent = CallEventBase<'START'> & {
    CustomerPhoneNumber: string,
    SystemPhoneNumber: string,
    AgentId: string | undefined,
    AccessToken?: string,
    IdToken?: string,
    RefreshToken?: string,
};

export type CallEndEvent = CallEventBase<'END'> & {
    CustomerPhoneNumber: string,
    SystemPhoneNumber: string,
    AccessToken?: string,
    IdToken?: string,
    RefreshToken?: string,
};

export type CallRecordingEvent = CallEventBase<'ADD_S3_RECORDING_URL'> & {
    RecordingUrl: string,
    AccessToken?: string,
    IdToken?: string,
    RefreshToken?: string,
};

export type AddTranscriptSegmentEvent = CallEventBase<'ADD_TRANSCRIPT_SEGMENT'> & {
    Channel?: string,
    ParticipantName?: string,
    SegmentId?: string,
    StartTime?: number,
    EndTime?: number,
    Transcript?: string,
    IsPartial?: boolean,
    Sentiment?: string,
    TranscriptEvent?: any,
    UtteranceEvent?: any,
    Speaker: string,
    AccessToken?: string,
    IdToken?: string,
    RefreshToken?: string,
};

export type AddCallCategoryEvent = CallEventBase<'ADD_CALL_CATEGORY'> & {
    CategoryEvent: any,
    AccessToken?: string,
    IdToken?: string,
    RefreshToken?: string,
};

export interface ChannelSpeakerData {
    currentSpeakerName: string | null;
    speakers: string[];
    startTimes: number[];
}

export type CallMetaData = {
    callId: Uuid,
    fromNumber?: string,
    toNumber?: string,
    shouldRecordCall?: boolean,
    agentId?: string,
    samplingRate: number,
    callEvent: string,
    activeSpeaker: string,
    channels: {
        [channelId: string]: ChannelSpeakerData;
    };
    accessToken?: string,
    idToken?: string,
    refreshToken?: string,
    owner_email?: string,
};

export type SocketCallData = {
    callMetadata: CallMetaData,
    audioInputStream?: stream.PassThrough,
    writeRecordingStream?: WriteStream,
    recordingFileSize?: number
    startStreamTime: Date,
    speakerEvents: [],
    ended: boolean,
    sonioxWs?: WebSocket, // Soniox WebSocket connection
    clientWs?: WebSocket, // Client WebSocket connection (to send transcripts back to browser)
    audioChunkCount?: number, // Track number of audio chunks received for pipeline debugging
}