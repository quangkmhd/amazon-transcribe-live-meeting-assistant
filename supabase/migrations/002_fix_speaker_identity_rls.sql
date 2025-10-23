-- Add UPDATE policy for speaker_identity table (required for upsert operations)
CREATE POLICY "Enable update for all users"
ON speaker_identity FOR UPDATE
TO public
USING (true)
WITH CHECK (true);
