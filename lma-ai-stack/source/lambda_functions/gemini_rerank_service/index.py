#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Gemini Reranking Service
Re-ranks retrieved chunks using Gemini's relevance scoring
Implements RAGFlow's reranking strategy adapted for Gemini API
"""

import os
import json
import logging
import hashlib
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

# Supabase configuration for caching
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# Import Supabase client
try:
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Cache configuration
RERANK_CACHE_TTL_HOURS = 1  # Cache rerank results for 1 hour


def generate_query_hash(query: str, chunk_ids: List[str]) -> str:
    """
    Generate hash for caching rerank results
    
    Args:
        query: Search query
        chunk_ids: List of chunk IDs being reranked
    
    Returns:
        MD5 hash string
    """
    content = query + '|' + ','.join(sorted(chunk_ids))
    return hashlib.md5(content.encode()).hexdigest()


def get_cached_rerank_scores(query_hash: str) -> Optional[Dict[str, float]]:
    """
    Get cached rerank scores from Supabase
    
    Args:
        query_hash: Query hash for cache lookup
    
    Returns:
        Dict mapping chunk_id to rerank_score, or None if not cached
    """
    try:
        # Check cache table
        response = supabase.table('rerank_cache')\
            .select('chunk_scores, expires_at')\
            .eq('query_hash', query_hash)\
            .single()\
            .execute()
        
        if response.data:
            expires_at = datetime.fromisoformat(response.data['expires_at'].replace('Z', '+00:00'))
            if expires_at > datetime.utcnow():
                logger.info(f"Cache hit for query_hash: {query_hash}")
                return response.data['chunk_scores']
            else:
                logger.info(f"Cache expired for query_hash: {query_hash}")
                # Delete expired cache
                supabase.table('rerank_cache').delete().eq('query_hash', query_hash).execute()
        
        return None
    
    except Exception as e:
        logger.warning(f"Error reading cache: {e}")
        return None


def cache_rerank_scores(query_hash: str, chunk_scores: Dict[str, float]):
    """
    Cache rerank scores in Supabase
    
    Args:
        query_hash: Query hash
        chunk_scores: Dict mapping chunk_id to rerank_score
    """
    try:
        expires_at = (datetime.utcnow() + timedelta(hours=RERANK_CACHE_TTL_HOURS)).isoformat()
        
        cache_record = {
            'query_hash': query_hash,
            'chunk_scores': chunk_scores,
            'expires_at': expires_at,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Upsert (replace if exists)
        supabase.table('rerank_cache').upsert(
            cache_record,
            on_conflict='query_hash'
        ).execute()
        
        logger.info(f"Cached rerank scores for query_hash: {query_hash}")
    
    except Exception as e:
        logger.warning(f"Error caching scores: {e}")


def call_gemini_for_reranking(query: str, chunks: List[Dict[str, Any]]) -> List[float]:
    """
    Call Gemini API to score chunk relevance
    
    Uses batch evaluation - sends all chunks in one request
    
    Args:
        query: User query
        chunks: List of chunk dicts with 'chunk_id', 'content', 'document_id'
    
    Returns:
        List of scores (0-10) corresponding to input chunks
    """
    logger.info(f"🎯 [RERANK DEBUG] Calling Gemini for {len(chunks)} chunks")
    logger.info(f"🎯 [RERANK DEBUG] Query: {query[:80]}")
    
    try:
        # Build batch evaluation prompt
        chunks_text = []
        for i, chunk in enumerate(chunks):
            content_preview = chunk['content'][:300]  # Limit to 300 chars per chunk
            chunks_text.append(f"Chunk {i+1}:\n{content_preview}\n")
        
        chunks_formatted = "\n".join(chunks_text)
        
        # RAGFlow-inspired reranking prompt
        prompt = f"""You are a relevance scoring expert. Rate how relevant each chunk is to the user's query.

User Query: {query}

Text Chunks:
{chunks_formatted}

Instructions:
1. Rate each chunk's relevance on a scale of 0-10:
   - 10: Perfectly answers the query
   - 7-9: Highly relevant, contains key information
   - 4-6: Somewhat relevant, has related information
   - 1-3: Marginally relevant, mentions related topics
   - 0: Not relevant at all

2. Consider:
   - Semantic similarity to query
   - Information completeness
   - Specificity vs generality
   - Language match (Vietnamese query → Vietnamese content scores higher)

3. Return ONLY a JSON array of scores, nothing else:
   {{"scores": [score1, score2, score3, ...]}}

JSON Response:"""
        
        # Call Gemini API
        url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL}:generateContent"
        params = {'key': GEMINI_API_KEY}
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.1,  # Low temp for consistent scoring
                "maxOutputTokens": 512,
                "topP": 0.95
            }
        }
        
        logger.info(f"🎯 [RERANK DEBUG] Sending request to Gemini...")
        
        response = requests.post(
            url,
            params=params,
            json=payload,
            timeout=30
        )
        
        logger.info(f"🎯 [RERANK DEBUG] Gemini response status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"🎯 [RERANK ERROR] Gemini API error: {response.status_code} - {response.text}")
            # Return default scores (keep original order)
            return list(range(len(chunks), 0, -1))
        
        result = response.json()
        
        # Extract scores from response
        if 'candidates' in result and len(result['candidates']) > 0:
            candidate = result['candidates'][0]
            if 'content' in candidate:
                parts = candidate['content'].get('parts', [])
                if parts and 'text' in parts[0]:
                    response_text = parts[0]['text'].strip()
                    
                    # Parse JSON
                    import re
                    json_match = re.search(r'\{[^}]*"scores"[^}]*\}', response_text, re.DOTALL)
                    if json_match:
                        response_text = json_match.group()
                    
                    try:
                        scores_data = json.loads(response_text)
                        scores = scores_data.get('scores', [])
                        
                        # Validate scores
                        if len(scores) == len(chunks):
                            # Normalize to 0-10 range
                            scores = [max(0, min(10, float(s))) for s in scores]
                            logger.info(f"🎯 [RERANK DEBUG] Gemini scores parsed successfully")
                            logger.info(f"🎯 [RERANK DEBUG] Scores: {scores}")
                            logger.info(f"🎯 [RERANK DEBUG] Avg score: {sum(scores)/len(scores):.2f}")
                            logger.info(f"🎯 [RERANK DEBUG] Max score: {max(scores):.2f}, Min score: {min(scores):.2f}")
                            return scores
                        else:
                            logger.warning(f"Score count mismatch: {len(scores)} vs {len(chunks)}")
                    
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse Gemini scores JSON: {e}")
        
        # Fallback: return default scores (preserve original order)
        logger.warning("Using default scores (no reranking applied)")
        return list(range(len(chunks), 0, -1))
    
    except Exception as e:
        logger.error(f"Error calling Gemini for reranking: {str(e)}")
        return list(range(len(chunks), 0, -1))


def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    top_k: int = 10,
    hybrid_weight: float = 0.6,
    rerank_weight: float = 0.4,
    use_cache: bool = True
) -> List[Dict[str, Any]]:
    """
    Rerank chunks using Gemini relevance scoring
    
    Args:
        query: User query
        chunks: List of chunks from hybrid search with 'relevance_score'
        top_k: Number of top results to return
        hybrid_weight: Weight for original hybrid search score (default 0.6)
        rerank_weight: Weight for Gemini rerank score (default 0.4)
        use_cache: Whether to use cached scores
    
    Returns:
        Top K chunks after reranking, with updated 'final_score' field
    """
    if not chunks:
        return []
    
    if len(chunks) <= top_k:
        # Already have fewer chunks than needed, no reranking needed
        logger.info(f"Skipping rerank: {len(chunks)} chunks <= top_k {top_k}")
        return chunks
    
    logger.info(f"Reranking {len(chunks)} chunks for query: {query[:100]}")
    
    try:
        # Generate query hash for caching
        chunk_ids = [c.get('chunk_id', '') for c in chunks]
        query_hash = generate_query_hash(query, chunk_ids)
        
        # Try to get cached scores
        rerank_scores_dict = None
        if use_cache:
            rerank_scores_dict = get_cached_rerank_scores(query_hash)
        
        # If not cached, call Gemini
        if rerank_scores_dict is None:
            logger.info("Cache miss, calling Gemini for reranking")
            rerank_scores = call_gemini_for_reranking(query, chunks)
            
            # Create dict for caching
            rerank_scores_dict = {
                chunks[i]['chunk_id']: rerank_scores[i]
                for i in range(len(chunks))
            }
            
            # Cache the scores
            if use_cache:
                cache_rerank_scores(query_hash, rerank_scores_dict)
        else:
            logger.info("Using cached rerank scores")
        
        # Combine scores
        for chunk in chunks:
            chunk_id = chunk.get('chunk_id', '')
            hybrid_score = chunk.get('relevance_score', 0.5)
            rerank_score = rerank_scores_dict.get(chunk_id, 5.0) / 10.0  # Normalize to 0-1
            
            # Combined score (RAGFlow strategy)
            final_score = (hybrid_score * hybrid_weight) + (rerank_score * rerank_weight)
            
            chunk['rerank_score'] = rerank_score
            chunk['final_score'] = final_score
        
        # Sort by final score
        chunks_sorted = sorted(chunks, key=lambda x: x.get('final_score', 0), reverse=True)
        
        # Return top K
        top_chunks = chunks_sorted[:top_k]
        
        logger.info(f"Reranking complete. Top {len(top_chunks)} chunks selected")
        logger.info(f"Score range: {top_chunks[0]['final_score']:.3f} - {top_chunks[-1]['final_score']:.3f}")
        
        return top_chunks
    
    except Exception as e:
        logger.error(f"Error in reranking: {str(e)}")
        # Fallback: return original chunks (no reranking)
        return chunks[:top_k]


def lambda_handler(event, context):
    """
    Lambda handler for reranking service
    
    Expected event structure:
    {
        "query": "user query",
        "chunks": [
            {
                "chunk_id": "...",
                "content": "...",
                "document_id": "...",
                "relevance_score": 0.85
            },
            ...
        ],
        "top_k": 10,
        "use_cache": true
    }
    """
    try:
        logger.info("Gemini Rerank Service - Processing request")
        
        query = event.get('query', '')
        chunks = event.get('chunks', [])
        top_k = event.get('top_k', 10)
        use_cache = event.get('use_cache', True)
        
        if not query or not chunks:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'query and chunks are required'
                })
            }
        
        # Rerank chunks
        reranked_chunks = rerank_chunks(
            query=query,
            chunks=chunks,
            top_k=top_k,
            use_cache=use_cache
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'chunks': reranked_chunks,
                'total_input': len(chunks),
                'total_output': len(reranked_chunks),
                'reranking_applied': True
            })
        }
    
    except Exception as e:
        logger.error(f"Error in rerank service: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}'
            })
        }


# For testing
if __name__ == "__main__":
    test_chunks = [
        {
            "chunk_id": "chunk1",
            "content": "This is about soccer highlight rules and video editing techniques.",
            "document_id": "doc1",
            "relevance_score": 0.75
        },
        {
            "chunk_id": "chunk2",
            "content": "Unrelated content about cooking recipes.",
            "document_id": "doc2",
            "relevance_score": 0.72
        },
        {
            "chunk_id": "chunk3",
            "content": "Detailed explanation of soccer event detection: PASS, DRIVE, GOAL sequences.",
            "document_id": "doc1",
            "relevance_score": 0.70
        }
    ]
    
    result = rerank_chunks(
        query="kịch bản highlight soccer",
        chunks=test_chunks,
        top_k=2,
        use_cache=False
    )
    
    print(json.dumps(result, indent=2, ensure_ascii=False))

