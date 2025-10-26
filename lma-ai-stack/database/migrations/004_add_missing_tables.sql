-- Migration: Add missing tables for Lambda function migration
-- Date: 2025-10-26
-- Purpose: Support AWS-free Lambda functions (meetings, summaries, templates)

-- ============================================================================
-- 1. MEETINGS TABLE (replaces DynamoDB call metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meetings (
    meeting_id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'STARTED', -- STARTED, TRANSCRIBING, ENDED
    
    -- Call metadata
    customer_phone_number TEXT,
    system_phone_number TEXT,
    agent_id TEXT,
    
    -- Timing
    total_conversation_duration_millis BIGINT DEFAULT 0,
    
    -- Sharing
    shared_with TEXT[], -- List of email addresses
    
    -- Recording
    recording_url TEXT,
    pca_url TEXT,
    
    -- Sentiment
    sentiment JSONB,
    
    -- Categories
    call_categories TEXT[],
    issues_detected TEXT,
    
    -- Summary
    call_summary_text TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- TTL
    expires_after BIGINT -- Unix timestamp for expiration
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_meetings_owner_email 
    ON public.meetings(owner_email);

CREATE INDEX IF NOT EXISTS idx_meetings_created_at 
    ON public.meetings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_status 
    ON public.meetings(status);

-- RLS policies
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own meetings and shared meetings"
    ON public.meetings FOR SELECT
    USING (
        owner_email = current_setting('request.jwt.claims', true)::json->>'email'
        OR current_setting('request.jwt.claims', true)::json->>'email' = ANY(shared_with)
    );

CREATE POLICY "Users can insert their own meetings"
    ON public.meetings FOR INSERT
    WITH CHECK (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can update their own meetings"
    ON public.meetings FOR UPDATE
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can delete their own meetings"
    ON public.meetings FOR DELETE
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ============================================================================
-- 2. MEETING_SUMMARIES TABLE (replaces S3 storage for summaries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meeting_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id TEXT UNIQUE NOT NULL REFERENCES public.meetings(meeting_id) ON DELETE CASCADE,
    owner_email TEXT NOT NULL,
    
    -- Summary content
    summary TEXT NOT NULL,
    transcript TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_meeting_id 
    ON public.meeting_summaries(meeting_id);

CREATE INDEX IF NOT EXISTS idx_meeting_summaries_owner_email 
    ON public.meeting_summaries(owner_email);

-- RLS policies
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own summaries"
    ON public.meeting_summaries FOR SELECT
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can insert their own summaries"
    ON public.meeting_summaries FOR INSERT
    WITH CHECK (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can update their own summaries"
    ON public.meeting_summaries FOR UPDATE
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can delete their own summaries"
    ON public.meeting_summaries FOR DELETE
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ============================================================================
-- 3. PROMPT_TEMPLATES TABLE (replaces DynamoDB prompt templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prompt_templates (
    template_id TEXT PRIMARY KEY,
    template_name TEXT NOT NULL,
    template_type TEXT NOT NULL, -- 'summary', 'chat', 'custom'
    
    -- Template content (key-value pairs)
    templates JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Ownership (optional - can be system-wide or user-specific)
    owner_email TEXT,
    is_system_template BOOLEAN DEFAULT false,
    
    -- Metadata
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_prompt_templates_type 
    ON public.prompt_templates(template_type);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_owner 
    ON public.prompt_templates(owner_email);

-- RLS policies (system templates are public, user templates are private)
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can see system templates"
    ON public.prompt_templates FOR SELECT
    USING (is_system_template = true);

CREATE POLICY "Users can see their own templates"
    ON public.prompt_templates FOR SELECT
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can insert their own templates"
    ON public.prompt_templates FOR INSERT
    WITH CHECK (
        owner_email = current_setting('request.jwt.claims', true)::json->>'email'
        AND is_system_template = false
    );

CREATE POLICY "Users can update their own templates"
    ON public.prompt_templates FOR UPDATE
    USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ============================================================================
-- 4. INSERT DEFAULT PROMPT TEMPLATES
-- ============================================================================
INSERT INTO public.prompt_templates (template_id, template_name, template_type, templates, is_system_template, description)
VALUES 
(
    'DefaultSummaryPromptTemplates',
    'Default Summary Templates',
    'summary',
    '{
        "Summary": "Please provide a concise summary of the following meeting transcript. Include key discussion points, decisions made, action items, and participants mentioned.\\n\\n{transcript}",
        "ActionItems": "Extract all action items from the following meeting transcript. For each action item, identify who is responsible and any mentioned deadlines.\\n\\n{transcript}",
        "KeyDecisions": "List all key decisions made during the following meeting. Include the decision, who made it, and any relevant context.\\n\\n{transcript}"
    }'::jsonb,
    true,
    'Default system templates for meeting summaries'
),
(
    'CustomSummaryPromptTemplates',
    'Custom Summary Templates',
    'summary',
    '{}'::jsonb,
    true,
    'Custom user-defined templates for meeting summaries (empty by default)'
)
ON CONFLICT (template_id) DO NOTHING;

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_summaries_updated_at
    BEFORE UPDATE ON public.meeting_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_templates_updated_at
    BEFORE UPDATE ON public.prompt_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_summaries TO authenticated;
GRANT SELECT ON public.prompt_templates TO authenticated;
GRANT INSERT, UPDATE ON public.prompt_templates TO authenticated;

-- Grant access to service role (for Lambda functions)
GRANT ALL ON public.meetings TO service_role;
GRANT ALL ON public.meeting_summaries TO service_role;
GRANT ALL ON public.prompt_templates TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds support for:
-- 1. Meeting metadata (replaces DynamoDB c# records)
-- 2. Meeting summaries (replaces S3 summary storage)
-- 3. Prompt templates (replaces DynamoDB template storage)
-- All with proper RLS, indexes, and triggers
-- ============================================================================

