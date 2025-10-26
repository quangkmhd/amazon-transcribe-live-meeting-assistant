#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
RAG Query Resolver
Performs hybrid search (vector + full-text) on knowledge base and transcripts
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional

# Supabase client
try:
    from supabase import create_client, Client
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client

# Import embedding service
import sys
sys.path.append('../embedding_service')
from gemini_embeddings import GeminiEmbeddingService

# Import debug logger
sys.path.append('../../../../../../utilities')
from debug_logger import lma_rag_logger, StepTracer

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class RAGQueryEngine:
    """RAG Query Engine with hybrid search"""
    
    def __init__(self, tracer: StepTracer = None):
        self.embedding_service = GeminiEmbeddingService()
        self.tracer = tracer
        
        if self.tracer:
            lma_rag_logger.debug("RAGQueryEngine initialized", embedding_service="GeminiEmbeddingService")
    
    def search_knowledge_base(
        self,
        query: str,
        user_email: str,
        match_count: int = 5,
        vector_weight: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Search knowledge base using hybrid search (vector + full-text)
        
        Args:
            query: Search query
            user_email: User email for filtering results
            match_count: Number of results to return
            vector_weight: Weight for vector similarity (0-1)
        
        Returns:
            List of matching chunks with metadata
        """
        if self.tracer:
            self.tracer.start_step(
                "Knowledge Base Search",
                "Hybrid search (vector + full-text) in Supabase",
                {
                    "query": query[:100],
                    "user_email": user_email,
                    "match_count": match_count,
                    "vector_weight": vector_weight
                }
            )
        
        try:
            logger.info(f"Searching knowledge base for: {query}")
            lma_rag_logger.info("Starting knowledge base search", query=query[:100], user=user_email)
            
            # Generate query embedding
            if self.tracer:
                self.tracer.add_checkpoint("Generating query embedding")
            
            query_embedding = self.embedding_service.generate_query_embedding(query)
            
            lma_rag_logger.debug("Query embedding generated", dimension=len(query_embedding))
            if self.tracer:
                self.tracer.add_checkpoint("Embedding generated", {"dimension": len(query_embedding)})
            
            # Call hybrid search function in Supabase
            if self.tracer:
                self.tracer.add_checkpoint("Calling Supabase hybrid_search_knowledge RPC")
            
            response = supabase.rpc(
                'hybrid_search_knowledge',
                {
                    'query_text': query,
                    'query_embedding': query_embedding,
                    'user_email': user_email,
                    'match_count': match_count,
                    'vector_weight': vector_weight
                }
            ).execute()
            
            result_count = len(response.data)
            logger.info(f"Found {result_count} matching chunks")
            lma_rag_logger.info("Knowledge base search completed", matches=result_count)
            
            if self.tracer:
                self.tracer.add_checkpoint("Hybrid search completed", {"matches": result_count})
                self.tracer.end_step(result={"match_count": result_count, "results": response.data[:2]})
            
            return response.data
        
        except Exception as e:
            logger.error(f"Error searching knowledge base: {str(e)}")
            lma_rag_logger.error("Knowledge base search failed", error=e)
            
            if self.tracer:
                self.tracer.end_step(error=e)
            
            return []
    
    def search_meeting_transcripts(
        self,
        query: str,
        user_email: str,
        meeting_ids: Optional[List[str]] = None,
        match_count: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search meeting transcripts using vector similarity
        
        Args:
            query: Search query
            user_email: User email for filtering results
            meeting_ids: Optional list of meeting IDs to filter
            match_count: Number of results to return
        
        Returns:
            List of matching transcript chunks
        """
        if self.tracer:
            self.tracer.start_step(
                "Transcript Search",
                "Search meeting transcripts using vector similarity",
                {
                    "query": query[:100],
                    "user_email": user_email,
                    "meeting_ids": meeting_ids,
                    "match_count": match_count
                }
            )
        
        try:
            logger.info(f"Searching meeting transcripts for: {query}")
            lma_rag_logger.info("Starting transcript search", query=query[:100], meetings=meeting_ids)
            
            # Generate query embedding
            if self.tracer:
                self.tracer.add_checkpoint("Generating query embedding")
            
            query_embedding = self.embedding_service.generate_query_embedding(query)
            
            lma_rag_logger.debug("Query embedding generated", dimension=len(query_embedding))
            if self.tracer:
                self.tracer.add_checkpoint("Embedding generated", {"dimension": len(query_embedding)})
            
            # Call search function in Supabase
            if self.tracer:
                self.tracer.add_checkpoint("Calling Supabase search_meeting_transcripts RPC")
            
            response = supabase.rpc(
                'search_meeting_transcripts',
                {
                    'query_embedding': query_embedding,
                    'meeting_ids': meeting_ids,
                    'user_email': user_email,
                    'match_count': match_count
                }
            ).execute()
            
            result_count = len(response.data)
            logger.info(f"Found {result_count} matching transcript segments")
            lma_rag_logger.info("Transcript search completed", matches=result_count)
            
            if self.tracer:
                self.tracer.add_checkpoint("Transcript search completed", {"matches": result_count})
                self.tracer.end_step(result={"match_count": result_count, "results": response.data[:2]})
            
            return response.data
        
        except Exception as e:
            logger.error(f"Error searching transcripts: {str(e)}")
            lma_rag_logger.error("Transcript search failed", error=e)
            
            if self.tracer:
                self.tracer.end_step(error=e)
            
            return []
    
    def assemble_context(
        self,
        query: str,
        user_email: str,
        meeting_id: Optional[str] = None,
        include_documents: bool = True,
        include_transcripts: bool = True,
        doc_match_count: int = 5,
        transcript_match_count: int = 3
    ) -> Dict[str, Any]:
        """
        Assemble context from knowledge base and transcripts
        
        Args:
            query: User query
            user_email: User email
            meeting_id: Optional meeting ID for transcript filtering
            include_documents: Include knowledge base documents
            include_transcripts: Include meeting transcripts
            doc_match_count: Number of document chunks to retrieve
            transcript_match_count: Number of transcript chunks to retrieve
        
        Returns:
            Dict with context and metadata
        """
        if self.tracer:
            self.tracer.start_step(
                "Context Assembly",
                "Combine retrieved documents and transcripts into unified context",
                {
                    "include_documents": include_documents,
                    "include_transcripts": include_transcripts,
                    "doc_match_count": doc_match_count,
                    "transcript_match_count": transcript_match_count
                }
            )
        
        try:
            context_parts = []
            sources = []
            
            # Search knowledge base
            if include_documents:
                if self.tracer:
                    self.tracer.add_checkpoint("Searching knowledge base")
                
                kb_results = self.search_knowledge_base(
                    query, 
                    user_email, 
                    match_count=doc_match_count
                )
                
                if kb_results:
                    context_parts.append("# Knowledge Base Context\n")
                    for idx, result in enumerate(kb_results):
                        chunk_text = result.get('content', '')
                        doc_id = result.get('document_id', '')
                        relevance = result.get('relevance_score', 0)
                        
                        context_parts.append(f"\n[Document {idx + 1}]")
                        context_parts.append(chunk_text)
                        
                        sources.append({
                            'type': 'document',
                            'document_id': doc_id,
                            'chunk_id': result.get('chunk_id'),
                            'relevance_score': relevance,
                            'excerpt': chunk_text[:200] + '...' if len(chunk_text) > 200 else chunk_text
                        })
                    
                    lma_rag_logger.info("Document context added", doc_count=len(kb_results))
                    if self.tracer:
                        self.tracer.add_checkpoint("Document context added", {"count": len(kb_results)})
            
            # Search meeting transcripts
            if include_transcripts:
                if self.tracer:
                    self.tracer.add_checkpoint("Searching meeting transcripts")
                
                meeting_ids = [meeting_id] if meeting_id else None
                transcript_results = self.search_meeting_transcripts(
                    query,
                    user_email,
                    meeting_ids=meeting_ids,
                    match_count=transcript_match_count
                )
                
                if transcript_results:
                    context_parts.append("\n\n# Meeting Transcript Context\n")
                    for idx, result in enumerate(transcript_results):
                        speaker = result.get('speaker', 'Unknown')
                        content = result.get('content', '')
                        meeting_id_found = result.get('meeting_id', '')
                        start_time = result.get('start_time', 0)
                        
                        context_parts.append(f"\n[Transcript {idx + 1} - {speaker}]")
                        context_parts.append(content)
                        
                        sources.append({
                            'type': 'transcript',
                            'meeting_id': meeting_id_found,
                            'speaker': speaker,
                            'start_time': start_time,
                            'similarity_score': result.get('similarity_score', 0),
                            'excerpt': content[:200] + '...' if len(content) > 200 else content
                        })
                    
                    lma_rag_logger.info("Transcript context added", transcript_count=len(transcript_results))
                    if self.tracer:
                        self.tracer.add_checkpoint("Transcript context added", {"count": len(transcript_results)})
            
            context = "\n".join(context_parts)
            context_length = len(context)
            
            lma_rag_logger.info(
                "Context assembly completed",
                context_length=context_length,
                source_count=len(sources),
                has_context=len(context_parts) > 0
            )
            
            result = {
                'context': context,
                'sources': sources,
                'has_context': len(context_parts) > 0,
                'context_length': context_length,
                'source_count': len(sources)
            }
            
            if self.tracer:
                self.tracer.end_step(result={
                    "context_length": context_length,
                    "source_count": len(sources),
                    "has_context": len(context_parts) > 0
                })
            
            return result
        
        except Exception as e:
            logger.error(f"Error assembling context: {str(e)}")
            lma_rag_logger.error("Context assembly failed", error=e)
            
            if self.tracer:
                self.tracer.end_step(error=e)
            
            return {
                'context': '',
                'sources': [],
                'has_context': False,
                'error': str(e)
            }


def lambda_handler(event, context):
    """
    Lambda handler for RAG queries
    
    Expected event structure:
    {
        "query": "user question",
        "user_email": "user@example.com",
        "meeting_id": "optional_meeting_id",
        "include_documents": true,
        "include_transcripts": true,
        "doc_match_count": 5,
        "transcript_match_count": 3,
        "enable_debug": false
    }
    """
    # Start execution trace
    enable_debug = event.get('enable_debug', False)
    tracer = None
    
    if enable_debug:
        tracer = lma_rag_logger.start_trace("LMA_RAG_QUERY")
        tracer.start_step(
            "Lambda Handler - RAG Query",
            "Process RAG query request from API Gateway",
            {
                "query": event.get('query', '')[:100],
                "user_email": event.get('user_email'),
                "meeting_id": event.get('meeting_id')
            }
        )
    
    try:
        logger.info(f"RAG Query Resolver - Processing event")
        lma_rag_logger.info("RAG Query Resolver started", enable_debug=enable_debug)
        
        if tracer:
            tracer.add_checkpoint("Parsing event parameters")
        
        query = event.get('query', '')
        user_email = event.get('user_email')
        meeting_id = event.get('meeting_id')
        include_documents = event.get('include_documents', True)
        include_transcripts = event.get('include_transcripts', True)
        doc_match_count = event.get('doc_match_count', 5)
        transcript_match_count = event.get('transcript_match_count', 3)
        
        if not query or not user_email:
            lma_rag_logger.warning("Missing required parameters", query=bool(query), user_email=bool(user_email))
            
            if tracer:
                tracer.end_step(error=Exception("Missing required parameters"))
                lma_rag_logger.end_trace(tracer.session_id)
            
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'query and user_email are required'
                })
            }
        
        if tracer:
            tracer.add_checkpoint("Parameters validated")
            tracer.end_step(result={"query_length": len(query), "params_valid": True})
        
        # Create engine with tracer
        engine = RAGQueryEngine(tracer=tracer)
        
        # Assemble context
        result = engine.assemble_context(
            query=query,
            user_email=user_email,
            meeting_id=meeting_id,
            include_documents=include_documents,
            include_transcripts=include_transcripts,
            doc_match_count=doc_match_count,
            transcript_match_count=transcript_match_count
        )
        
        lma_rag_logger.info("RAG Query completed successfully", has_context=result.get('has_context'))
        
        # End trace
        if tracer:
            lma_rag_logger.end_trace(tracer.session_id)
        
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
    
    except Exception as e:
        logger.error(f"Error in RAG query resolver: {str(e)}")
        lma_rag_logger.error("RAG Query failed", error=e)
        
        if tracer:
            lma_rag_logger.end_trace(tracer.session_id)
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}'
            })
        }


# For testing
if __name__ == "__main__":
    import asyncio
    
    # Test RAG query
    engine = RAGQueryEngine()
    
    test_query = "What is machine learning?"
    test_email = "test@example.com"
    
    result = engine.assemble_context(
        query=test_query,
        user_email=test_email,
        include_documents=True,
        include_transcripts=False
    )
    
    print(json.dumps(result, indent=2))


