/**
 * Pipeline Log HTTP Endpoint
 * Cho phép Edge Function và UI client gửi logs về backend
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPipelineLogger, PipelineStage } from '../utils/pipeline-debug-logger';

interface LogRequest {
    callId: string;
    stage: '4️⃣ EDGE_POLL_START' | '4️⃣ EDGE_PROCESSING' | '4️⃣ EDGE_COMPLETE' | '4️⃣ EDGE_ERROR' | '5️⃣ REALTIME_BROADCAST' | '6️⃣ UI_RECEIVED';
    metadata?: Record<string, any>;
    speaker?: string;
    transcript?: string;
    duration?: number;
    error?: string;
}

export async function registerPipelineLogRoutes(fastify: FastifyInstance) {
    // POST /api/v1/pipeline-log
    fastify.post<{ Body: LogRequest }>(
        '/api/v1/pipeline-log',
        async (request: FastifyRequest<{ Body: LogRequest }>, reply: FastifyReply) => {
            const { callId, stage, metadata, speaker, transcript, duration, error } = request.body;

            try {
                const logger = getPipelineLogger(callId);

                switch (stage) {
                    case '4️⃣ EDGE_POLL_START':
                        logger.logEdgePollStart(callId, metadata);
                        break;
                    case '4️⃣ EDGE_PROCESSING':
                        logger.logEdgeProcessing(callId, metadata?.['eventCount'] || 0);
                        break;
                    case '4️⃣ EDGE_COMPLETE':
                        logger.logEdgeComplete(callId, metadata?.['processedCount'] || 0, duration || 0);
                        break;
                    case '4️⃣ EDGE_ERROR':
                        logger.logEdgeError(callId, error || 'Unknown error');
                        break;
                    case '5️⃣ REALTIME_BROADCAST':
                        logger.logRealtimeBroadcast(callId, metadata);
                        break;
                    case '6️⃣ UI_RECEIVED':
                        logger.logUIReceived(callId, transcript || '', speaker || 'Unknown', metadata);
                        break;
                }

                return { success: true };
            } catch (err) {
                fastify.log.error('Pipeline log error:', err);
                return reply.code(500).send({ error: 'Failed to log' });
            }
        }
    );

    // GET /api/v1/pipeline-log/:callId - Retrieve log file
    fastify.get<{ Params: { callId: string } }>(
        '/api/v1/pipeline-log/:callId',
        async (request: FastifyRequest<{ Params: { callId: string } }>, reply: FastifyReply) => {
            const { callId } = request.params;
            
            try {
                const logger = getPipelineLogger(callId);
                const logContent = logger.getLogContent();
                
                return reply
                    .type('text/plain')
                    .send(logContent);
            } catch (err) {
                return reply.code(404).send({ error: 'Log file not found' });
            }
        }
    );
}
