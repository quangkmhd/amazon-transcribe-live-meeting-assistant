-- Fix unique constraint to prevent duplicate segments with same start_time
-- Old: UNIQUE(meeting_id, start_time, end_time) allows duplicates when endTime changes
-- New: UNIQUE(meeting_id, start_time, speaker_number) prevents duplicates correctly

-- Drop old constraints
ALTER TABLE transcript_events DROP CONSTRAINT IF EXISTS transcript_events_meeting_id_start_time_end_time_key;
ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_meeting_id_start_time_end_time_key;

-- Add correct constraints
ALTER TABLE transcript_events ADD CONSTRAINT transcript_events_unique_segment 
  UNIQUE(meeting_id, start_time, speaker_number);

ALTER TABLE transcripts ADD CONSTRAINT transcripts_unique_segment 
  UNIQUE(meeting_id, start_time, speaker_number);

-- Add speaker_number column to transcript_events if it doesn't exist
ALTER TABLE transcript_events ADD COLUMN IF NOT EXISTS speaker_number TEXT;
ALTER TABLE transcript_events ADD COLUMN IF NOT EXISTS speaker_name TEXT;
ALTER TABLE transcript_events ADD COLUMN IF NOT EXISTS channel TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_transcript_events_speaker ON transcript_events(meeting_id, speaker_number, start_time);
CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON transcripts(meeting_id, speaker_number, start_time);

