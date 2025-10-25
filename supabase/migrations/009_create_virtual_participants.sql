-- Create virtual_participants table
CREATE TABLE IF NOT EXISTS virtual_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_name TEXT NOT NULL,
  meeting_platform TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  meeting_password TEXT,
  meeting_time BIGINT,
  scheduled_for TIMESTAMPTZ,
  is_scheduled BOOLEAN DEFAULT false,
  schedule_id TEXT,
  status TEXT DEFAULT 'INITIALIZING',
  call_id TEXT,
  owner_email TEXT,
  shared_with TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for virtual_participants
CREATE INDEX IF NOT EXISTS idx_virtual_participants_owner ON virtual_participants(owner_email);
CREATE INDEX IF NOT EXISTS idx_virtual_participants_status ON virtual_participants(status);
CREATE INDEX IF NOT EXISTS idx_virtual_participants_created_at ON virtual_participants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_virtual_participants_meeting_id ON virtual_participants(meeting_id);

-- Enable Row Level Security
ALTER TABLE virtual_participants ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for virtual_participants
CREATE POLICY "Enable read for authenticated users"
ON virtual_participants FOR SELECT
TO authenticated
USING (
  owner_email = auth.jwt() ->> 'email' OR 
  auth.jwt() ->> 'email' = ANY(shared_with)
);

CREATE POLICY "Enable insert for authenticated users"
ON virtual_participants FOR INSERT
TO authenticated
WITH CHECK (owner_email = auth.jwt() ->> 'email');

CREATE POLICY "Enable update for owner"
ON virtual_participants FOR UPDATE
TO authenticated
USING (owner_email = auth.jwt() ->> 'email');

CREATE POLICY "Enable delete for owner"
ON virtual_participants FOR DELETE
TO authenticated
USING (owner_email = auth.jwt() ->> 'email');

-- Enable realtime for virtual_participants
ALTER PUBLICATION supabase_realtime ADD TABLE virtual_participants;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_virtual_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_virtual_participants_updated_at
  BEFORE UPDATE ON virtual_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_virtual_participants_updated_at();

