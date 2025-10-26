/**
 * Edge Function Scheduler
 * Triggers process-transcripts edge function every 5 seconds
 * Alternative to pg_cron for local development
 */

// Note: Using console.log for now since fastify logger is not available here
// In production, you'd inject the logger instance

const EDGE_FUNCTION_URL = process.env['SUPABASE_EDGE_FUNCTION_URL'] || 'http://localhost:54321/functions/v1/process-transcripts';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] || '';
const INTERVAL_MS = 5000; // 5 seconds

let schedulerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Trigger the edge function via HTTP POST
 */
async function triggerEdgeFunction(): Promise<void> {
    if (isProcessing) {
        console.debug('[EDGE SCHEDULER] Still processing, skipping this interval');
        return;
    }

    isProcessing = true;
    const startTime = Date.now();

    try {
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({}),
        });

        const duration = Date.now() - startTime;
        const result = await response.json() as { processed?: number };

        if (response.ok) {
            if (result.processed && result.processed > 0) {
                console.log(`[EDGE] Processed ${result.processed} events (${duration}ms)`);
            }
            // Silent when 0 events to reduce console noise
        } else {
            console.error(`[EDGE] Error ${response.status}:`, result);
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[EDGE SCHEDULER] Error after ${duration}ms:`, error);
    } finally {
        isProcessing = false;
    }
}

/**
 * Start the scheduler
 */
export function startEdgeFunctionScheduler(): void {
    if (schedulerInterval) {
        console.warn('[EDGE SCHEDULER] Already running');
        return;
    }

    console.log(`[EDGE] Scheduler started (${INTERVAL_MS}ms interval)`);

    // Run immediately on start
    triggerEdgeFunction();

    // Then run every 5 seconds
    schedulerInterval = setInterval(() => {
        triggerEdgeFunction();
    }, INTERVAL_MS);
}

/**
 * Stop the scheduler
 */
export function stopEdgeFunctionScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[EDGE SCHEDULER] Stopped');
    }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): { running: boolean; processing: boolean; intervalMs: number } {
    return {
        running: schedulerInterval !== null,
        processing: isProcessing,
        intervalMs: INTERVAL_MS,
    };
}
