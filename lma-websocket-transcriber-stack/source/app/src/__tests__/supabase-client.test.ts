/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('Supabase Client', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      storage: {
        from: vi.fn().mockReturnThis(),
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://storage.example.com/file.wav' },
        }),
      },
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
  });

  describe('insertTranscriptEvent', () => {
    it('should insert transcript event successfully', async () => {
      const { insertTranscriptEvent } = await import('../supabase-client');

      const data = {
        meeting_id: 'test-meeting-123',
        transcript: 'Hello world',
        start_time: 100,
        end_time: 500,
        is_final: true,
      };

      await insertTranscriptEvent(data);

      expect(mockSupabase.from).toHaveBeenCalledWith('transcript_events');
      expect(mockSupabase.insert).toHaveBeenCalledWith(data);
    });

    it('should ignore duplicate errors (code 23505)', async () => {
      const { insertTranscriptEvent } = await import('../supabase-client');

      mockSupabase.insert.mockResolvedValue({
        error: { code: '23505', message: 'duplicate key' },
      });

      const data = {
        meeting_id: 'test-meeting-123',
        transcript: 'Hello world',
        start_time: 100,
        end_time: 500,
        is_final: true,
      };

      // Should not throw
      await expect(insertTranscriptEvent(data)).resolves.not.toThrow();
    });

    it('should throw on non-duplicate errors', async () => {
      const { insertTranscriptEvent } = await import('../supabase-client');

      mockSupabase.insert.mockResolvedValue({
        error: { code: 'OTHER_ERROR', message: 'some error' },
      });

      const data = {
        meeting_id: 'test-meeting-123',
        transcript: 'Hello world',
        start_time: 100,
        end_time: 500,
        is_final: true,
      };

      await expect(insertTranscriptEvent(data)).rejects.toThrow();
    });
  });

  describe('upsertMeeting', () => {
    it('should upsert meeting successfully', async () => {
      const { upsertMeeting } = await import('../supabase-client');

      const data = {
        meeting_id: 'test-meeting-123',
        agent_id: 'agent-456',
        status: 'started',
      };

      await upsertMeeting(data);

      expect(mockSupabase.from).toHaveBeenCalledWith('meetings');
      expect(mockSupabase.upsert).toHaveBeenCalledWith(data, {
        onConflict: 'meeting_id',
      });
    });

    it('should throw on error', async () => {
      const { upsertMeeting } = await import('../supabase-client');

      mockSupabase.upsert.mockResolvedValue({
        error: { message: 'upsert failed' },
      });

      const data = {
        meeting_id: 'test-meeting-123',
        agent_id: 'agent-456',
      };

      await expect(upsertMeeting(data)).rejects.toThrow();
    });
  });

  describe('uploadRecording', () => {
    it('should upload recording and return public URL', async () => {
      const { uploadRecording } = await import('../supabase-client');

      const meetingId = 'test-meeting-123';
      const buffer = Buffer.from('audio data');

      const publicUrl = await uploadRecording(meetingId, buffer);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith(
        'meeting-recordings'
      );
      expect(mockSupabase.storage.upload).toHaveBeenCalledWith(
        `${meetingId}.wav`,
        buffer,
        {
          contentType: 'audio/wav',
          upsert: false,
        }
      );
      expect(publicUrl).toBe('https://storage.example.com/file.wav');
    });

    it('should throw on upload error', async () => {
      const { uploadRecording } = await import('../supabase-client');

      mockSupabase.storage.upload.mockResolvedValue({
        error: { message: 'upload failed' },
      });

      const meetingId = 'test-meeting-123';
      const buffer = Buffer.from('audio data');

      await expect(uploadRecording(meetingId, buffer)).rejects.toThrow();
    });
  });

  describe('getSpeakerName', () => {
    it('should return speaker name if found', async () => {
      const { getSpeakerName } = await import('../supabase-client');

      mockSupabase.single.mockResolvedValue({
        data: { speaker_name: 'John Doe' },
        error: null,
      });

      const name = await getSpeakerName('test-meeting-123', '1');

      expect(name).toBe('John Doe');
      expect(mockSupabase.from).toHaveBeenCalledWith('speaker_identity');
      expect(mockSupabase.eq).toHaveBeenCalledWith('meeting_id', 'test-meeting-123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('speaker_number', '1');
    });

    it('should return null if not found', async () => {
      const { getSpeakerName } = await import('../supabase-client');

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const name = await getSpeakerName('test-meeting-123', '1');

      expect(name).toBeNull();
    });
  });
});

