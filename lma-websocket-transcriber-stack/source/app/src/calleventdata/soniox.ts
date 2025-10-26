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
import { broadcastToCallId } from '../index';

const SONIOX_API_KEY = process.env['SONIOX_API_KEY']!;
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

const DEBUG_LOG_DIR = process.env['DEBUG_LOG_DIR'] || './debug-logs';
const ENABLE_TRANSCRIPT_DEBUG = process.env['ENABLE_TRANSCRIPT_DEBUG'] === 'true';

function logTranscriptDebug(
    meetingId: string,
    stage: string,
    data: any
): void {
    if (!ENABLE_TRANSCRIPT_DEBUG) {
        return;
    }

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
            model: 'stt-rt-v3', // ✅ Upgraded to latest model for better accuracy
            enable_speaker_diarization: true,
            enable_endpoint_detection: true,
            enable_language_identification: true, // ✅ Auto-detect language per token
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
            
            // 🔥 DEBUG: Log EVERY message from Soniox
            console.log('🔥 [SONIOX MESSAGE] Received from Soniox:', {
                hasTokens: !!result.tokens,
                tokenCount: result.tokens?.length || 0,
                finished: result.finished,
                error: result.error_code
            });

            logTranscriptDebug(callMetaData.callId, '1-SONIOX_RAW_RESPONSE', {
                raw_result: result,
                has_tokens: !!result.tokens,
                token_count: result.tokens?.length || 0,
            });

            if (result.tokens && result.tokens.length > 0) {
                const pipelineLogger = getPipelineLogger(callMetaData.callId);
                
                // Debug: Log token reception
                const finalCount = result.tokens.filter((t: any) => t.is_final).length;
                const nonFinalCount = result.tokens.filter((t: any) => !t.is_final).length;
                console.log(`🎯 [SONIOX TOKENS] Received ${result.tokens.length} tokens: ${finalCount} final, ${nonFinalCount} non-final`);
                
                // ✅ BROADCAST TOKENS TO ALL CONNECTIONS (recording + viewing)
                const tokenMessage = {
                    event: 'TOKENS',
                    callId: callMetaData.callId,
                    tokens: result.tokens.map((t: any) => ({
                        // ✅ Clean text: remove <end> tags
                        text: t.text ? t.text.replace(/<end>/g, '').replace(/<\/end>/g, '') : '',
                        speaker: t.speaker || '1',
                        is_final: t.is_final,
                        start_ms: t.start_ms,
                        end_ms: t.end_ms,
                        confidence: t.confidence
                    }))
                };
                
                const sentCount = broadcastToCallId(callMetaData.callId, JSON.stringify(tokenMessage));
                console.log(`✅ [TOKENS BROADCAST] Sent ${result.tokens.length} tokens to ${sentCount} WebSocket connection(s)`);
                
                if (sentCount === 0) {
                    console.log(`⚠️ [TOKENS] No active WebSocket connections for callId: ${callMetaData.callId}`);
                }
                
                // Log partial transcripts for debugging
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
                            
                            // ✅ Clean transcript: remove <end> tags and other special markers
                            const finalText = tokens
                                .map((t: any) => t.text)
                                .join('')
                                .replace(/<end>/g, '')
                                .replace(/<\/end>/g, '');
                            
                            pipelineLogger.logSTTFinal(
                                callMetaData.callId,
                                finalText,
                                speakerName || `Speaker ${speakerNumber}`,
                                tokens[0].confidence
                            );

                            // ✅ Calculate end_time safely: use last token's end_ms if valid, otherwise estimate
                            const lastToken = tokens[tokens.length - 1];
                            const firstToken = tokens[0];
                            let endTime = lastToken.end_ms;
                            
                            // If end_ms is invalid, calculate from all tokens or estimate
                            if (!endTime || endTime <= firstToken.start_ms) {
                                // Try to find the maximum end_ms from all tokens
                                const validEndTimes = tokens
                                    .map((t: any) => t.end_ms)
                                    .filter((e: number) => e && e > firstToken.start_ms);
                                
                                if (validEndTimes.length > 0) {
                                    endTime = Math.max(...validEndTimes);
                                } else {
                                    // Fallback: estimate duration (avg 0.5s per token)
                                    const estimatedDuration = tokens.length * 500; // 500ms per token
                                    endTime = firstToken.start_ms + estimatedDuration;
                                }
                                
                                console.log(
                                    `⚠️ [SONIOX BACKEND] Token end_ms invalid, using calculated endTime: ${endTime}ms (from ${tokens.length} tokens)`
                                );
                            }

                            const transcriptData = {
                                meeting_id: callMetaData.callId,
                                transcript: finalText,
                                speaker_number: speakerNumber,
                                speaker_name: speakerName || undefined,
                                channel: mapSpeakerToChannel(speakerNumber),
                                start_time: firstToken.start_ms,
                                end_time: endTime,
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
                            
                            // ✅ FORWARD FINAL transcript to browser (with validated times in milliseconds)
                            if (socketCallMap.clientWs && socketCallMap.clientWs.readyState === 1) {
                                const finalTranscript = {
                                    event: 'TRANSCRIPT',
                                    callId: callMetaData.callId,
                                    transcript: transcriptData.transcript,
                                    speaker_number: speakerNumber,
                                    speaker_name: speakerName || `Speaker ${speakerNumber}`,
                                    channel: transcriptData.channel,
                                    start_time: transcriptData.start_time / 1000, // Convert ms → seconds for frontend
                                    end_time: transcriptData.end_time / 1000, // Convert ms → seconds for frontend
                                    is_partial: false,
                                    is_final: true,
                                };
                                socketCallMap.clientWs.send(JSON.stringify(finalTranscript));
                                server.log.debug(
                                    `[SONIOX]: [${callMetaData.callId}] - Forwarded FINAL transcript to browser: "${transcriptData.transcript}"`
                                );
                            }
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
    // Import the updateMeetingEnd function
    const { updateMeetingEnd } = await import('../supabase-client');
    
    // Update meeting status and calculate duration from transcript segments
    await updateMeetingEnd(callMetaData.callId);

    server.log.info(`[MEETING]: [${callMetaData.callId}] - Meeting ended with duration calculated`);
};

