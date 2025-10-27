-- Add translation support columns to transcript_events table
-- This enables storing both original and translated transcripts from Soniox API
-- Note: 'language' and 'translation_status' columns already exist in table

-- Add missing columns only (translated_text and target_language)
ALTER TABLE transcript_events 
ADD COLUMN IF NOT EXISTS translated_text TEXT,
ADD COLUMN IF NOT EXISTS target_language VARCHAR(10);

-- Add index for fast translation queries
CREATE INDEX IF NOT EXISTS idx_transcript_events_translation 
ON transcript_events(meeting_id, translation_status) 
WHERE translation_status IS NOT NULL;

-- Update comments for all translation-related columns
COMMENT ON COLUMN transcript_events.translated_text IS 'Translated text from Soniox (only for translation_status="translation" records)';
COMMENT ON COLUMN transcript_events.target_language IS 'Target language selected by user (e.g., vi=Vietnamese, es=Spanish)';
COMMENT ON COLUMN transcript_events.translation_status IS 'Soniox translation flag: "translation"=translated record, NULL=original';
COMMENT ON COLUMN transcript_events.language IS 'Auto-detected source language from Soniox (e.g., en, vi, es)';

