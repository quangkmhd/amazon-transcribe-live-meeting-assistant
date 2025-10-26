-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge Documents Table (metadata for uploaded documents)
CREATE TABLE knowledge_documents (
  id BIGSERIAL PRIMARY KEY,
  document_id TEXT UNIQUE NOT NULL,
  owner_email TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, docx, pptx, xlsx, txt, md
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  upload_date TIMESTAMPTZ DEFAULT NOW(),
  processing_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  processing_error TEXT,
  chunk_count INTEGER DEFAULT 0,
  metadata JSONB, -- author, title, creation_date, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_documents_owner ON knowledge_documents(owner_email);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(processing_status);
CREATE INDEX idx_knowledge_documents_upload_date ON knowledge_documents(upload_date DESC);

-- Knowledge Chunks Table (chunked document content with embeddings)
CREATE TABLE knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  chunk_id TEXT UNIQUE NOT NULL,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  embedding vector(768), -- Gemini text-embedding-004 produces 768-dimensional vectors
  metadata JSONB, -- page_number, section_title, chunk_type, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_owner ON knowledge_chunks(owner_email);
-- Vector similarity search index using HNSW (Hierarchical Navigable Small World)
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search on content
CREATE INDEX idx_knowledge_chunks_content_fts ON knowledge_chunks 
  USING GIN (to_tsvector('english', content));

-- Meeting Transcript Chunks Table (real-time indexed transcripts)
CREATE TABLE meeting_transcript_chunks (
  id BIGSERIAL PRIMARY KEY,
  chunk_id TEXT UNIQUE NOT NULL,
  meeting_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  speaker TEXT,
  content TEXT NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meeting_transcript_chunks_meeting ON meeting_transcript_chunks(meeting_id);
CREATE INDEX idx_meeting_transcript_chunks_owner ON meeting_transcript_chunks(owner_email);
CREATE INDEX idx_meeting_transcript_chunks_time ON meeting_transcript_chunks(meeting_id, start_time);
-- Vector similarity search index
CREATE INDEX idx_meeting_transcript_chunks_embedding ON meeting_transcript_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search on transcript content
CREATE INDEX idx_meeting_transcript_chunks_content_fts ON meeting_transcript_chunks 
  USING GIN (to_tsvector('english', content));

-- Storage bucket for knowledge documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-documents',
  'knowledge-documents',
  false, -- Private bucket
  52428800, -- 50MB limit per file
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for knowledge documents
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'knowledge-documents');

CREATE POLICY "Allow users to read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = auth.jwt() ->> 'email'
);

CREATE POLICY "Allow users to delete own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = auth.jwt() ->> 'email'
);

-- Enable RLS on knowledge tables
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_transcript_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for knowledge_documents
CREATE POLICY "Users can view own documents"
ON knowledge_documents FOR SELECT
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can insert own documents"
ON knowledge_documents FOR INSERT
TO public
WITH CHECK (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can update own documents"
ON knowledge_documents FOR UPDATE
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can delete own documents"
ON knowledge_documents FOR DELETE
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

-- RLS Policies for knowledge_chunks
CREATE POLICY "Users can view own chunks"
ON knowledge_chunks FOR SELECT
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can insert own chunks"
ON knowledge_chunks FOR INSERT
TO public
WITH CHECK (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can delete own chunks"
ON knowledge_chunks FOR DELETE
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

-- RLS Policies for meeting_transcript_chunks
CREATE POLICY "Users can view own transcript chunks"
ON meeting_transcript_chunks FOR SELECT
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can insert own transcript chunks"
ON meeting_transcript_chunks FOR INSERT
TO public
WITH CHECK (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Users can delete own transcript chunks"
ON meeting_transcript_chunks FOR DELETE
TO public
USING (owner_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_knowledge_documents_updated_at
BEFORE UPDATE ON knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION update_knowledge_documents_updated_at();

-- Function for hybrid search (vector + full-text)
CREATE OR REPLACE FUNCTION hybrid_search_knowledge(
  query_text TEXT,
  query_embedding vector(768),
  user_email TEXT,
  match_count INTEGER DEFAULT 10,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  content TEXT,
  similarity_score FLOAT,
  relevance_score FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    SELECT 
      kc.chunk_id,
      kc.document_id,
      kc.content,
      1 - (kc.embedding <=> query_embedding) AS similarity,
      kc.metadata
    FROM knowledge_chunks kc
    WHERE kc.owner_email = user_email
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  text_search AS (
    SELECT 
      kc.chunk_id,
      kc.document_id,
      kc.content,
      ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', query_text)) AS rank,
      kc.metadata
    FROM knowledge_chunks kc
    WHERE kc.owner_email = user_email
      AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', query_text)
    ORDER BY rank DESC
    LIMIT match_count * 2
  )
  SELECT 
    COALESCE(vs.chunk_id, ts.chunk_id) AS chunk_id,
    COALESCE(vs.document_id, ts.document_id) AS document_id,
    COALESCE(vs.content, ts.content) AS content,
    COALESCE(vs.similarity, 0) AS similarity_score,
    (COALESCE(vs.similarity, 0) * vector_weight + COALESCE(ts.rank, 0) * (1 - vector_weight)) AS relevance_score,
    COALESCE(vs.metadata, ts.metadata) AS metadata
  FROM vector_search vs
  FULL OUTER JOIN text_search ts ON vs.chunk_id = ts.chunk_id
  ORDER BY relevance_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function for searching meeting transcripts
CREATE OR REPLACE FUNCTION search_meeting_transcripts(
  query_embedding vector(768),
  meeting_ids TEXT[],
  user_email TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id TEXT,
  meeting_id TEXT,
  speaker TEXT,
  content TEXT,
  start_time FLOAT,
  end_time FLOAT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mtc.chunk_id,
    mtc.meeting_id,
    mtc.speaker,
    mtc.content,
    mtc.start_time,
    mtc.end_time,
    1 - (mtc.embedding <=> query_embedding) AS similarity
  FROM meeting_transcript_chunks mtc
  WHERE mtc.owner_email = user_email
    AND (meeting_ids IS NULL OR mtc.meeting_id = ANY(meeting_ids))
    AND mtc.embedding IS NOT NULL
  ORDER BY mtc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;


