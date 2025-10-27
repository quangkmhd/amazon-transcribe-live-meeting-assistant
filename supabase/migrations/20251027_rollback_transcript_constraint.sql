-- Rollback transcript unique constraint to fix duplicate deletion issue
-- Problem: UNIQUE(meeting_id, start_time, speaker_number) causes updates to overwrite existing records
-- Solution: Add end_time back to constraint to allow multiple tokens at same start_time

-- Step 1: Drop the problematic constraint from migration 010
ALTER TABLE transcript_events DROP CONSTRAINT IF EXISTS transcript_events_unique_segment;
ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_unique_segment;

-- Step 2: Add back original constraint with end_time (allows multiple tokens at same start_time)
ALTER TABLE transcript_events ADD CONSTRAINT transcript_events_unique_segment 
  UNIQUE(meeting_id, start_time, end_time, speaker_number);

ALTER TABLE transcripts ADD CONSTRAINT transcripts_unique_segment 
  UNIQUE(meeting_id, start_time, end_time, speaker_number);

-- Step 3: Drop translation columns from migration 20251026153832 (if you discarded that code)
ALTER TABLE transcript_events DROP COLUMN IF EXISTS translated_text;
ALTER TABLE transcript_events DROP COLUMN IF EXISTS target_language;
DROP INDEX IF EXISTS idx_transcript_events_translation;

-- Step 4: Update indexes for better performance
DROP INDEX IF EXISTS idx_transcript_events_speaker;
DROP INDEX IF EXISTS idx_transcripts_speaker;

CREATE INDEX IF NOT EXISTS idx_transcript_events_speaker 
  ON transcript_events(meeting_id, speaker_number, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_transcripts_speaker 
  ON transcripts(meeting_id, speaker_number, start_time, end_time);

-- Log the rollback
COMMENT ON TABLE transcript_events IS 'Rollback applied 2025-10-27: Fixed UNIQUE constraint to prevent token deletion';
