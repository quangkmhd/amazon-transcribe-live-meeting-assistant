-- Migration 015: Create Knowledge Graph Search Functions
-- Description: RPC functions for entity search, relationship expansion, and graph traversal
-- Date: 2025-10-27

-- ==============================================================================
-- FUNCTION 1: Search Entities by Vector Similarity
-- Find entities similar to query embedding
-- ==============================================================================
CREATE OR REPLACE FUNCTION search_entities(
  query_embedding vector(768),
  user_email TEXT,
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  entity_id TEXT,
  entity_name TEXT,
  entity_type TEXT,
  description TEXT,
  similarity_score FLOAT,
  document_ids TEXT[],
  chunk_ids TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.entity_id,
    e.entity_name,
    e.entity_type,
    e.description,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity_score,
    e.document_ids,
    e.chunk_ids
  FROM knowledge_entities e
  WHERE 
    e.owner_email = user_email
    AND e.embedding IS NOT NULL
    AND (e.embedding <=> query_embedding) < (1 - similarity_threshold)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION search_entities TO authenticated, service_role, anon;

-- ==============================================================================
-- FUNCTION 2: Expand Entity Relationships (Graph Traversal)
-- Get all entities connected to seed entities within N hops
-- ==============================================================================
CREATE OR REPLACE FUNCTION expand_entity_relationships(
  seed_entity_ids TEXT[],
  max_hops INT DEFAULT 2,
  user_email TEXT DEFAULT NULL,
  min_strength FLOAT DEFAULT 3.0
)
RETURNS TABLE (
  entity_id TEXT,
  entity_name TEXT,
  entity_type TEXT,
  description TEXT,
  hop_distance INT,
  path_entities TEXT[],
  relationship_type TEXT,
  relationship_description TEXT,
  relationship_strength FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_hop INT := 0;
  current_entities TEXT[];
  next_entities TEXT[];
  visited_entities TEXT[] := '{}';
BEGIN
  -- Initialize with seed entities
  current_entities := seed_entity_ids;
  visited_entities := seed_entity_ids;
  
  -- Create temp table for results
  CREATE TEMP TABLE IF NOT EXISTS graph_traversal_results (
    entity_id TEXT,
    entity_name TEXT,
    entity_type TEXT,
    description TEXT,
    hop_distance INT,
    path_entities TEXT[],
    relationship_type TEXT,
    relationship_description TEXT,
    relationship_strength FLOAT
  ) ON COMMIT DROP;
  
  -- Add seed entities (hop 0)
  INSERT INTO graph_traversal_results
  SELECT 
    e.entity_id,
    e.entity_name,
    e.entity_type,
    e.description,
    0 AS hop_distance,
    ARRAY[e.entity_name] AS path_entities,
    NULL AS relationship_type,
    NULL AS relationship_description,
    NULL AS relationship_strength
  FROM knowledge_entities e
  WHERE e.entity_id = ANY(seed_entity_ids)
    AND (user_email IS NULL OR e.owner_email = user_email);
  
  -- Traverse graph
  WHILE current_hop < max_hops AND array_length(current_entities, 1) > 0 LOOP
    current_hop := current_hop + 1;
    next_entities := '{}';
    
    -- Find connected entities (outgoing relationships)
    INSERT INTO graph_traversal_results
    SELECT 
      e.entity_id,
      e.entity_name,
      e.entity_type,
      e.description,
      current_hop AS hop_distance,
      ARRAY[e.entity_name] AS path_entities,  -- Simplified path
      r.relationship_type,
      r.description AS relationship_description,
      r.strength AS relationship_strength
    FROM knowledge_relationships r
    JOIN knowledge_entities e ON r.to_entity_id = e.entity_id
    WHERE 
      r.from_entity_id = ANY(current_entities)
      AND NOT (e.entity_id = ANY(visited_entities))
      AND r.strength >= min_strength
      AND (user_email IS NULL OR e.owner_email = user_email);
    
    -- Also find incoming relationships
    INSERT INTO graph_traversal_results
    SELECT 
      e.entity_id,
      e.entity_name,
      e.entity_type,
      e.description,
      current_hop AS hop_distance,
      ARRAY[e.entity_name] AS path_entities,
      r.relationship_type,
      r.description AS relationship_description,
      r.strength AS relationship_strength
    FROM knowledge_relationships r
    JOIN knowledge_entities e ON r.from_entity_id = e.entity_id
    WHERE 
      r.to_entity_id = ANY(current_entities)
      AND NOT (e.entity_id = ANY(visited_entities))
      AND r.strength >= min_strength
      AND (user_email IS NULL OR e.owner_email = user_email);
    
    -- Get new entities for next hop
    SELECT array_agg(DISTINCT entity_id) INTO next_entities
    FROM graph_traversal_results
    WHERE hop_distance = current_hop
      AND NOT (entity_id = ANY(visited_entities));
    
    -- Update visited list
    visited_entities := visited_entities || next_entities;
    current_entities := next_entities;
  END LOOP;
  
  -- Return all results
  RETURN QUERY
  SELECT * FROM graph_traversal_results
  ORDER BY hop_distance ASC, relationship_strength DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION expand_entity_relationships TO authenticated, service_role, anon;

-- ==============================================================================
-- FUNCTION 3: Get Entity Context
-- Format entities and relationships as readable context
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_entity_context(
  entity_ids TEXT[],
  user_email TEXT,
  include_relationships BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  context_text TEXT,
  entity_count INT,
  relationship_count INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  context_parts TEXT[];
  entity_info TEXT;
  relationship_info TEXT;
  total_entities INT;
  total_relationships INT;
BEGIN
  context_parts := '{}';
  
  -- Get entity descriptions
  FOR entity_info IN
    SELECT 
      format('[Entity: %s (%s)] %s', e.entity_name, e.entity_type, e.description)
    FROM knowledge_entities e
    WHERE e.entity_id = ANY(entity_ids)
      AND e.owner_email = user_email
    ORDER BY e.entity_name
  LOOP
    context_parts := array_append(context_parts, entity_info);
  END LOOP;
  
  total_entities := array_length(context_parts, 1);
  
  -- Get relationships if requested
  total_relationships := 0;
  IF include_relationships THEN
    FOR relationship_info IN
      SELECT 
        format('[Relationship: %s → %s] %s (type: %s, strength: %s)',
          e1.entity_name, e2.entity_name, r.description, 
          r.relationship_type, r.strength)
      FROM knowledge_relationships r
      JOIN knowledge_entities e1 ON r.from_entity_id = e1.entity_id
      JOIN knowledge_entities e2 ON r.to_entity_id = e2.entity_id
      WHERE 
        (r.from_entity_id = ANY(entity_ids) OR r.to_entity_id = ANY(entity_ids))
        AND r.owner_email = user_email
      ORDER BY r.strength DESC
    LOOP
      context_parts := array_append(context_parts, relationship_info);
      total_relationships := total_relationships + 1;
    END LOOP;
  END IF;
  
  -- Return formatted context
  RETURN QUERY
  SELECT 
    array_to_string(context_parts, E'\n\n') AS context_text,
    COALESCE(total_entities, 0) AS entity_count,
    total_relationships;
END;
$$;

GRANT EXECUTE ON FUNCTION get_entity_context TO authenticated, service_role, anon;

-- ==============================================================================
-- FUNCTION 4: Hybrid Entity Search (Text + Vector)
-- Search entities by name/description text + semantic similarity
-- ==============================================================================
CREATE OR REPLACE FUNCTION hybrid_search_entities(
  query_text TEXT,
  query_embedding vector(768),
  user_email TEXT,
  match_count INT DEFAULT 10,
  vector_weight FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  entity_id TEXT,
  entity_name TEXT,
  entity_type TEXT,
  description TEXT,
  relevance_score FLOAT,
  similarity_score FLOAT,
  text_rank FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  text_weight FLOAT;
BEGIN
  text_weight := 1.0 - vector_weight;
  
  RETURN QUERY
  SELECT 
    e.entity_id,
    e.entity_name,
    e.entity_type,
    e.description,
    -- Combined score
    (
      (1 - (e.embedding <=> query_embedding)) * vector_weight +
      ts_rank(
        to_tsvector('simple', coalesce(e.entity_name, '') || ' ' || coalesce(e.description, '')),
        plainto_tsquery('simple', query_text)
      ) * text_weight
    ) AS relevance_score,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity_score,
    ts_rank(
      to_tsvector('simple', coalesce(e.entity_name, '') || ' ' || coalesce(e.description, '')),
      plainto_tsquery('simple', query_text)
    )::FLOAT AS text_rank
  FROM knowledge_entities e
  WHERE 
    e.owner_email = user_email
    AND e.embedding IS NOT NULL
  ORDER BY relevance_score DESC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION hybrid_search_entities TO authenticated, service_role, anon;

-- ==============================================================================
-- COMMENTS
-- ==============================================================================
COMMENT ON FUNCTION search_entities IS 'Vector similarity search on knowledge entities';
COMMENT ON FUNCTION expand_entity_relationships IS 'Multi-hop graph traversal to find connected entities and relationships';
COMMENT ON FUNCTION get_entity_context IS 'Format entity and relationship data as readable context for LLM';
COMMENT ON FUNCTION hybrid_search_entities IS 'Hybrid search on entities combining vector similarity and text matching';

