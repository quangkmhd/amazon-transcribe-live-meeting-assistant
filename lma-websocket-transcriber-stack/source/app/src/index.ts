/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import 'dotenv/config';
import fastify from 'fastify';
import websocket from '@fastify/websocket';
import { FastifyRequest } from 'fastify';

import WebSocket from 'ws'; // type structure for the websocket object used by fastify/websocket
// import stream from 'stream';
import os from 'os';
import path from 'path';
import BlockStream from 'block-stream2';

import fs from 'fs';
import { randomUUID } from 'crypto';

import {
    CallMetaData,
    SocketCallData,
} from './calleventdata';

import {
    startSonioxTranscription,
    writeMeetingStartEvent,
    writeMeetingEndEvent,
} from './calleventdata/soniox';

import {
    uploadRecording,
    updateMeetingRecording,
} from './supabase-client';

import {
    createWavHeader,
    posixifyFilename,
    normalizeErrorForLogging,
    getClientIP,
} from './utils';

import { jwtVerifier } from './utils/jwt-verifier';
import { getPipelineLogger, closePipelineLogger } from './utils/pipeline-debug-logger';
import { registerPipelineLogRoutes } from './routes/pipeline-log';

const CPU_HEALTH_THRESHOLD = parseInt(
    process.env['CPU_HEALTH_THRESHOLD'] || '50',
    10
);
const LOCAL_TEMP_DIR = process.env['LOCAL_TEMP_DIR'] || '/tmp/';
const WS_LOG_LEVEL = process.env['WS_LOG_LEVEL'] || 'debug';
const WS_LOG_INTERVAL = parseInt(process.env['WS_LOG_INTERVAL'] || '120', 10);
const SHOULD_RECORD_CALL = (process.env['SHOULD_RECORD_CALL'] || '') === 'true';

const socketMap = new Map<WebSocket, SocketCallData>();

// create fastify server (with logging enabled for non-PROD environments)
const server = fastify({
    logger: {
        level: WS_LOG_LEVEL,
        prettyPrint: {
            ignore: 'pid,hostname',
            translateTime: 'SYS:HH:MM:ss.l',
            colorize: false,
            levelFirst: true,
        },
    },
    disableRequestLogging: true,
});
// register the @fastify/websocket plugin with the fastify server
server.register(websocket);

// Register pipeline log routes (for Edge Function and UI to send logs)
registerPipelineLogRoutes(server);

// Setup preHandler hook to authenticate
server.addHook('preHandler', async (request, reply) => {
    if (!request.url.includes('health')) {
        const clientIP = getClientIP(request.headers);
        server.log.debug(
            `[AUTH]: [${clientIP}] - Received preHandler hook for authentication. URI: <${
                request.url
            }>, Headers: ${JSON.stringify(request.headers)}`
        );

        await jwtVerifier(request, reply);
    }
});

// Setup Route for websocket connection
server.get(
    '/api/v1/ws',
    { websocket: true, logLevel: 'debug' },
    (connection, request) => {
        const clientIP = getClientIP(request.headers);
        server.log.debug(
            `[NEW CONNECTION]: [${clientIP}] - Received new connection request @ /api/v1/ws. URI: <${
                request.url
            }>, Headers: ${JSON.stringify(request.headers)}`
        );

        registerHandlers(clientIP, connection.socket, request); // setup the handler functions for websocket events
    }
);

type HealthCheckRemoteInfo = {
    addr: string;
    tsFirst: number;
    tsLast: number;
    count: number;
};
const healthCheckStats = new Map<string, HealthCheckRemoteInfo>();

// Setup Route for health check
server.get('/health/check', { logLevel: 'warn' }, (request, response) => {
    const now = Date.now();
    const cpuUsage = (os.loadavg()[0] / os.cpus().length) * 100;
    const isHealthy = cpuUsage > CPU_HEALTH_THRESHOLD ? false : true;
    const status = isHealthy ? 200 : 503;

    const remoteIp = request.socket.remoteAddress || 'unknown';
    const item = healthCheckStats.get(remoteIp);
    if (!item) {
        server.log.debug(
            `[HEALTH CHECK]: [${remoteIp}] - Received First health check from load balancer. URI: <${
                request.url
            }>, Headers: ${JSON.stringify(
                request.headers
            )} ==> Health Check status - CPU Usage%: ${cpuUsage}, IsHealthy: ${isHealthy}, Status: ${status}`
        );
        healthCheckStats.set(remoteIp, {
            addr: remoteIp,
            tsFirst: now,
            tsLast: now,
            count: 1,
        });
    } else {
        item.tsLast = now;
        ++item.count;
        const elapsed_seconds = Math.round((item.tsLast - item.tsFirst) / 1000);
        if (elapsed_seconds % WS_LOG_INTERVAL == 0) {
            server.log.debug(
                `[HEALTH CHECK]: [${remoteIp}] - Received Health check # ${
                    item.count
                } from load balancer. URI: <${request.url}>, Headers: ${JSON.stringify(
                    request.headers
                )} ==> Health Check status - CPU Usage%: ${cpuUsage}, IsHealthy: ${isHealthy}, Status: ${status}`
            );
        }
    }

    response
        .code(status)
        .header(
            'Cache-Control',
            'max-age=0, no-cache, no-store, must-revalidate, proxy-revalidate'
        )
        .send({ 'Http-Status': status, Healthy: isHealthy });
});

// Setup handlers for websocket events - 'message', 'close', 'error'
const registerHandlers = (
    clientIP: string,
    ws: WebSocket,
    request: FastifyRequest
): void => {
    ws.on('message', async (data, isBinary): Promise<void> => {
        try {
            if (isBinary) {
                const audioinput = Buffer.from(data as Uint8Array);
                await onBinaryMessage(clientIP, ws, audioinput);
            } else {
                await onTextMessage(
                    clientIP,
                    ws,
                    Buffer.from(data as Uint8Array).toString('utf8'),
                    request
                );
            }
        } catch (error) {
            server.log.error(
                `[ON MESSAGE]: [${clientIP}] - Error processing message: ${normalizeErrorForLogging(
                    error
                )}`
            );
            process.exit(1);
        }
    });

    ws.on('close', (code: number) => {
        server.log.debug(
            `[ON WSCLOSE]: [${clientIP}] Received Websocket close message from the client. Closing the connection.`
        );

        try {
            onWsClose(ws, code);
        } catch (err) {
            server.log.error(
                `[ON WSCLOSE]: [${clientIP}] Error in WS close handler: ${normalizeErrorForLogging(
                    err
                )}`
            );
        }
    });

    ws.on('error', (error: Error) => {
        server.log.error(
            `[ON WSERROR]: [${clientIP}] - Websocket error, forcing close: ${normalizeErrorForLogging(
                error
            )}`
        );
        ws.close();
    });
};

const onBinaryMessage = async (
    clientIP: string,
    ws: WebSocket,
    data: Uint8Array
): Promise<void> => {
    const socketData = socketMap.get(ws);

    if (
        socketData !== undefined &&
    socketData.audioInputStream !== undefined &&
    socketData.writeRecordingStream !== undefined &&
    socketData.recordingFileSize !== undefined
    ) {
        // Pipeline Debug: Log audio reception
        if (!socketData.audioChunkCount) {
            socketData.audioChunkCount = 0;
        }
        socketData.audioChunkCount++;
        
        // Log every 100th chunk to avoid flooding
        if (socketData.audioChunkCount % 100 === 1) {
            const logger = getPipelineLogger(socketData.callMetadata.callId);
            logger.logAudioReceived(
                socketData.callMetadata.callId,
                data.length,
                socketData.audioChunkCount
            );
        }
        
        socketData.audioInputStream.write(data);
        socketData.writeRecordingStream.write(data);
        socketData.recordingFileSize += data.length;
    } else {
        server.log.error(
            `[ON BINARY MESSAGE]: [${clientIP}] - Error: received audio data before metadata. Check logs for errors in START event.`
        );
    }
};

const onTextMessage = async (
    clientIP: string,
    ws: WebSocket,
    data: string,
    request: FastifyRequest
): Promise<void> => {
  type queryobj = {
      authorization: string;
      id_token: string;
      refresh_token: string;
  };

  type headersobj = {
      authorization: string;
      id_token: string;
      refresh_token: string;
  };

  const query = request.query as queryobj;
  const headers = request.headers as headersobj;
  const auth = query.authorization || headers.authorization;
  const idToken = query.id_token || headers.id_token;
  const refreshToken = query.refresh_token || headers.refresh_token;

  const match = auth?.match(/^Bearer (.+)$/);
  const callMetaData: CallMetaData = JSON.parse(data);
  if (!match) {
      server.log.error(
          `[AUTH]: [${clientIP}] - No Bearer token found in header or query string. URI: <${
              request.url
          }>, Headers: ${JSON.stringify(request.headers)}`
      );

      return;
  }

  const accessToken = match[1];

  try {
      server.log.debug(
          `[ON TEXT MESSAGE]: [${clientIP}][${callMetaData.callId}] - Call Metadata received from client: ${data}`
      );
  } catch (error) {
      server.log.error(
          `[ON TEXT MESSAGE]: [${clientIP}][${
              callMetaData.callId
          }] - Error parsing call metadata: ${data} ${normalizeErrorForLogging(
              error
          )}`
      );
      callMetaData.callId = randomUUID();
  }

  callMetaData.accessToken = accessToken;
  callMetaData.idToken = idToken;
  callMetaData.refreshToken = refreshToken;

  if (callMetaData.callEvent === 'START') {
      // generate random metadata if none is provided
      callMetaData.callId = callMetaData.callId || randomUUID();
      callMetaData.fromNumber = callMetaData.fromNumber || 'Customer Phone';
      callMetaData.toNumber = callMetaData.toNumber || 'System Phone';
      callMetaData.activeSpeaker =
      callMetaData.activeSpeaker ?? callMetaData?.fromNumber ?? 'unknown';

      // if (typeof callMetaData.shouldRecordCall === 'undefined' || callMetaData.shouldRecordCall === null) {
      //     server.log.debug(`[${callMetaData.callEvent}]: [${callMetaData.callId}] - Client did not provide ShouldRecordCall in CallMetaData. Defaulting to  CFN parameter EnableAudioRecording =  ${SHOULD_RECORD_CALL}`);

      //     callMetaData.shouldRecordCall = SHOULD_RECORD_CALL;
      // } else {
      //     server.log.debug(`[${callMetaData.callEvent}]: [${callMetaData.callId}] - Using client provided ShouldRecordCall parameter in CallMetaData =  ${callMetaData.shouldRecordCall}`);
      // }

      callMetaData.agentId = callMetaData.agentId || randomUUID();

      await writeMeetingStartEvent(callMetaData, server);
      const tempRecordingFilename = getTempRecordingFileName(callMetaData);
      // Sanitize filename to prevent path traversal attacks
      const sanitizedFilename = path.basename(tempRecordingFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!sanitizedFilename || sanitizedFilename === '.' || sanitizedFilename === '..') {
          throw new Error('Invalid recording filename provided');
      }
      const writeRecordingStream = fs.createWriteStream(
          path.resolve(LOCAL_TEMP_DIR, sanitizedFilename)
      );
      const recordingFileSize = 0;

      const highWaterMarkSize = (callMetaData.samplingRate / 10) * 2 * 2;
      const audioInputStream = new BlockStream({ size: highWaterMarkSize });
      const socketCallMap: SocketCallData = {
          callMetadata: {
              callId: callMetaData.callId,
              callEvent: callMetaData.callEvent,
              fromNumber: callMetaData.fromNumber,
              toNumber: callMetaData.toNumber,
              activeSpeaker: callMetaData.activeSpeaker,
              agentId: callMetaData.agentId,
              accessToken: callMetaData.accessToken,
              idToken: callMetaData.idToken,
              refreshToken: callMetaData.refreshToken,
              shouldRecordCall: callMetaData.shouldRecordCall,
              samplingRate: callMetaData.samplingRate,
              channels: callMetaData.channels
          },
          audioInputStream: audioInputStream,
          writeRecordingStream: writeRecordingStream,
          recordingFileSize: recordingFileSize,
          startStreamTime: new Date(),
          speakerEvents: [],
          ended: false,
      };
      socketMap.set(ws, socketCallMap);
      
      // Send acknowledgment to client that START event is fully processed
      // and server is ready to receive audio data
      ws.send(JSON.stringify({
          event: 'START_ACK',
          callId: callMetaData.callId,
          message: 'Server ready to receive audio data'
      }));
      
      server.log.debug(
          `[START_ACK]: [${callMetaData.callId}] - Sent START_ACK to client`
      );
      
      // Pipeline Debug: Initialize logger for this call
      const logger = getPipelineLogger(callMetaData.callId);
      server.log.info(
          `[PIPELINE DEBUG]: [${callMetaData.callId}] - Pipeline debug logger initialized. Log file: ${logger.getLogFilePath()}`
      );
      
      startSonioxTranscription(socketCallMap, server);
  } else if (callMetaData.callEvent === 'SPEAKER_CHANGE') {
      const socketData = socketMap.get(ws);
      server.log.debug(
          `[${callMetaData.callEvent}]: [${callMetaData.callId}] - Received speaker change. Active speaker = ${callMetaData.activeSpeaker}`
      );

      if (socketData && socketData.callMetadata) {
      // We already know speaker name for the microphone channel (ch_1) - represented in callMetaData.agentId.
      // We should only use SPEAKER_CHANGE to track who is speaking on the incoming meeting channel (ch_0)
      // If the speaker is the same as the agentId, then we should ignore the event.
          const mic_channel_speaker = callMetaData.agentId;
          const activeSpeaker = callMetaData.activeSpeaker;
          if (activeSpeaker !== mic_channel_speaker) {
              server.log.debug(
                  `[${callMetaData.callEvent}]: [${callMetaData.callId}] - active speaker '${activeSpeaker}' assigned to meeting channel (ch_0) as name does not match mic channel (ch_1) speaker '${mic_channel_speaker}'`
              );
              // set active speaker in the socketData structure being used by startTranscribe results loop.
              socketData.callMetadata.activeSpeaker = callMetaData.activeSpeaker;
          } else {
              server.log.debug(
                  `[${callMetaData.callEvent}]: [${callMetaData.callId}] - active speaker '${activeSpeaker}' not assigned to meeting channel (ch_0) as name matches mic channel (ch_1) speaker '${mic_channel_speaker}'`
              );
          }
      } else {
      // this is not a valid call metadata
          server.log.error(
              `[${callMetaData.callEvent}]: [${
                  callMetaData.callId
              }] - Invalid call metadata: ${JSON.stringify(callMetaData)}`
          );
      }
  } else if (callMetaData.callEvent === 'END') {
      const socketData = socketMap.get(ws);
      if (!socketData || !socketData.callMetadata) {
          server.log.error(
              `[${callMetaData.callEvent}]: [${
                  callMetaData.callId
              }] - Received END without starting a call:  ${JSON.stringify(
                  callMetaData
              )}`
          );
          return;
      }
      server.log.debug(
          `[${callMetaData.callEvent}]: [${
              callMetaData.callId
          }] - Received call end event from client, writing it to KDS:  ${JSON.stringify(
              callMetaData
          )}`
      );

      if (
          typeof callMetaData.shouldRecordCall === 'undefined' ||
      callMetaData.shouldRecordCall === null
      ) {
          server.log.debug(
              `[${callMetaData.callEvent}]: [${callMetaData.callId}] - Client did not provide ShouldRecordCall in CallMetaData. Defaulting to  CFN parameter EnableAudioRecording =  ${SHOULD_RECORD_CALL}`
          );

          callMetaData.shouldRecordCall = SHOULD_RECORD_CALL;
      } else {
          server.log.debug(
              `[${callMetaData.callEvent}]: [${callMetaData.callId}] - Using client provided ShouldRecordCall parameter in CallMetaData =  ${callMetaData.shouldRecordCall}`
          );
      }
      await endCall(ws, socketData, callMetaData);
  }
};

const onWsClose = async (ws: WebSocket, code: number): Promise<void> => {
    ws.close(code);
    const socketData = socketMap.get(ws);
    if (socketData) {
        server.log.debug(
            `[ON WSCLOSE]: [${
                socketData.callMetadata.callId
            }] - Writing call end event due to websocket close event ${JSON.stringify(
                socketData.callMetadata
            )}`
        );
        await endCall(ws, socketData);
    }
};

const endCall = async (
    ws: WebSocket,
    socketData: SocketCallData,
    callMetaData?: CallMetaData
): Promise<void> => {
    if (callMetaData === undefined) {
        callMetaData = socketData.callMetadata;
    }

    if (socketData !== undefined && socketData.ended === false) {
        socketData.ended = true;

        if (callMetaData !== undefined && callMetaData != null) {
            await writeMeetingEndEvent(callMetaData, server);
            if (socketData.writeRecordingStream && socketData.recordingFileSize) {
                socketData.writeRecordingStream.end();

                if (callMetaData.shouldRecordCall || SHOULD_RECORD_CALL) {
                    server.log.debug(
                        `[${callMetaData.callEvent}]: [${
                            callMetaData.callId
                        }] - Audio Recording enabled. Uploading to Supabase Storage.: ${JSON.stringify(
                            callMetaData
                        )}`
                    );
                    const header = createWavHeader(
                        callMetaData.samplingRate,
                        socketData.recordingFileSize
                    );
                    const tempRecordingFilename = getTempRecordingFileName(callMetaData);
                    const wavRecordingFilename = getWavRecordingFileName(callMetaData);
                    // Sanitize filenames to prevent path traversal attacks
                    const sanitizedTempFilename = path.basename(tempRecordingFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
                    const sanitizedWavFilename = path.basename(wavRecordingFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
                    
                    if (!sanitizedTempFilename || sanitizedTempFilename === '.' || sanitizedTempFilename === '..' ||
                        !sanitizedWavFilename || sanitizedWavFilename === '.' || sanitizedWavFilename === '..') {
                        throw new Error('Invalid filename provided for recording conversion');
                    }
                    
                    const readStream = fs.createReadStream(
                        path.resolve(LOCAL_TEMP_DIR, sanitizedTempFilename)
                    );
                    const writeStream = fs.createWriteStream(
                        path.resolve(LOCAL_TEMP_DIR, sanitizedWavFilename)
                    );
                    writeStream.write(header);
                    for await (const chunk of readStream) {
                        writeStream.write(chunk);
                    }
                    writeStream.end();

                    // Upload WAV to Supabase Storage
                    const wavFilePath = path.resolve(LOCAL_TEMP_DIR, sanitizedWavFilename);
                    const wavBuffer = fs.readFileSync(wavFilePath);
                    const publicUrl = await uploadRecording(callMetaData.callId, wavBuffer);
                    
                    // Update meeting record with recording info
                    const recordingDuration = Math.floor(
                        socketData.recordingFileSize / (callMetaData.samplingRate * 2)
                    );
                    await updateMeetingRecording(
                        callMetaData.callId,
                        publicUrl,
                        socketData.recordingFileSize,
                        recordingDuration
                    );

                    server.log.info(
                        `[RECORDING]: [${callMetaData.callId}] - Uploaded to Supabase Storage: ${publicUrl}`
                    );

                    // Cleanup temp files
                    await deleteTempFile(
                        callMetaData,
                        path.resolve(LOCAL_TEMP_DIR, sanitizedTempFilename)
                    );
                    await deleteTempFile(
                        callMetaData,
                        path.resolve(LOCAL_TEMP_DIR, sanitizedWavFilename)
                    );
                } else {
                    server.log.debug(
                        `[${callMetaData.callEvent}]: [${
                            callMetaData.callId
                        }] - Audio Recording disabled. Add s3 url event is not written to KDS. : ${JSON.stringify(
                            callMetaData
                        )}`
                    );
                }
            }

            // Close Soniox WebSocket connection
            if (socketData.sonioxWs) {
                server.log.debug(
                    `[${callMetaData.callEvent}]: [${callMetaData.callId}] - Closing Soniox WebSocket connection`
                );
                socketData.sonioxWs.close();
            }

            if (socketData.audioInputStream) {
                server.log.debug(
                    `[${callMetaData.callEvent}]: [${
                        callMetaData.callId
                    }] - Closing audio input stream:  ${JSON.stringify(callMetaData)}`
                );
                socketData.audioInputStream.end();
                socketData.audioInputStream.destroy();
            }
            if (socketData) {
                server.log.debug(
                    `[${callMetaData.callEvent}]: [${
                        callMetaData.callId
                    }] - Deleting websocket from map: ${JSON.stringify(callMetaData)}`
                );
                
                // Pipeline Debug: Close and finalize debug log
                closePipelineLogger(callMetaData.callId);
                server.log.info(
                    `[PIPELINE DEBUG]: [${callMetaData.callId}] - Pipeline debug logger closed and finalized`
                );
                
                socketMap.delete(ws);
            }
        } else {
            server.log.error('[END]: Missing Call Meta Data in END event');
        }
    } else {
        if (callMetaData !== undefined && callMetaData != null) {
            server.log.error(
                `[${callMetaData.callEvent}]: [${
                    callMetaData.callId
                }] - Duplicate End call event. Already received the end call event: ${JSON.stringify(
                    callMetaData
                )}`
            );
        } else {
            server.log.error(
                '[END]: Duplicate End call event. Missing Call Meta Data in END event'
            );
        }
    }
};

// writeToS3 function removed - now using Supabase Storage (see uploadRecording in supabase-client.ts)

const getTempRecordingFileName = (callMetaData: CallMetaData): string => {
    return `${posixifyFilename(callMetaData.callId)}.raw`;
};

const getWavRecordingFileName = (callMetaData: CallMetaData): string => {
    return `${posixifyFilename(callMetaData.callId)}.wav`;
};

const deleteTempFile = async (
    callMetaData: CallMetaData,
    sourceFile: string
) => {
    // Ensure we're not deleting files outside of our designated directory
    if (!sourceFile.startsWith(LOCAL_TEMP_DIR)) {
        server.log.error(
            `[${callMetaData.callEvent}]: [${callMetaData.callId}] - Attempted to delete file outside of temp directory: ${sourceFile}`
        );
        return;
    }
    try {
        await fs.promises.unlink(sourceFile);
        server.log.debug(
            `[${callMetaData.callEvent}]: [${callMetaData.callId}] - Deleted tmp file ${sourceFile}`
        );
    } catch (err) {
        server.log.error(
            `[${callMetaData.callEvent}]: [${
                callMetaData.callId
            }] - Error deleting tmp file ${sourceFile} : ${normalizeErrorForLogging(
                err
            )}`
        );
    }
};

// Start the websocket server on default port 3000 if no port supplied in environment variables
server.listen(
    {
        port: parseInt(process.env?.['SERVERPORT'] ?? '8080'),
        host: process.env?.['SERVERHOST'] ?? '127.0.0.1',
    },
    (err: Error | null) => {
        if (err) {
            server.log.error(
                `[WS SERVER STARTUP]: Error starting websocket server: ${normalizeErrorForLogging(
                    err
                )}`
            );
            process.exit(1);
        }
        server.log.debug(
            '[WS SERVER STARTUP]: Websocket server is ready and listening.'
        );
        server.log.info(`[[WS SERVER STARTUP]]: Routes: \n${server.printRoutes()}`);
    }
);
