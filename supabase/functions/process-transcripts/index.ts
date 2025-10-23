import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENABLE_TRANSCRIPT_DEBUG = Deno.env.get('ENABLE_TRANSCRIPT_DEBUG') === 'true';
const DEBUG_LOG_DIR = Deno.env.get('DEBUG_LOG_DIR') || './debug-logs';

async function logTranscriptDebug(
    meetingId: string,
    stage: string,
    data: any
): Promise<void> {
    if (!ENABLE_TRANSCRIPT_DEBUG) return;

    try {
        await Deno.mkdir(DEBUG_LOG_DIR, { recursive: true }).catch(() => {});

        const logFile = `${DEBUG_LOG_DIR}/transcript-${meetingId}.txt`;
        const timestamp = new Date().toISOString();
        const logEntry = `\n${'='.repeat(80)}\n[${timestamp}] STAGE: ${stage}\n${'-'.repeat(80)}\n${JSON.stringify(data, null, 2)}\n`;

        await Deno.writeTextFile(logFile, logEntry, { append: true });
    } catch (error) {
        console.error(`Failed to write debug log: ${error}`);
    }
}

serve(async (req) => {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: events, error: fetchError } = await supabase
        .from('transcript_events')
        .select('*')
        .eq('processed', false)
        .limit(200);

    if (fetchError) {
        return new Response(JSON.stringify({ error: fetchError }), {
            status: 500,
        });
    }

    if (!events || events.length === 0) {
        return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    await logTranscriptDebug('ALL_MEETINGS', '6-FETCHED_TRANSCRIPT_EVENTS', {
        event_count: events.length,
        meeting_ids: [...new Set(events.map(e => e.meeting_id))],
        events_summary: events.map(e => ({
            meeting_id: e.meeting_id,
            speaker: e.speaker_number,
            transcript_preview: e.transcript?.substring(0, 50),
        })),
    });

    const processedEvents = events.map((event) => ({
        meeting_id: event.meeting_id,
        segment_id: `${event.speaker_number || 'unknown'}-${event.start_time}`,
        transcript: event.transcript,
        speaker_number: event.speaker_number,
        speaker_name: event.speaker_name,
        channel: event.channel,
        start_time: event.start_time,
        end_time: event.end_time,
        is_partial: false,
    }));

    for (const event of processedEvents) {
        await logTranscriptDebug(event.meeting_id, '7-BEFORE_INSERT_TRANSCRIPTS', {
            segment_id: event.segment_id,
            transcript: event.transcript,
            speaker_number: event.speaker_number,
            speaker_name: event.speaker_name,
        });
    }

    const { error: insertError } = await supabase
        .from('transcripts')
        .insert(processedEvents);

    if (insertError) {
        await logTranscriptDebug('ALL_MEETINGS', '8-INSERT_TRANSCRIPTS_ERROR', {
            error_code: insertError.code,
            error_message: insertError.message,
            error_details: insertError.details,
            error_hint: insertError.hint,
        });
    } else {
        await logTranscriptDebug('ALL_MEETINGS', '8-INSERT_TRANSCRIPTS_SUCCESS', {
            inserted_count: processedEvents.length,
            inserted_at: new Date().toISOString(),
        });
    }

    if (!insertError || insertError.code === '23505') {
        await supabase
            .from('transcript_events')
            .update({ processed: true })
            .in(
                'id',
                events.map((e) => e.id)
            );

        await logTranscriptDebug('ALL_MEETINGS', '9-MARKED_AS_PROCESSED', {
            marked_count: events.length,
        });
    }

    return new Response(
        JSON.stringify({ processed: events.length }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
});

