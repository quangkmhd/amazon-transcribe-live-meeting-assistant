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

const SONIOX_API_KEY = process.env['SONIOX_API_KEY']!;
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

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

        // Send start request with speaker diarization
        const startRequest = {
            api_key: SONIOX_API_KEY,
            audio_format: 'pcm_s16le',
            sample_rate: callMetaData.samplingRate,
            num_channels: 1, // Mono merged audio
            model: 'stt-rt-preview-v2',
            enable_speaker_diarization: true,
            enable_endpoint_detection: true,
            language_hints: ['en', 'vi'],
        };

        sonioxWs.send(JSON.stringify(startRequest));
    });

    // Forward audio chunks from browser to Soniox
    if (audioInputStream) {
        (async () => {
            try {
                for await (const chunk of audioInputStream) {
                    if (sonioxWs.readyState === WebSocket.OPEN) {
                        sonioxWs.send(chunk);
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

            if (result.tokens && result.tokens.length > 0) {
                // Filter only final tokens
                const finalTokens = result.tokens.filter(
                    (t: any) => t.is_final
                );

                if (finalTokens.length > 0) {
                    // Group by speaker
                    const speakerGroups: Record<string, any[]> = {};

                    finalTokens.forEach((token: any) => {
                        const speakerNumber = token.speaker || '1';
                        if (!speakerGroups[speakerNumber]) {
                            speakerGroups[speakerNumber] = [];
                        }
                        speakerGroups[speakerNumber].push(token);
                    });

                    // Save each speaker's segment
                    for (const [speakerNumber, tokens] of Object.entries(
                        speakerGroups
                    )) {
                        try {
                            const speakerName = await getSpeakerName(
                                callMetaData.callId,
                                speakerNumber
                            );

                            await insertTranscriptEvent({
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
                            });

                            server.log.debug(
                                `[SONIOX]: [${callMetaData.callId}] - Saved transcript for speaker ${speakerNumber}`
                            );
                        } catch (error: any) {
                            if (error.code !== '23505') {
                                // Ignore duplicates
                                server.log.error(
                                    `[SONIOX]: [${callMetaData.callId}] - Error saving transcript: ${error}`
                                );
                            }
                        }
                    }
                }
            }
        } catch (error) {
            server.log.error(
                `[SONIOX]: [${callMetaData.callId}] - Error processing message: ${error}`
            );
        }
    });

    sonioxWs.on('error', (error) => {
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
        owner_email: callMetaData.agentId, // or extract from JWT
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

