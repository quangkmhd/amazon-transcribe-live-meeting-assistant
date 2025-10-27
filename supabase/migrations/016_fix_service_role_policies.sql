-- Migration 016: Add Service Role Policies for Knowledge Documents
-- Description: Fixes issue where background processing cannot update document status
-- Date: 2025-10-27
-- Bug: File upload status stays "pending" because service_role lacks UPDATE permission

-- ==============================================================================
-- Add Service Role Policies for knowledge_documents
-- ==============================================================================

-- Service role needs full access to knowledge_documents to update processing status
CREATE POLICY "Service role has full access to knowledge_documents"
ON knowledge_documents FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- Add Service Role Policies for knowledge_chunks
-- ==============================================================================

-- Service role needs full access to knowledge_chunks to insert chunks during processing
CREATE POLICY "Service role has full access to knowledge_chunks"
ON knowledge_chunks FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- COMMENTS
-- ==============================================================================

COMMENT ON POLICY "Service role has full access to knowledge_documents" ON knowledge_documents IS 
'Allows Edge Functions using service_role key to update document processing status and metadata during background processing';

COMMENT ON POLICY "Service role has full access to knowledge_chunks" ON knowledge_chunks IS 
'Allows Edge Functions using service_role key to insert and manage chunks during document processing';
