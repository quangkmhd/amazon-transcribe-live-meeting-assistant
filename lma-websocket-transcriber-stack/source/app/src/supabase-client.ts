/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPipelineLogger } from './utils/pipeline-debug-logger';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SERVICE_KEY']!;

export const supabase: SupabaseClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY
);

// Insert transcript event (staging buffer)
export async function insertTranscriptEvent(data: {
    meeting_id: string;
    transcript: string;
    speaker_number: string; // ✅ Required for unique constraint
    speaker_name?: string;
    channel?: string;
    start_time: number;
    end_time: number;
    is_final: boolean;
}) {
    const startTime = Date.now();
    const logger = getPipelineLogger(data.meeting_id);
    
    // Log DB insert start
    logger.logDBInsertStart(data.meeting_id, {
        speaker: data.speaker_name || data.speaker_number,
        segment_id: `${data.speaker_number}-${data.start_time}`,
        transcript_length: data.transcript.length
    });
    
    // ✅ Upsert to handle updates when endTime changes (partial → final)
    const { error } = await supabase
        .from('transcript_events')
        .upsert(data, {
            onConflict: 'meeting_id,start_time,speaker_number',
            ignoreDuplicates: false, // Update if exists
        });
    
    const duration = Date.now() - startTime;

    if (error) {
        // Log DB insert error
        logger.logDBInsertError(data.meeting_id, error.message, duration);
        console.error(`❌ [DB INSERT ERROR]:`, error);
        throw new Error(error.message);
    }
    
    // Log DB insert success
    logger.logDBInsertSuccess(data.meeting_id, duration);
}

// Upsert meeting record
export async function upsertMeeting(data: {
    meeting_id: string;
    agent_id?: string;
    status?: string;
    title?: string;
    owner_email?: string;
}) {
    const { error } = await supabase.from('meetings').upsert(data, {
        onConflict: 'meeting_id',
    });
    if (error) throw new Error(error.message);
}

// Calculate meeting duration from transcript segments
export async function calculateMeetingDuration(meeting_id: string): Promise<number> {
    const { data, error } = await supabase
        .from('transcript_events')
        .select('start_time, end_time')
        .eq('meeting_id', meeting_id)
        .order('start_time', { ascending: true });

    if (error || !data || data.length === 0) {
        return 0;
    }

    // Get first start_time and last end_time
    const firstSegment = data[0];
    const lastSegment = data[data.length - 1];
    
    const durationMs = lastSegment.end_time - firstSegment.start_time;
    return Math.max(0, durationMs); // Ensure non-negative
}

// Update meeting with duration when ending
export async function updateMeetingEnd(meeting_id: string) {
    // Calculate duration from transcript segments
    const durationMs = await calculateMeetingDuration(meeting_id);
    
    const { error } = await supabase
        .from('meetings')
        .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            duration_ms: durationMs,
        })
        .eq('meeting_id', meeting_id);
    
    if (error) throw error;
    
    console.log(`✅ [MEETING] ${meeting_id} ended - Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(1)}s)`);
}

// Update meeting recording info
export async function updateMeetingRecording(
    meeting_id: string,
    recording_url: string,
    recording_size: number,
    recording_duration: number
) {
    const { error } = await supabase
        .from('meetings')
        .update({
            recording_url,
            recording_size,
            recording_duration,
            status: 'ended',
            ended_at: new Date().toISOString(),
        })
        .eq('meeting_id', meeting_id);
    if (error) throw error;
}

// Upload recording to Supabase Storage
export async function uploadRecording(
    meeting_id: string,
    fileBuffer: Buffer
): Promise<string> {
    const filePath = `${meeting_id}.wav`;

    const { error: uploadError } = await supabase.storage
        .from('meeting-recordings')
        .upload(filePath, fileBuffer, {
            contentType: 'audio/wav',
            upsert: false,
        });

    if (uploadError) throw new Error(uploadError.message);

    const {
        data: { publicUrl },
    } = supabase.storage.from('meeting-recordings').getPublicUrl(filePath);

    return publicUrl;
}

// Get speaker identity
export async function getSpeakerName(
    meeting_id: string,
    speaker_number: string
): Promise<string | null> {
    const { data } = await supabase
        .from('speaker_identity')
        .select('speaker_name')
        .eq('meeting_id', meeting_id)
        .eq('speaker_number', speaker_number)
        .single();

    return data?.speaker_name || null;
}

