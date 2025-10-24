import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPipelineLogger, PipelineStage } from './pipeline-debug-logger';

let supabaseClient: SupabaseClient | null = null;
let pollerInterval: NodeJS.Timeout | null = null;
let lastProcessedTimestamp = new Date();

const processedLogIds = new Set<string>();

export function startPipelineLogPoller() {
    if (pollerInterval) {
        console.log('[Pipeline Log Poller] Already running');
        return;
    }

    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseServiceKey = process.env['SUPABASE_SERVICE_KEY'];

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[Pipeline Log Poller] Missing Supabase credentials');
        return;
    }

    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Pipeline Log Poller] Starting...');
    
    pollerInterval = setInterval(async () => {
        try {
            await pollAndWriteLogs();
        } catch (error) {
            console.error('[Pipeline Log Poller] Error:', error);
        }
    }, 2000);
}

export function stopPipelineLogPoller() {
    if (pollerInterval) {
        clearInterval(pollerInterval);
        pollerInterval = null;
        console.log('[Pipeline Log Poller] Stopped');
    }
}

async function pollAndWriteLogs() {
    if (!supabaseClient) {
        return;
    }

    const { data: logs, error } = await supabaseClient
        .from('pipeline_logs')
        .select('*')
        .gte('timestamp', lastProcessedTimestamp.toISOString())
        .order('timestamp', { ascending: true })
        .limit(100);

    if (error) {
        console.error('[Pipeline Log Poller] Query error:', error);
        return;
    }

    if (!logs || logs.length === 0) {
        return;
    }

    console.log(`[Pipeline Log Poller] Found ${logs.length} new logs`);

    for (const log of logs) {
        if (processedLogIds.has(log.id)) {
            continue;
        }

        console.log(`[Pipeline Log Poller] Processing log: stage=${log.stage}, callId=${log.call_id}`);
        const logger = getPipelineLogger(log.call_id);
        
        switch (log.stage) {
            case '4️⃣ EDGE_POLL_START':
                logger.logEdgePollStart(log.call_id, log.metadata);
                break;
            case '4️⃣ EDGE_PROCESSING':
                logger.logEdgeProcessing(log.call_id, log.metadata?.eventCount || 0);
                break;
            case '4️⃣ EDGE_COMPLETE':
                logger.logEdgeComplete(
                    log.call_id,
                    log.metadata?.processedCount || 0,
                    log.duration || 0
                );
                break;
            case '4️⃣ EDGE_ERROR':
                logger.logEdgeError(log.call_id, log.error || 'Unknown error');
                break;
            case '5️⃣ REALTIME_BROADCAST':
                logger.logRealtimeBroadcast(log.call_id, log.metadata);
                break;
            case '6️⃣ UI_RECEIVED':
                console.log('[Pipeline Log Poller] ✅ Stage 6 UI_RECEIVED detected!');
                logger.logUIReceived(
                    log.call_id,
                    log.transcript || '',
                    log.speaker || 'Unknown',
                    log.metadata
                );
                break;
            default:
                console.warn(`[Pipeline Log Poller] ⚠️  Unknown stage: ${log.stage}`);
                break;
        }

        processedLogIds.add(log.id);
        lastProcessedTimestamp = new Date(log.timestamp);
    }

    if (processedLogIds.size > 10000) {
        const idsArray = Array.from(processedLogIds);
        processedLogIds.clear();
        idsArray.slice(-1000).forEach(id => processedLogIds.add(id));
    }

    console.log(`[Pipeline Log Poller] ✅ Processed ${logs.length} logs successfully`);
}
