#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
RAPTOR Builder - Recursive Abstractive Processing for Tree-Organized Retrieval
Builds hierarchical summarization tree (3 levels) for multi-level RAG retrieval
Optimized implementation using simple clustering + parallel Gemini calls
"""

import os
import json
import logging
import hashlib
import requests
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

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

# Import embedding service
import sys
sys.path.append('../embedding_service')
from gemini_embeddings import GeminiEmbeddingService

# RAPTOR Configuration
DISTANCE_THRESHOLD = 0.3  # Cosine distance threshold for clustering
MIN_CLUSTER_SIZE = 3      # Minimum chunks per cluster
MAX_CLUSTER_SIZE = 10     # Maximum chunks per cluster
MAX_LEVELS = 3            # Build 3 levels (0=original, 1=cluster, 2=meta, 3=top)


def cosine_distance(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine distance between two vectors"""
    try:
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        
        dot_product = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        
        if norm1 == 0 or norm2 == 0:
            return 1.0
        
        similarity = dot_product / (norm1 * norm2)
        distance = 1.0 - similarity
        
        return float(distance)
    
    except Exception as e:
        logger.error(f"Error calculating distance: {e}")
        return 1.0


def simple_clustering(embeddings: List[List[float]], distance_threshold: float = 0.3) -> List[List[int]]:
    """
    Simple distance-based clustering (no ML libraries needed)
    
    Args:
        embeddings: List of embedding vectors
        distance_threshold: Maximum distance for same cluster
    
    Returns:
        List of clusters, where each cluster is list of indices
    """
    n = len(embeddings)
    if n == 0:
        return []
    
    clusters = []
    assigned = set()
    
    for i in range(n):
        if i in assigned:
            continue
        
        # Start new cluster with this point
        cluster = [i]
        assigned.add(i)
        
        # Find all points within threshold
        for j in range(i + 1, n):
            if j in assigned:
                continue
            
            # Check distance to cluster centroid (average of cluster members)
            cluster_vectors = [embeddings[idx] for idx in cluster]
            centroid = np.mean(cluster_vectors, axis=0).tolist()
            
            distance = cosine_distance(centroid, embeddings[j])
            
            if distance < distance_threshold and len(cluster) < MAX_CLUSTER_SIZE:
                cluster.append(j)
                assigned.add(j)
        
        # Only keep clusters with minimum size
        if len(cluster) >= MIN_CLUSTER_SIZE:
            clusters.append(cluster)
        else:
            # Small clusters: assign to nearest existing cluster or create singleton
            if clusters:
                # Find nearest cluster
                best_cluster_idx = 0
                best_distance = float('inf')
                
                for cluster in cluster:
                    centroid = np.mean([embeddings[idx] for idx in clusters[0]], axis=0).tolist()
                    dist = cosine_distance(centroid, embeddings[i])
                    if dist < best_distance:
                        best_distance = dist
                
                if best_distance < distance_threshold * 1.5:
                    clusters[best_cluster_idx].extend(cluster)
                else:
                    clusters.append(cluster)
            else:
                clusters.append(cluster)
    
    logger.info(f"Created {len(clusters)} clusters from {n} items")
    return clusters


def summarize_cluster(chunks: List[Dict[str, Any]], cluster_id: str) -> str:
    """
    Summarize a cluster of chunks using Gemini
    
    Args:
        chunks: List of chunk dicts
        cluster_id: Cluster identifier
    
    Returns:
        Summary text
    """
    # Combine chunk texts
    combined_text = "\n\n---\n\n".join([c['content'] for c in chunks])
    
    # Truncate if too long
    if len(combined_text) > 8000:
        combined_text = combined_text[:8000] + "..."
    
    # RAGFlow summarization prompt
    prompt = f"""You are a document summarizer. Create a comprehensive summary of the following related text chunks.

The summary should:
1. Capture all key information and main points
2. Maintain the same language as the input
3. Be concise but thorough (2-3 paragraphs)
4. Preserve important details, names, numbers, and facts

Text Chunks:
{combined_text}

Summary:"""
    
    response = call_gemini(prompt, max_tokens=1024)
    
    if not response:
        # Fallback: concatenate first sentences
        return " ".join([c['content'][:200] for c in chunks])
    
    return response.strip()


def build_raptor_level(
    parent_chunks: List[Dict[str, Any]],
    level: int,
    document_id: str,
    owner_email: str
) -> List[Dict[str, Any]]:
    """
    Build one level of RAPTOR tree
    
    Args:
        parent_chunks: Chunks from previous level
        level: Current level being built (1, 2, or 3)
        document_id: Document ID
        owner_email: Owner email
    
    Returns:
        List of summary chunks for this level
    """
    logger.info(f"Building RAPTOR level {level} from {len(parent_chunks)} chunks")
    
    if len(parent_chunks) <= 1:
        logger.info(f"Only {len(parent_chunks)} chunk(s) at level {level-1}, skipping")
        return []
    
    # Get embeddings
    embeddings = []
    for chunk in parent_chunks:
        if 'embedding' in chunk and chunk['embedding']:
            # Parse embedding if it's string format
            if isinstance(chunk['embedding'], str):
                emb_str = chunk['embedding'].strip('[]')
                emb = [float(x) for x in emb_str.split(',')]
                embeddings.append(emb)
            elif isinstance(chunk['embedding'], list):
                embeddings.append(chunk['embedding'])
            else:
                logger.warning(f"Invalid embedding type for chunk {chunk.get('chunk_id')}")
                embeddings.append([0.0] * 768)
        else:
            logger.warning(f"No embedding for chunk {chunk.get('chunk_id')}")
            embeddings.append([0.0] * 768)
    
    # Cluster chunks
    clusters = simple_clustering(embeddings, distance_threshold=DISTANCE_THRESHOLD)
    
    if not clusters:
        logger.warning(f"No clusters created at level {level}")
        return []
    
    logger.info(f"Created {len(clusters)} clusters at level {level}")
    
    # Summarize each cluster in parallel
    summary_chunks = []
    embedding_service = GeminiEmbeddingService()
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        # Submit summarization tasks
        future_to_cluster = {}
        for cluster_idx, cluster in enumerate(clusters):
            cluster_chunks = [parent_chunks[i] for i in cluster]
            cluster_id = f"{document_id}_L{level}_C{cluster_idx}"
            
            future = executor.submit(summarize_cluster, cluster_chunks, cluster_id)
            future_to_cluster[future] = (cluster_idx, cluster_chunks, cluster_id)
        
        # Collect results
        for future in as_completed(future_to_cluster):
            cluster_idx, cluster_chunks, cluster_id = future_to_cluster[future]
            
            try:
                summary_text = future.result()
                
                # Generate embedding for summary
                summary_embedding = embedding_service.generate_embedding(
                    summary_text,
                    task_type="RETRIEVAL_DOCUMENT"
                )
                
                # Create summary chunk record
                child_ids = [c['chunk_id'] for c in cluster_chunks]
                
                summary_chunk = {
                    'chunk_id': cluster_id,
                    'document_id': document_id,
                    'owner_email': owner_email,
                    'chunk_index': cluster_idx,
                    'content': summary_text,
                    'content_length': len(summary_text),
                    'embedding': f"[{','.join(map(str, summary_embedding))}]",
                    'raptor_level': level,
                    'cluster_id': cluster_id,
                    'child_chunk_ids': child_ids,
                    'is_raptor_summary': True,
                    'metadata': {
                        'cluster_size': len(cluster_chunks),
                        'child_ids': child_ids,
                        'created_at': datetime.utcnow().isoformat()
                    }
                }
                
                summary_chunks.append(summary_chunk)
                
                logger.info(f"  Cluster {cluster_idx}: summarized {len(cluster_chunks)} chunks")
            
            except Exception as e:
                logger.error(f"Error summarizing cluster {cluster_idx}: {e}")
                continue
    
    logger.info(f"Generated {len(summary_chunks)} summaries at level {level}")
    return summary_chunks


def build_raptor_tree(
    document_id: str,
    level_0_chunks: List[Dict[str, Any]],
    owner_email: str,
    max_levels: int = 3
) -> Dict[str, Any]:
    """
    Build complete RAPTOR tree with multiple levels
    
    Args:
        document_id: Document ID
        level_0_chunks: Original document chunks
        owner_email: Owner email
        max_levels: Maximum levels to build (default 3)
    
    Returns:
        Dict with tree statistics
    """
    logger.info(f"Building RAPTOR tree for document {document_id}")
    logger.info(f"Starting with {len(level_0_chunks)} Level 0 chunks")
    
    all_summary_chunks = []
    current_level_chunks = level_0_chunks
    
    # Build levels 1, 2, 3
    for level in range(1, max_levels + 1):
        logger.info(f"\n{'='*60}")
        logger.info(f"Building Level {level}")
        logger.info(f"{'='*60}")
        
        level_summaries = build_raptor_level(
            parent_chunks=current_level_chunks,
            level=level,
            document_id=document_id,
            owner_email=owner_email
        )
        
        if not level_summaries:
            logger.info(f"No summaries generated at level {level}, stopping")
            break
        
        all_summary_chunks.extend(level_summaries)
        current_level_chunks = level_summaries
        
        # If we've converged to very few summaries, stop
        if len(current_level_chunks) <= 2:
            logger.info(f"Converged to {len(current_level_chunks)} summaries at level {level}, stopping")
            break
    
    # Store all summary chunks in database
    if all_summary_chunks:
        logger.info(f"\nStoring {len(all_summary_chunks)} RAPTOR summary chunks")
        try:
            response = supabase.table('knowledge_chunks').insert(all_summary_chunks).execute()
            logger.info(f"RAPTOR tree stored successfully")
        except Exception as e:
            logger.error(f"Error storing RAPTOR tree: {e}")
            raise
    
    # Calculate statistics
    stats = {
        'document_id': document_id,
        'level_0_count': len(level_0_chunks),
        'total_summaries': len(all_summary_chunks),
        'levels_built': max([c['raptor_level'] for c in all_summary_chunks]) if all_summary_chunks else 0
    }
    
    # Count per level
    for level in range(1, max_levels + 1):
        count = len([c for c in all_summary_chunks if c['raptor_level'] == level])
        stats[f'level_{level}_count'] = count
    
    logger.info(f"\nRAPTOR Tree Statistics:")
    logger.info(f"  Level 0 (original): {stats['level_0_count']}")
    for level in range(1, max_levels + 1):
        if f'level_{level}_count' in stats:
            logger.info(f"  Level {level} (summaries): {stats[f'level_{level}_count']}")
    
    return stats


def lambda_handler(event, context):
    """
    Lambda handler for RAPTOR tree building
    
    Expected event structure:
    {
        "document_id": "doc-uuid",
        "owner_email": "user@example.com",
        "max_levels": 3
    }
    """
    try:
        logger.info("RAPTOR Builder - Processing event")
        
        document_id = event.get('document_id')
        owner_email = event.get('owner_email')
        max_levels = event.get('max_levels', 3)
        
        if not document_id or not owner_email:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'document_id and owner_email are required'
                })
            }
        
        # Get Level 0 chunks
        logger.info(f"Fetching Level 0 chunks for {document_id}")
        response = supabase.table('knowledge_chunks')\
            .select('*')\
            .eq('document_id', document_id)\
            .eq('owner_email', owner_email)\
            .eq('raptor_level', 0)\
            .eq('is_raptor_summary', False)\
            .order('chunk_index')\
            .execute()
        
        level_0_chunks = response.data
        
        if not level_0_chunks:
            logger.warning(f"No Level 0 chunks found for {document_id}")
            return {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'No Level 0 chunks found for document'
                })
            }
        
        logger.info(f"Found {len(level_0_chunks)} Level 0 chunks")
        
        # Build RAPTOR tree
        stats = build_raptor_tree(
            document_id=document_id,
            level_0_chunks=level_0_chunks,
            owner_email=owner_email,
            max_levels=max_levels
        )
        
        logger.info("RAPTOR tree building complete")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                **stats
            })
        }
    
    except Exception as e:
        logger.error(f"Error in RAPTOR builder: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}'
            })
        }


# For testing
if __name__ == "__main__":
    # Test clustering
    test_event = {
        'document_id': 'test-doc-123',
        'owner_email': 'test@example.com',
        'max_levels': 3
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))

