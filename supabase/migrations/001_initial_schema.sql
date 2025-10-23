CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id TEXT UNIQUE NOT NULL,
  title TEXT,
  agent_id TEXT,
  status TEXT DEFAULT 'started',
  recording_url TEXT,
  recording_size BIGINT,
  recording_duration INTEGER,
  summary_text TEXT,
  categories JSONB,
  issues_detected TEXT,
  sentiment_stats JSONB,
  duration_ms INTEGER,
  owner_email TEXT,
  shared_with TEXT[],
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_meetings_meeting_id ON meetings(meeting_id);
CREATE INDEX idx_meetings_owner ON meetings(owner_email);
CREATE INDEX idx_meetings_started_at ON meetings(started_at);

CREATE TABLE transcript_events (
  id BIGSERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  is_final BOOLEAN DEFAULT true,
  processed BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, start_time, end_time)
);

CREATE INDEX idx_transcript_events_unprocessed ON transcript_events(processed) WHERE processed = false;
CREATE INDEX idx_transcript_events_meeting_time ON transcript_events(meeting_id, start_time);

CREATE TABLE transcripts (
  id BIGSERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  segment_id TEXT,
  transcript TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  is_partial BOOLEAN DEFAULT false,
  
  speaker_number TEXT,
  speaker_name TEXT,
  speaker_role TEXT,
  channel TEXT,
  
  speaker TEXT,
  sentiment TEXT,
  sentiment_score JSONB,
  sentiment_weighted FLOAT,
  owner_email TEXT,
  shared_with TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(meeting_id, start_time, end_time)
);

CREATE INDEX idx_transcripts_meeting ON transcripts(meeting_id, created_at);
CREATE INDEX idx_transcripts_owner ON transcripts(owner_email);

CREATE TABLE speaker_identity (
  id BIGSERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  speaker_number TEXT NOT NULL,
  speaker_name TEXT,
  speaker_email TEXT,
  identified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, speaker_number)
);

CREATE INDEX idx_speaker_identity_meeting ON speaker_identity(meeting_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meeting-recordings',
  'meeting-recordings',
  true,
  104857600,
  ARRAY['audio/wav', 'audio/mpeg', 'audio/raw']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'meeting-recordings');

CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'meeting-recordings');

CREATE POLICY "Allow delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'meeting-recordings');

ALTER TABLE transcript_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_identity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for all users"
ON transcript_events FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for all users"
ON transcript_events FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Enable read for all users"
ON transcripts FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for all users"
ON transcripts FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Enable read for all users"
ON meetings FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for all users"
ON meetings FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Enable update for all users"
ON meetings FOR UPDATE
TO public
USING (true);

CREATE POLICY "Enable read for all users"
ON speaker_identity FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for all users"
ON speaker_identity FOR INSERT
TO public
WITH CHECK (true);
