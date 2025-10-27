-- Migration 014: Create Knowledge Graph Tables
-- Description: Entity and Relationship tables for RAGFlow-style Knowledge Graph
-- Date: 2025-10-27

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- TABLE 1: Knowledge Entities
-- Stores extracted entities (person, event, concept, location, etc.)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id BIGSERIAL PRIMARY KEY,
  entity_id TEXT UNIQUE NOT NULL,
  entity_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- person, event, concept, location, organization, etc.
  description TEXT,
  
  -- Links to source documents and chunks
  document_ids TEXT[] DEFAULT '{}',
  chunk_ids TEXT[] DEFAULT '{}',
  
  -- Vector embedding for entity (semantic search)
  embedding vector(768),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Ownership and timestamps
  owner_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast entity search
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON knowledge_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type ON knowledge_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_owner ON knowledge_entities(owner_email);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_documents ON knowledge_entities USING gin(document_ids);

-- Vector similarity index on entities
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_embedding 
ON knowledge_entities USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Full-text search on entity names and descriptions
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_text_search 
ON knowledge_entities USING gin(
  to_tsvector('simple', coalesce(entity_name, '') || ' ' || coalesce(description, ''))
);

-- ==============================================================================
-- TABLE 2: Knowledge Relationships
-- Stores relationships between entities
-- ==============================================================================
CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id BIGSERIAL PRIMARY KEY,
  relationship_id TEXT UNIQUE NOT NULL,
  
  -- Entity references
  from_entity_id TEXT NOT NULL REFERENCES knowledge_entities(entity_id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES knowledge_entities(entity_id) ON DELETE CASCADE,
  
  -- Relationship details
  relationship_type TEXT,  -- e.g., "leads_to", "triggers", "contains", "part_of"
  description TEXT,
  strength FLOAT DEFAULT 5.0,  -- 0-10 scale
  keywords TEXT[] DEFAULT '{}',  -- Key concepts describing the relationship
  
  -- Source tracking
  document_ids TEXT[] DEFAULT '{}',
  chunk_ids TEXT[] DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Ownership and timestamps
  owner_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast relationship queries
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_from ON knowledge_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_to ON knowledge_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_type ON knowledge_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_strength ON knowledge_relationships(strength DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_owner ON knowledge_relationships(owner_email);

-- Composite index for bi-directional lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_both 
ON knowledge_relationships(from_entity_id, to_entity_id);

-- ==============================================================================
-- TABLE 3: Knowledge Communities (Optional - for entity clustering)
-- Groups related entities into communities/topics
-- ==============================================================================
CREATE TABLE IF NOT EXISTS knowledge_communities (
  id BIGSERIAL PRIMARY KEY,
  community_id TEXT UNIQUE NOT NULL,
  
  -- Community details
  community_name TEXT,
  summary TEXT,  -- Summary of what this community represents
  topic TEXT,    -- Main topic/theme
  
  -- Member entities
  entity_ids TEXT[] DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Ownership and timestamps
  owner_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for community search
CREATE INDEX IF NOT EXISTS idx_knowledge_communities_owner ON knowledge_communities(owner_email);
CREATE INDEX IF NOT EXISTS idx_knowledge_communities_topic ON knowledge_communities(topic);
CREATE INDEX IF NOT EXISTS idx_knowledge_communities_entities ON knowledge_communities USING gin(entity_ids);

-- ==============================================================================
-- RAPTOR COLUMNS (for Phase 4)
-- Add columns to knowledge_chunks for hierarchical summarization
-- ==============================================================================
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS raptor_level INT DEFAULT 0;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS parent_chunk_id TEXT;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS child_chunk_ids TEXT[] DEFAULT '{}';
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS cluster_id TEXT;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS is_raptor_summary BOOLEAN DEFAULT FALSE;

-- Indexes for RAPTOR queries
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_raptor_level ON knowledge_chunks(raptor_level);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_parent ON knowledge_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_cluster ON knowledge_chunks(cluster_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_is_summary ON knowledge_chunks(is_raptor_summary);

-- Composite index for multi-level search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_owner_level 
ON knowledge_chunks(owner_email, raptor_level, document_id);

-- ==============================================================================
-- ROW LEVEL SECURITY
-- ==============================================================================
ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_communities ENABLE ROW LEVEL SECURITY;

-- Entities policies
CREATE POLICY "Users can read their own entities"
ON knowledge_entities FOR SELECT
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can insert their own entities"
ON knowledge_entities FOR INSERT
TO authenticated
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own entities"
ON knowledge_entities FOR UPDATE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'))
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can delete their own entities"
ON knowledge_entities FOR DELETE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

-- Service role has full access
CREATE POLICY "Service role has full access to entities"
ON knowledge_entities FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Relationships policies (same pattern)
CREATE POLICY "Users can read their own relationships"
ON knowledge_relationships FOR SELECT
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can insert their own relationships"
ON knowledge_relationships FOR INSERT
TO authenticated
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own relationships"
ON knowledge_relationships FOR UPDATE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'))
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can delete their own relationships"
ON knowledge_relationships FOR DELETE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Service role has full access to relationships"
ON knowledge_relationships FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Communities policies
CREATE POLICY "Users can read their own communities"
ON knowledge_communities FOR SELECT
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Service role has full access to communities"
ON knowledge_communities FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- COMMENTS
-- ==============================================================================
COMMENT ON TABLE knowledge_entities IS 'Extracted entities from documents for Knowledge Graph';
COMMENT ON TABLE knowledge_relationships IS 'Relationships between entities for multi-hop reasoning';
COMMENT ON TABLE knowledge_communities IS 'Entity clusters/communities for topic-based retrieval';
COMMENT ON COLUMN knowledge_chunks.raptor_level IS 'RAPTOR hierarchy level: 0=original, 1=cluster, 2=meta, 3=top';
COMMENT ON COLUMN knowledge_chunks.parent_chunk_id IS 'Parent chunk ID in RAPTOR tree';
COMMENT ON COLUMN knowledge_chunks.child_chunk_ids IS 'Child chunk IDs in RAPTOR tree';

