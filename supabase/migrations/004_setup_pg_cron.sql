-- ============================================
-- Setup pg_cron to trigger Edge Function
-- ============================================
-- This runs process-transcripts Edge Function every 5 seconds
-- to move data from transcript_events → transcripts

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================
-- Schedule Edge Function trigger
-- ============================================
-- Run every 5 seconds: */5 * * * * *
-- Format: second minute hour day month weekday

-- Note: Supabase automatically provides these settings:
-- - SUPABASE_URL is available as environment variable
-- - Service role key should be set in dashboard
-- This will be triggered by Supabase's built-in scheduler

-- Alternative: Use Supabase's pg_net extension
SELECT cron.schedule(
  'process-transcripts-job',
  '*/5 * * * * *',  -- Every 5 seconds
  $$
    SELECT
      net.http_post(
        url := (SELECT current_setting('request.headers', true)::json->>'x-forwarded-host') || '/functions/v1/process-transcripts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'anon_key'
        ),
        body := '{}'::jsonb
      ) as request_id;
  $$
);

-- Backup: If above doesn't work, run edge function directly via HTTP
-- You'll need to set these via: ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
-- Or use direct invocation (recommended for local development)

-- ============================================
-- View scheduled jobs
-- ============================================
-- SELECT * FROM cron.job;

-- ============================================
-- Unschedule if needed
-- ============================================
-- SELECT cron.unschedule('process-transcripts-job');

-- ============================================
-- Manual run for testing
-- ============================================
-- SELECT cron.schedule('test-run', '* * * * *', $$SELECT 1$$);
-- SELECT cron.unschedule('test-run');
