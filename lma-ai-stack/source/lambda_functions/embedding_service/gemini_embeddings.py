#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Gemini Embeddings Service
Generates vector embeddings using Google's Gemini text-embedding-004 model
"""

import os
import json
import time
import logging
from typing import List, Dict, Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_EMBEDDING_MODEL = 'text-embedding-004'  # Cheapest embedding model
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
MAX_BATCH_SIZE = 100  # Gemini's batch limit
EMBEDDING_DIMENSION = 768  # text-embedding-004 produces 768-dimensional vectors


class GeminiEmbeddingService:
    """Service for generating embeddings using Gemini API"""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Gemini Embedding Service
        
        Args:
            api_key: Gemini API key (defaults to GEMINI_API_KEY env var)
        """
        self.api_key = api_key or GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable must be set")
        
        # Setup session with retry logic
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
    
    def generate_embedding(self, text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
        """
        Generate embedding for a single text
        
        Args:
            text: Text to embed
            task_type: Task type for embedding (RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY)
        
        Returns:
            List of floats representing the embedding vector
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for embedding, returning zero vector")
            return [0.0] * EMBEDDING_DIMENSION
        
        try:
            url = f"{GEMINI_API_BASE_URL}/{GEMINI_EMBEDDING_MODEL}:embedContent"
            params = {'key': self.api_key}
            
            payload = {
                "model": f"models/{GEMINI_EMBEDDING_MODEL}",
                "content": {
                    "parts": [{
                        "text": text
                    }]
                },
                "taskType": task_type
            }
            
            response = self.session.post(
                url,
                params=params,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                embedding = result.get('embedding', {}).get('values', [])
                
                if len(embedding) != EMBEDDING_DIMENSION:
                    logger.error(f"Unexpected embedding dimension: {len(embedding)}, expected {EMBEDDING_DIMENSION}")
                    return [0.0] * EMBEDDING_DIMENSION
                
                return embedding
            else:
                logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                return [0.0] * EMBEDDING_DIMENSION
                
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
            return [0.0] * EMBEDDING_DIMENSION
    
    def generate_embeddings_batch(
        self, 
        texts: List[str], 
        task_type: str = "RETRIEVAL_DOCUMENT"
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batches
        
        Args:
            texts: List of texts to embed
            task_type: Task type for embedding
        
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        embeddings = []
        
        # Process in batches
        for i in range(0, len(texts), MAX_BATCH_SIZE):
            batch = texts[i:i + MAX_BATCH_SIZE]
            batch_embeddings = []
            
            for text in batch:
                embedding = self.generate_embedding(text, task_type)
                batch_embeddings.append(embedding)
                
                # Rate limiting: Gemini free tier has limits
                time.sleep(0.1)  # 10 requests per second
            
            embeddings.extend(batch_embeddings)
            logger.info(f"Generated {len(batch_embeddings)} embeddings (batch {i // MAX_BATCH_SIZE + 1})")
        
        return embeddings
    
    def generate_query_embedding(self, query: str) -> List[float]:
        """
        Generate embedding for a search query
        
        Args:
            query: Search query text
        
        Returns:
            Embedding vector optimized for retrieval queries
        """
        return self.generate_embedding(query, task_type="RETRIEVAL_QUERY")


def lambda_handler(event, context):
    """
    Lambda handler for embedding generation
    
    Expected event structure:
    {
        "operation": "generate" | "generate_batch" | "generate_query",
        "text": "text to embed" (for single),
        "texts": ["text1", "text2", ...] (for batch),
        "task_type": "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" (optional)
    }
    """
    try:
        logger.info(f"Embedding service - Processing event: {json.dumps(event)}")
        
        operation = event.get('operation', 'generate')
        task_type = event.get('task_type', 'RETRIEVAL_DOCUMENT')
        
        service = GeminiEmbeddingService()
        
        if operation == 'generate':
            text = event.get('text', '')
            embedding = service.generate_embedding(text, task_type)
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'embedding': embedding,
                    'dimension': len(embedding)
                })
            }
        
        elif operation == 'generate_batch':
            texts = event.get('texts', [])
            embeddings = service.generate_embeddings_batch(texts, task_type)
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'embeddings': embeddings,
                    'count': len(embeddings),
                    'dimension': EMBEDDING_DIMENSION
                })
            }
        
        elif operation == 'generate_query':
            query = event.get('text', '')
            embedding = service.generate_query_embedding(query)
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'embedding': embedding,
                    'dimension': len(embedding)
                })
            }
        
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': f'Unknown operation: {operation}'
                })
            }
    
    except Exception as e:
        logger.error(f"Error in embedding service: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}'
            })
        }


# For testing
if __name__ == "__main__":
    # Test single embedding
    service = GeminiEmbeddingService()
    
    test_text = "This is a test document about artificial intelligence and machine learning."
    embedding = service.generate_embedding(test_text)
    print(f"Generated embedding with dimension: {len(embedding)}")
    print(f"First 10 values: {embedding[:10]}")
    
    # Test query embedding
    query = "What is machine learning?"
    query_embedding = service.generate_query_embedding(query)
    print(f"\nQuery embedding dimension: {len(query_embedding)}")
    print(f"First 10 values: {query_embedding[:10]}")


