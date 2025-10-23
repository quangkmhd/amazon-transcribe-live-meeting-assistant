-- Migration: Fix Multi-Tenancy with Proper RLS Policies
-- This ensures each user can only access their own data

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Enable read for all users" ON meetings;
DROP POLICY IF EXISTS "Enable insert for all users" ON meetings;
DROP POLICY IF EXISTS "Enable update for all users" ON meetings;

DROP POLICY IF EXISTS "Enable read for all users" ON transcripts;
DROP POLICY IF EXISTS "Enable insert for all users" ON transcripts;

DROP POLICY IF EXISTS "Enable read for all users" ON transcript_events;
DROP POLICY IF EXISTS "Enable insert for all users" ON transcript_events;

DROP POLICY IF EXISTS "Enable read for all users" ON speaker_identity;
DROP POLICY IF EXISTS "Enable insert for all users" ON speaker_identity;
DROP POLICY IF EXISTS "Enable update for all users" ON speaker_identity;

-- ===== MEETINGS TABLE =====
-- Users can only see meetings they own or that are shared with them
CREATE POLICY "Users can view own meetings"
ON meetings FOR SELECT
TO authenticated
USING (
  owner_email = auth.jwt()->>'email'
  OR auth.jwt()->>'email' = ANY(shared_with)
);

-- Users can only insert meetings with themselves as owner
CREATE POLICY "Users can create own meetings"
ON meetings FOR INSERT
TO authenticated
WITH CHECK (owner_email = auth.jwt()->>'email');

-- Users can only update meetings they own
CREATE POLICY "Users can update own meetings"
ON meetings FOR UPDATE
TO authenticated
USING (owner_email = auth.jwt()->>'email')
WITH CHECK (owner_email = auth.jwt()->>'email');

-- Users can only delete meetings they own
CREATE POLICY "Users can delete own meetings"
ON meetings FOR DELETE
TO authenticated
USING (owner_email = auth.jwt()->>'email');

-- ===== TRANSCRIPTS TABLE =====
-- Users can only see transcripts from meetings they own or that are shared with them
CREATE POLICY "Users can view own transcripts"
ON transcripts FOR SELECT
TO authenticated
USING (
  owner_email = auth.jwt()->>'email'
  OR auth.jwt()->>'email' = ANY(shared_with)
  OR meeting_id IN (
    SELECT meeting_id FROM meetings 
    WHERE owner_email = auth.jwt()->>'email'
    OR auth.jwt()->>'email' = ANY(shared_with)
  )
);

-- Users can insert transcripts (will be set automatically by system)
CREATE POLICY "Users can create transcripts"
ON transcripts FOR INSERT
TO authenticated
WITH CHECK (true);

-- ===== TRANSCRIPT_EVENTS TABLE =====
-- Users can only see transcript events from meetings they own
CREATE POLICY "Users can view own transcript events"
ON transcript_events FOR SELECT
TO authenticated
USING (
  meeting_id IN (
    SELECT meeting_id FROM meetings 
    WHERE owner_email = auth.jwt()->>'email'
    OR auth.jwt()->>'email' = ANY(shared_with)
  )
);

-- Users can insert transcript events (system operation)
CREATE POLICY "Users can create transcript events"
ON transcript_events FOR INSERT
TO authenticated
WITH CHECK (true);

-- ===== SPEAKER_IDENTITY TABLE =====
-- Users can only see speaker identities from meetings they own
CREATE POLICY "Users can view own speaker identities"
ON speaker_identity FOR SELECT
TO authenticated
USING (
  meeting_id IN (
    SELECT meeting_id FROM meetings 
    WHERE owner_email = auth.jwt()->>'email'
    OR auth.jwt()->>'email' = ANY(shared_with)
  )
);

-- Users can insert/update speaker identities for their meetings
CREATE POLICY "Users can create speaker identities"
ON speaker_identity FOR INSERT
TO authenticated
WITH CHECK (
  meeting_id IN (
    SELECT meeting_id FROM meetings 
    WHERE owner_email = auth.jwt()->>'email'
  )
);

CREATE POLICY "Users can update speaker identities"
ON speaker_identity FOR UPDATE
TO authenticated
USING (
  meeting_id IN (
    SELECT meeting_id FROM meetings 
    WHERE owner_email = auth.jwt()->>'email'
  )
)
WITH CHECK (
  meeting_id IN (
    SELECT meeting_id FROM meetings 
    WHERE owner_email = auth.jwt()->>'email'
  )
);

-- Add function to automatically set owner_email on insert
CREATE OR REPLACE FUNCTION set_owner_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_email IS NULL THEN
    NEW.owner_email := auth.jwt()->>'email';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add triggers to auto-set owner_email
DROP TRIGGER IF EXISTS set_meeting_owner ON meetings;
CREATE TRIGGER set_meeting_owner
  BEFORE INSERT ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION set_owner_email();

DROP TRIGGER IF EXISTS set_transcript_owner ON transcripts;
CREATE TRIGGER set_transcript_owner
  BEFORE INSERT ON transcripts
  FOR EACH ROW
  EXECUTE FUNCTION set_owner_email();
