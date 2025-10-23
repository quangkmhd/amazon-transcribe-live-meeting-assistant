-- Migration: Add UPDATE policy for transcript_events table
-- Issue: Edge function cannot mark events as processed=true due to missing UPDATE policy
-- This causes pipeline stages 4-6 to never execute

CREATE POLICY "Enable update for all users"
ON transcript_events FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Grant UPDATE permission explicitly for service role
GRANT UPDATE ON transcript_events TO service_role;

COMMENT ON POLICY "Enable update for all users" ON transcript_events IS 
  'Allows edge function to mark transcript events as processed after moving to final transcripts table';
