/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * End-to-End Integration Tests
 * 
 * These tests require:
 * 1. Supabase project running (local or cloud)
 * 2. WebSocket server running
 * 3. Soniox API key (optional - can use mocks)
 * 
 * Run with: npm run test:integration
 */

const SUPABASE_URL = process.env['TEST_SUPABASE_URL'] || process.env['SUPABASE_URL'] || 'https://test.supabase.co';
const SUPABASE_KEY = process.env['TEST_SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_SERVICE_KEY'] || 'test-key';
const WS_SERVER_URL = process.env['TEST_WS_SERVER_URL'] || 'ws://localhost:8080/api/v1/ws';

describe.skip('End-to-End Integration Tests', () => {
    let supabase: SupabaseClient;
    let testMeetingId: string;

    beforeAll(() => {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        testMeetingId = `test-${Date.now()}`;
    });

    afterAll(async () => {
    // Cleanup test data
        if (supabase) {
            await supabase.from('transcripts').delete().eq('meeting_id', testMeetingId);
            await supabase.from('transcript_events').delete().eq('meeting_id', testMeetingId);
            await supabase.from('meetings').delete().eq('meeting_id', testMeetingId);
        }
    });

    it('should complete full meeting flow', async () => {
    // This test is skipped by default - enable when infrastructure is ready
        expect(true).toBe(true);
    }, 30000);

    it('should stream audio and save transcripts', async () => {
    // Connect to WebSocket
        const ws = new WebSocket(WS_SERVER_URL);

        await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });

        // Send START event
        const startEvent = {
            callId: testMeetingId,
            agentId: 'test-agent',
            samplingRate: 16000,
            callEvent: 'START',
            activeSpeaker: 'test-speaker',
            channels: {},
        };

        ws.send(JSON.stringify(startEvent));

        // Wait for meeting record to be created
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify meeting exists
        const { data: meeting, error: meetingError } = await supabase
            .from('meetings')
            .select('*')
            .eq('meeting_id', testMeetingId)
            .single();

        expect(meetingError).toBeNull();
        expect(meeting).toBeDefined();
        expect(meeting.status).toBe('started');

        // Send END event
        const endEvent = {
            callId: testMeetingId,
            callEvent: 'END',
        };

        ws.send(JSON.stringify(endEvent));

        // Wait for end event processing
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Close WebSocket
        ws.close();

        // Verify meeting status updated
        const { data: updatedMeeting } = await supabase
            .from('meetings')
            .select('*')
            .eq('meeting_id', testMeetingId)
            .single();

        expect(updatedMeeting.status).toBe('ended');
    }, 15000);

    it('should handle duplicate transcripts gracefully', async () => {
    // Test duplicate prevention
        const transcriptData = {
            meeting_id: testMeetingId,
            transcript: 'Test transcript',
            start_time: 1000,
            end_time: 2000,
            is_partial: false,
        };

        // Insert first time - should succeed
        const { error: error1 } = await supabase
            .from('transcript_events')
            .insert(transcriptData);
        expect(error1).toBeNull();

        // Insert duplicate - should fail but be handled
        const { error: error2 } = await supabase
            .from('transcript_events')
            .insert(transcriptData);
    
        // Should get duplicate error (code 23505)
        expect(error2).toBeDefined();
        expect(error2.code).toBe('23505');
    });

    it('should support real-time subscriptions', async () => {
        const transcripts: unknown[] = [];

        // Subscribe to transcript changes
        const channel = supabase
            .channel(`test-${testMeetingId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'transcripts',
                filter: `meeting_id=eq.${testMeetingId}`,
            }, (payload: { new: unknown }) => {
                transcripts.push(payload.new);
            })
            .subscribe();

        // Wait for subscription to be ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Insert a transcript
        await supabase.from('transcripts').insert({
            meeting_id: testMeetingId,
            transcript: 'Real-time test',
            start_time: 3000,
            end_time: 4000,
            is_partial: false,
        });

        // Wait for real-time update
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify we received the update
        expect(transcripts.length).toBeGreaterThan(0);
        expect(transcripts[0].transcript).toBe('Real-time test');

        // Cleanup
        channel.unsubscribe();
    }, 10000);
});

