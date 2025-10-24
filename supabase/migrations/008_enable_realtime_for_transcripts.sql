-- Enable Realtime for transcripts table
-- This is REQUIRED for Supabase Realtime to broadcast INSERT/UPDATE/DELETE events

-- Enable replica identity (required for Realtime)
ALTER TABLE public.transcripts REPLICA IDENTITY FULL;

-- Add table to realtime publication (if not already added)
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcripts;

-- Verify: Check if table is in publication
-- SELECT * FROM pg_publication_tables WHERE tablename = 'transcripts';

-- Grant necessary permissions
GRANT SELECT ON public.transcripts TO anon, authenticated;

-- Comment
COMMENT ON TABLE public.transcripts IS 'Final transcripts table with Realtime enabled for Stage 6 pipeline';
