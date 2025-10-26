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

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class RAGQueryEngine:
    """RAG Query Engine with hybrid search"""
    
    def __init__(self):
        self.embedding_service = GeminiEmbeddingService()
    
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
        try:
            logger.info(f"Searching knowledge base for: {query}")
            
            # Generate query embedding
            query_embedding = self.embedding_service.generate_query_embedding(query)
            
            # Call hybrid search function in Supabase
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
            
            logger.info(f"Found {len(response.data)} matching chunks")
            
            return response.data
        
        except Exception as e:
            logger.error(f"Error searching knowledge base: {str(e)}")
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
        try:
            logger.info(f"Searching meeting transcripts for: {query}")
            
            # Generate query embedding
            query_embedding = self.embedding_service.generate_query_embedding(query)
            
            # Call search function in Supabase
            response = supabase.rpc(
                'search_meeting_transcripts',
                {
                    'query_embedding': query_embedding,
                    'meeting_ids': meeting_ids,
                    'user_email': user_email,
                    'match_count': match_count
                }
            ).execute()
            
            logger.info(f"Found {len(response.data)} matching transcript segments")
            
            return response.data
        
        except Exception as e:
            logger.error(f"Error searching transcripts: {str(e)}")
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
        try:
            context_parts = []
            sources = []
            
            # Search knowledge base
            if include_documents:
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
            
            # Search meeting transcripts
            if include_transcripts:
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
            
            context = "\n".join(context_parts)
            
            return {
                'context': context,
                'sources': sources,
                'has_context': len(context_parts) > 0
            }
        
        except Exception as e:
            logger.error(f"Error assembling context: {str(e)}")
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
        "transcript_match_count": 3
    }
    """
    try:
        logger.info(f"RAG Query Resolver - Processing event")
        
        query = event.get('query', '')
        user_email = event.get('user_email')
        meeting_id = event.get('meeting_id')
        include_documents = event.get('include_documents', True)
        include_transcripts = event.get('include_transcripts', True)
        doc_match_count = event.get('doc_match_count', 5)
        transcript_match_count = event.get('transcript_match_count', 3)
        
        if not query or not user_email:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'query and user_email are required'
                })
            }
        
        engine = RAGQueryEngine()
        
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
        
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
    
    except Exception as e:
        logger.error(f"Error in RAG query resolver: {str(e)}")
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


