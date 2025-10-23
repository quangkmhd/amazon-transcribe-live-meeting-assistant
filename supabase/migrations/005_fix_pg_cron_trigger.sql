-- ============================================
-- Fix pg_cron to properly trigger Edge Function
-- ============================================

-- First, unschedule old job if exists
SELECT cron.unschedule('process-transcripts-job') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-transcripts-job'
);

-- ============================================
-- OPTION 1: Use pg_net with environment variables
-- ============================================
-- For Supabase Cloud, the SUPABASE_URL is auto-configured
-- Format: https://PROJECT_ID.supabase.co

-- You need to set this ONCE in your Supabase project:
-- Go to Settings > Database > Custom Postgres configuration
-- Add: ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_ID.supabase.co';
-- Add: ALTER DATABASE postgres SET app.supabase_service_key = 'YOUR_SERVICE_ROLE_KEY';

-- Then enable this cron job:
DO $$
BEGIN
  IF current_setting('app.supabase_url', true) IS NOT NULL THEN
    PERFORM cron.schedule(
      'process-transcripts-job',
      '*/5 * * * * *',
      $$
        SELECT net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/process-transcripts',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_key')
          ),
          body := '{}'::jsonb
        );
      $$
    );
    RAISE NOTICE 'pg_cron job scheduled successfully';
  ELSE
    RAISE WARNING 'app.supabase_url not set. Please configure custom Postgres settings.';
  END IF;
END $$;

-- ============================================
-- OPTION 2: Direct function invocation (simpler for local dev)
-- ============================================
-- This requires calling the edge function via HTTP from your backend
-- Add this to your backend startup code instead of using pg_cron

-- ============================================
-- Manual trigger for testing
-- ============================================
-- SELECT net.http_post(
--   url := 'http://localhost:54321/functions/v1/process-transcripts',
--   headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
-- );
