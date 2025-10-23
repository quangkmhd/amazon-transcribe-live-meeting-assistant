import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch unprocessed events
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

    // Process each event
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

    // Insert to final transcripts table
    const { error: insertError } = await supabase
        .from('transcripts')
        .insert(processedEvents);

    // Mark as processed
    if (!insertError || insertError.code === '23505') {
        // Ignore duplicates
        await supabase
            .from('transcript_events')
            .update({ processed: true })
            .in(
                'id',
                events.map((e) => e.id)
            );
    }

    return new Response(
        JSON.stringify({ processed: events.length }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
});

