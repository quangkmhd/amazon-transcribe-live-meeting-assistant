#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Unified RAG Retriever
Orchestrates all RAG features: Hybrid Search, Knowledge Graph, TOC, RAPTOR, Reranking
Single entry point for complete RAGFlow-style retrieval
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
import time

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

try:
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Import services
import sys
sys.path.append('../rag_query_resolver')
sys.path.append('../gemini_rerank_service')
sys.path.append('../embedding_service')

from gemini_embeddings import GeminiEmbeddingService


def determine_query_abstraction_level(query: str) -> str:
    """
    Determine if query is abstract or specific
    
    Args:
        query: User query
    
    Returns:
        'abstract', 'specific', or 'mixed'
    """
    # Keywords indicating abstract queries
    abstract_keywords = ['overview', 'summary', 'general', 'explain', 'what is', 'how does',
                          'tổng quan', 'giải thích', 'là gì', 'hoạt động như thế nào']
    
    # Keywords indicating specific queries
    specific_keywords = ['exactly', 'precisely', 'detail', 'step', 'example', 'specific',
                          'chính xác', 'chi tiết', 'bước', 'ví dụ', 'cụ thể']
    
    query_lower = query.lower()
    
    abstract_count = sum(1 for kw in abstract_keywords if kw in query_lower)
    specific_count = sum(1 for kw in specific_keywords if kw in query_lower)
    
    if abstract_count > specific_count:
        return 'abstract'
    elif specific_count > abstract_count:
        return 'specific'
    else:
        return 'mixed'


def unified_retrieval(
    query: str,
    user_email: str,
    enable_reranking: bool = True,
    enable_knowledge_graph: bool = True,
    enable_toc: bool = True,
    enable_raptor: bool = True,
    match_count: int = 10
) -> Dict[str, Any]:
    """
    Unified retrieval with all RAG features
    
    Args:
        query: User query
        user_email: User email
        enable_reranking: Enable Gemini reranking
        enable_knowledge_graph: Enable graph search
        enable_toc: Enable TOC-aware retrieval
        enable_raptor: Enable multi-level RAPTOR search
        match_count: Number of results to return
    
    Returns:
        Combined retrieval results
    """
    start_time = time.time()
    logger.info(f"Unified Retrieval for query: {query[:100]}")
    
    results = {
        'chunks': [],
        'graph_entities': [],
        'toc_sections': [],
        'raptor_levels_used': [],
        'features_applied': [],
        'performance': {}
    }
    
    try:
        embedding_service = GeminiEmbeddingService()
        
        # Step 1: Generate query embedding
        t1 = time.time()
        query_embedding = embedding_service.generate_query_embedding(query)
        results['performance']['embedding_time'] = time.time() - t1
        
        # Step 2: Determine RAPTOR levels to search
        search_levels = [0, 1, 2, 3]  # Default: all levels
        
        if enable_raptor:
            query_type = determine_query_abstraction_level(query)
            
            if query_type == 'abstract':
                search_levels = [2, 3, 1]  # Prioritize high-level summaries
                logger.info("Abstract query detected, prioritizing RAPTOR levels 2-3")
            elif query_type == 'specific':
                search_levels = [0, 1]  # Prioritize detailed chunks
                logger.info("Specific query detected, prioritizing RAPTOR level 0")
            else:
                search_levels = [0, 1, 2, 3]  # Search all levels
            
            results['raptor_levels_used'] = search_levels
            results['features_applied'].append('RAPTOR Multi-level Search')
        
        # Step 3: Hybrid Search (with RAPTOR levels)
        t2 = time.time()
        initial_match_count = match_count * 2 if enable_reranking else match_count
        
        response = supabase.rpc(
            'hybrid_search_knowledge',
            {
                'query_text': query,
                'query_embedding': query_embedding,
                'user_email': user_email,
                'match_count': initial_match_count,
                'vector_weight': 0.3,
                'search_levels': search_levels
            }
        ).execute()
        
        chunks = response.data
        results['performance']['hybrid_search_time'] = time.time() - t2
        results['features_applied'].append('Hybrid Search (30% vector + 70% text)')
        logger.info(f"Hybrid search: {len(chunks)} chunks")
        
        # Step 4: Knowledge Graph Search (parallel with hybrid search conceptually)
        if enable_knowledge_graph:
            t3 = time.time()
            try:
                entity_response = supabase.rpc(
                    'search_entities',
                    {
                        'query_embedding': query_embedding,
                        'user_email': user_email,
                        'match_count': 5,
                        'similarity_threshold': 0.3
                    }
                ).execute()
                
                results['graph_entities'] = entity_response.data
                results['performance']['graph_search_time'] = time.time() - t3
                results['features_applied'].append(f'Knowledge Graph ({len(entity_response.data)} entities)')
                logger.info(f"Graph search: {len(entity_response.data)} entities")
            
            except Exception as e:
                logger.warning(f"Graph search failed: {e}")
        
        # Step 5: Gemini Reranking
        if enable_reranking and len(chunks) > 10:
            t4 = time.time()
            try:
                from index import rerank_chunks
                
                reranked = rerank_chunks(
                    query=query,
                    chunks=chunks,
                    top_k=match_count,
                    use_cache=True
                )
                
                chunks = reranked
                results['performance']['reranking_time'] = time.time() - t4
                results['features_applied'].append(f'Gemini Reranking (top {len(chunks)})')
                logger.info(f"Reranking: {len(chunks)} final chunks")
            
            except Exception as e:
                logger.warning(f"Reranking failed: {e}")
                chunks = chunks[:match_count]
        
        results['chunks'] = chunks
        results['performance']['total_time'] = time.time() - start_time
        
        logger.info(f"Unified retrieval complete in {results['performance']['total_time']:.2f}s")
        logger.info(f"Features applied: {', '.join(results['features_applied'])}")
        
        return results
    
    except Exception as e:
        logger.error(f"Error in unified retrieval: {str(e)}")
        results['error'] = str(e)
        results['performance']['total_time'] = time.time() - start_time
        return results


def lambda_handler(event, context):
    """
    Lambda handler for unified RAG retrieval
    
    Expected event structure:
    {
        "query": "user query",
        "user_email": "user@example.com",
        "match_count": 10,
        "features": {
            "reranking": true,
            "knowledge_graph": true,
            "toc": true,
            "raptor": true
        }
    }
    """
    try:
        logger.info("Unified RAG Retriever - Processing event")
        
        query = event.get('query', '')
        user_email = event.get('user_email')
        match_count = event.get('match_count', 10)
        
        features = event.get('features', {})
        enable_reranking = features.get('reranking', True)
        enable_kg = features.get('knowledge_graph', True)
        enable_toc = features.get('toc', True)
        enable_raptor = features.get('raptor', True)
        
        if not query or not user_email:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'query and user_email are required'
                })
            }
        
        # Unified retrieval
        results = unified_retrieval(
            query=query,
            user_email=user_email,
            enable_reranking=enable_reranking,
            enable_knowledge_graph=enable_kg,
            enable_toc=enable_toc,
            enable_raptor=enable_raptor,
            match_count=match_count
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps(results)
        }
    
    except Exception as e:
        logger.error(f"Error in unified retriever: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}'
            })
        }


# For testing
if __name__ == "__main__":
    test_event = {
        'query': 'kịch bản highlight soccer',
        'user_email': 'quangkmhd09344@gmail.com',
        'match_count': 10
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(json.loads(result['body']), indent=2, ensure_ascii=False))

