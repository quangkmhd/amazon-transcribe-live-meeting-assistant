/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';
import { CallMetaData, SocketCallData } from './eventtypes';
import {
    insertTranscriptEvent,
    upsertMeeting,
    getSpeakerName,
} from '../supabase-client';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getPipelineLogger } from '../utils/pipeline-debug-logger';

const SONIOX_API_KEY = process.env['SONIOX_API_KEY']!;
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

const DEBUG_LOG_DIR = process.env['DEBUG_LOG_DIR'] || './debug-logs';
const ENABLE_TRANSCRIPT_DEBUG = process.env['ENABLE_TRANSCRIPT_DEBUG'] === 'true';

function logTranscriptDebug(
    meetingId: string,
    stage: string,
    data: any
): void {
    if (!ENABLE_TRANSCRIPT_DEBUG) return;

    try {
        if (!existsSync(DEBUG_LOG_DIR)) {
            mkdirSync(DEBUG_LOG_DIR, { recursive: true });
        }

        const logFile = join(DEBUG_LOG_DIR, `transcript-${meetingId}.txt`);
        const timestamp = new Date().toISOString();
        const logEntry = `\n${'='.repeat(80)}\n[${timestamp}] STAGE: ${stage}\n${'-'.repeat(80)}\n${JSON.stringify(data, null, 2)}\n`;

        appendFileSync(logFile, logEntry, 'utf-8');
    } catch (error) {
        console.error(`Failed to write debug log: ${error}`);
    }
}

export const startSonioxTranscription = async (
    socketCallMap: SocketCallData,
    server: FastifyInstance
) => {
    const callMetaData = socketCallMap.callMetadata;
    const audioInputStream = socketCallMap.audioInputStream;

    // Create WebSocket connection to Soniox
    const sonioxWs = new WebSocket(SONIOX_WS_URL);

    sonioxWs.on('open', () => {
        server.log.info(
            `[SONIOX]: [${callMetaData.callId}] - Connected to Soniox API`
        );

        // Determine actual channel count from metadata or default to 2 (stereo)
        const actualChannels = callMetaData.channels || 2;
        
        // Send start request with speaker diarization
        const startRequest = {
            api_key: SONIOX_API_KEY,
            audio_format: 'pcm_s16le',
            sample_rate: callMetaData.samplingRate,
            num_channels: actualChannels, // Use actual channel count from audio stream
            model: 'stt-rt-preview-v2',
            enable_speaker_diarization: true,
            enable_endpoint_detection: true,
            language_hints: ['en', 'vi'],
        };

        server.log.info(
            `[SONIOX]: [${callMetaData.callId}] - Starting transcription with ${actualChannels} channel(s) at ${callMetaData.samplingRate}Hz`
        );

        sonioxWs.send(JSON.stringify(startRequest));
    });

    // Forward audio chunks from browser to Soniox
    if (audioInputStream) {
        let audioChunksSent = 0;
        const pipelineLogger = getPipelineLogger(callMetaData.callId);
        
        (async () => {
            try {
                for await (const chunk of audioInputStream) {
                    if (sonioxWs.readyState === WebSocket.OPEN) {
                        sonioxWs.send(chunk);
                        audioChunksSent++;
                        
                        // Log every 100th chunk sent to Soniox
                        if (audioChunksSent % 100 === 1) {
                            pipelineLogger.logSTTSent(callMetaData.callId, chunk.length);
                        }
                    }
                }
            } catch (error) {
                server.log.error(
                    `[SONIOX]: [${callMetaData.callId}] - Error streaming audio: ${error}`
                );
            }
        })();
    }

    // Handle transcript results from Soniox
    sonioxWs.on('message', async (data: Buffer) => {
        try {
            const result = JSON.parse(data.toString());

            logTranscriptDebug(callMetaData.callId, '1-SONIOX_RAW_RESPONSE', {
                raw_result: result,
                has_tokens: !!result.tokens,
                token_count: result.tokens?.length || 0,
            });

            if (result.tokens && result.tokens.length > 0) {
                const pipelineLogger = getPipelineLogger(callMetaData.callId);
                
                // Log partial transcripts
                const partialTokens = result.tokens.filter((t: any) => !t.is_final);
                if (partialTokens.length > 0) {
                    const partialText = partialTokens.map((t: any) => t.text).join('');
                    const speaker = partialTokens[0].speaker || '1';
                    const speakerName = await getSpeakerName(callMetaData.callId, speaker);
                    pipelineLogger.logSTTPartial(callMetaData.callId, partialText, speakerName || `Speaker ${speaker}`);
                }
                
                const finalTokens = result.tokens.filter(
                    (t: any) => t.is_final
                );

                logTranscriptDebug(callMetaData.callId, '2-FILTERED_TOKENS', {
                    total_tokens: result.tokens.length,
                    final_tokens: finalTokens.length,
                    final_tokens_detail: finalTokens,
                });

                if (finalTokens.length > 0) {
                    const speakerGroups: Record<string, any[]> = {};

                    finalTokens.forEach((token: any) => {
                        const speakerNumber = token.speaker || '1';
                        if (!speakerGroups[speakerNumber]) {
                            speakerGroups[speakerNumber] = [];
                        }
                        speakerGroups[speakerNumber].push(token);
                    });

                    logTranscriptDebug(callMetaData.callId, '3-SPEAKER_GROUPS', {
                        speaker_count: Object.keys(speakerGroups).length,
                        speakers: Object.keys(speakerGroups),
                        speaker_groups: speakerGroups,
                    });

                    const pipelineLogger = getPipelineLogger(callMetaData.callId);
                    
                    for (const [speakerNumber, tokens] of Object.entries(
                        speakerGroups
                    )) {
                        try {
                            const speakerName = await getSpeakerName(
                                callMetaData.callId,
                                speakerNumber
                            );
                            
                            const finalText = tokens.map((t: any) => t.text).join('');
                            pipelineLogger.logSTTFinal(
                                callMetaData.callId,
                                finalText,
                                speakerName || `Speaker ${speakerNumber}`,
                                tokens[0].confidence
                            );

                            const transcriptData = {
                                meeting_id: callMetaData.callId,
                                transcript: tokens
                                    .map((t: any) => t.text)
                                    .join(''),
                                speaker_number: speakerNumber,
                                speaker_name: speakerName || undefined,
                                channel: mapSpeakerToChannel(speakerNumber),
                                start_time: tokens[0].start_ms,
                                end_time:
                                    tokens[tokens.length - 1].end_ms,
                                is_final: true,
                            };

                            logTranscriptDebug(
                                callMetaData.callId,
                                '4-BEFORE_INSERT_TRANSCRIPT_EVENTS',
                                {
                                    speaker_number: speakerNumber,
                                    speaker_name: speakerName,
                                    transcript_data: transcriptData,
                                }
                            );

                            await insertTranscriptEvent(transcriptData);

                            logTranscriptDebug(
                                callMetaData.callId,
                                '5-AFTER_INSERT_TRANSCRIPT_EVENTS_SUCCESS',
                                {
                                    speaker_number: speakerNumber,
                                    transcript: transcriptData.transcript,
                                    inserted_at: new Date().toISOString(),
                                }
                            );

                            server.log.debug(
                                `[SONIOX]: [${callMetaData.callId}] - Saved transcript for speaker ${speakerNumber}`
                            );
                        } catch (error: any) {
                            const pipelineLogger = getPipelineLogger(callMetaData.callId);
                            pipelineLogger.logSTTError(
                                callMetaData.callId,
                                `${error.code}: ${error.message}`
                            );
                            
                            logTranscriptDebug(
                                callMetaData.callId,
                                '5-AFTER_INSERT_TRANSCRIPT_EVENTS_ERROR',
                                {
                                    speaker_number: speakerNumber,
                                    error_code: error.code,
                                    error_message: error.message,
                                    error_detail: error.detail,
                                }
                            );

                            if (error.code !== '23505') {
                                server.log.error(
                                    `[SONIOX]: [${callMetaData.callId}] - Error saving transcript: ${error}`
                                );
                            }
                        }
                    }
                }
            }
        } catch (error) {
            logTranscriptDebug(callMetaData.callId, 'ERROR_PROCESSING_MESSAGE', {
                error: String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });

            server.log.error(
                `[SONIOX]: [${callMetaData.callId}] - Error processing message: ${error}`
            );
        }
    });

    sonioxWs.on('error', (error) => {
        const pipelineLogger = getPipelineLogger(callMetaData.callId);
        pipelineLogger.logSTTError(callMetaData.callId, `WebSocket error: ${error}`);
        
        server.log.error(
            `[SONIOX]: [${callMetaData.callId}] - WebSocket error: ${error}`
        );
    });

    sonioxWs.on('close', () => {
        server.log.info(
            `[SONIOX]: [${callMetaData.callId}] - Connection closed`
        );
    });

    // Store WebSocket reference for cleanup
    socketCallMap.sonioxWs = sonioxWs;
};

// Helper: Map speaker number to channel (backward compatibility)
function mapSpeakerToChannel(speakerNumber: string): string {
    return speakerNumber === '1' ? 'AGENT' : 'CALLER';
}

export const writeMeetingStartEvent = async (
    callMetaData: CallMetaData,
    server: FastifyInstance
): Promise<void> => {
    await upsertMeeting({
        meeting_id: callMetaData.callId,
        agent_id: callMetaData.agentId,
        status: 'started',
        owner_email: callMetaData.owner_email || callMetaData.agentId,
    });

    server.log.info(
        `[MEETING]: [${callMetaData.callId}] - Meeting started`
    );
};

export const writeMeetingEndEvent = async (
    callMetaData: CallMetaData,
    server: FastifyInstance
): Promise<void> => {
    await upsertMeeting({
        meeting_id: callMetaData.callId,
        status: 'ended',
    });

    server.log.info(`[MEETING]: [${callMetaData.callId}] - Meeting ended`);
};

