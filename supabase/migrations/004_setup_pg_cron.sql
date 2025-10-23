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

SELECT cron.schedule(
  'process-transcripts-job',
  '*/5 * * * * *',  -- Every 5 seconds
  $$
    SELECT
      net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/process-transcripts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_key')
        ),
        body := '{}'::jsonb
      ) as request_id;
  $$
);

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
