-- Migration: Create RAG Search Functions
-- Description: Creates hybrid search and vector search RPC functions for RAG queries
-- Date: 2025-10-27

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- FUNCTION 1: Hybrid Search for Knowledge Base
-- Combines vector similarity + full-text search with configurable weights
-- ==============================================================================
CREATE OR REPLACE FUNCTION hybrid_search_knowledge(
  query_text TEXT,
  query_embedding vector(768),
  user_email TEXT,
  match_count INT DEFAULT 5,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  content TEXT,
  relevance_score FLOAT,
  similarity_score FLOAT,
  fts_score FLOAT,
  chunk_index INT,
  owner_email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  text_weight FLOAT;
BEGIN
  -- Calculate complementary weight for text search
  text_weight := 1.0 - vector_weight;
  
  -- Perform hybrid search
  RETURN QUERY
  SELECT 
    kc.chunk_id,
    kc.document_id,
    kc.content,
    -- Combined relevance score (weighted average)
    (
      (1 - (kc.embedding <=> query_embedding)) * vector_weight + 
      ts_rank(kc.content_tsv, plainto_tsquery('english', query_text)) * text_weight
    ) AS relevance_score,
    -- Individual scores for debugging
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity_score,
    ts_rank(kc.content_tsv, plainto_tsquery('english', query_text))::FLOAT AS fts_score,
    kc.chunk_index,
    kc.owner_email,
    kc.created_at
  FROM knowledge_chunks kc
  WHERE 
    -- Filter by user
    kc.owner_email = user_email
    -- Ensure embedding exists
    AND kc.embedding IS NOT NULL
    -- Optional: filter by text relevance (can be adjusted)
    AND (
      kc.content_tsv @@ plainto_tsquery('english', query_text)
      OR (kc.embedding <=> query_embedding) < 0.5
    )
  ORDER BY relevance_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION hybrid_search_knowledge TO authenticated, service_role, anon;

-- ==============================================================================
-- FUNCTION 2: Vector Search for Meeting Transcripts
-- Pure vector similarity search on transcript chunks
-- ==============================================================================
CREATE OR REPLACE FUNCTION search_meeting_transcripts(
  query_embedding vector(768),
  meeting_ids TEXT[] DEFAULT NULL,
  user_email TEXT DEFAULT NULL,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id TEXT,
  meeting_id TEXT,
  speaker TEXT,
  content TEXT,
  start_time FLOAT,
  end_time FLOAT,
  similarity_score FLOAT,
  owner_email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.chunk_id,
    tc.meeting_id,
    tc.speaker,
    tc.content,
    tc.start_time,
    tc.end_time,
    (1 - (tc.embedding <=> query_embedding))::FLOAT AS similarity_score,
    tc.owner_email,
    tc.created_at
  FROM meeting_transcript_chunks tc
  WHERE 
    -- Filter by user if provided
    (user_email IS NULL OR tc.owner_email = user_email)
    -- Filter by meeting IDs if provided
    AND (meeting_ids IS NULL OR tc.meeting_id = ANY(meeting_ids))
    -- Ensure embedding exists
    AND tc.embedding IS NOT NULL
    -- Similarity threshold
    AND (tc.embedding <=> query_embedding) < 0.5
  ORDER BY similarity_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_meeting_transcripts TO authenticated, service_role, anon;

-- ==============================================================================
-- FUNCTION 3: Simple Vector Search for Knowledge Chunks (fallback)
-- Pure vector similarity without text search
-- ==============================================================================
CREATE OR REPLACE FUNCTION vector_search_knowledge(
  query_embedding vector(768),
  user_email TEXT,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  content TEXT,
  similarity_score FLOAT,
  chunk_index INT,
  owner_email TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kc.chunk_id,
    kc.document_id,
    kc.content,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity_score,
    kc.chunk_index,
    kc.owner_email
  FROM knowledge_chunks kc
  WHERE 
    kc.owner_email = user_email
    AND kc.embedding IS NOT NULL
    AND (kc.embedding <=> query_embedding) < (1 - similarity_threshold)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION vector_search_knowledge TO authenticated, service_role, anon;

-- ==============================================================================
-- INDEXES for Performance
-- ==============================================================================

-- Vector similarity index on knowledge_chunks (IVFFlat for fast approximate search)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Vector similarity index on meeting_transcript_chunks
CREATE INDEX IF NOT EXISTS idx_meeting_transcript_chunks_embedding 
ON meeting_transcript_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Full-text search index on knowledge_chunks (already exists via content_tsv column)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv 
ON knowledge_chunks USING gin(content_tsv);

-- Composite index for filtering + sorting
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_owner_relevance 
ON knowledge_chunks(owner_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meeting_transcript_chunks_owner_meeting 
ON meeting_transcript_chunks(owner_email, meeting_id, created_at DESC);

-- ==============================================================================
-- COMMENTS for Documentation
-- ==============================================================================

COMMENT ON FUNCTION hybrid_search_knowledge IS 
'Hybrid search combining vector similarity and full-text search on knowledge base. 
vector_weight controls the balance: 1.0 = pure vector, 0.0 = pure text search.';

COMMENT ON FUNCTION search_meeting_transcripts IS 
'Vector similarity search on meeting transcript segments. 
Supports filtering by meeting IDs and user email.';

COMMENT ON FUNCTION vector_search_knowledge IS 
'Pure vector similarity search on knowledge chunks. 
Fallback function when full-text search is not needed.';

