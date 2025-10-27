#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Knowledge Graph Extractor
Extracts entities and relationships from documents using Gemini
Implements RAGFlow's entity extraction strategy (LightRAG-style)
"""

import os
import json
import logging
import hashlib
import requests
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

# Supabase configuration
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

# Import embedding service
import sys
sys.path.append('../embedding_service')
from gemini_embeddings import GeminiEmbeddingService

# RAGFlow-style configuration
TUPLE_DELIMITER = "<|>"
RECORD_DELIMITER = "##"
COMPLETION_DELIMITER = "<|COMPLETE|>"
DEFAULT_ENTITY_TYPES = ["organization", "person", "location", "event", "concept", "action", "rule", "condition"]


def generate_entity_id(entity_name: str, entity_type: str) -> str:
    """Generate unique ID for entity"""
    content = f"{entity_name}_{entity_type}".lower()
    return hashlib.md5(content.encode()).hexdigest()[:16]


def generate_relationship_id(from_entity: str, to_entity: str, rel_type: str) -> str:
    """Generate unique ID for relationship"""
    content = f"{from_entity}_{to_entity}_{rel_type}".lower()
    return hashlib.md5(content.encode()).hexdigest()[:16]


def call_gemini_for_extraction(prompt: str) -> str:
    """
    Call Gemini API for entity/relationship extraction
    
    Args:
        prompt: RAGFlow-style extraction prompt
    
    Returns:
        Gemini response text
    """
    try:
        url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL}:generateContent"
        params = {'key': GEMINI_API_KEY}
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.3,  # Moderate temp for consistent extraction
                "maxOutputTokens": 4096,  # Need longer output for entities
                "topP": 0.95
            }
        }
        
        response = requests.post(
            url,
            params=params,
            json=payload,
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"Gemini API error: {response.status_code} - {response.text}")
            return ""
        
        result = response.json()
        
        # Extract text from response
        if 'candidates' in result and len(result['candidates']) > 0:
            candidate = result['candidates'][0]
            if 'content' in candidate:
                parts = candidate['content'].get('parts', [])
                if parts and 'text' in parts[0]:
                    return parts[0]['text']
        
        return ""
    
    except Exception as e:
        logger.error(f"Error calling Gemini: {str(e)}")
        return ""


def parse_extraction_response(response_text: str) -> Tuple[List[Dict], List[Dict], List[str]]:
    """
    Parse Gemini's entity extraction response (RAGFlow format)
    
    Args:
        response_text: Gemini response with entities and relationships
    
    Returns:
        Tuple of (entities, relationships, content_keywords)
    """
    entities = []
    relationships = []
    content_keywords = []
    
    try:
        # Split by record delimiter
        records = response_text.split(RECORD_DELIMITER)
        
        for record in records:
            record = record.strip()
            if not record or COMPLETION_DELIMITER in record:
                continue
            
            # Parse entity: ("entity"<|>name<|>type<|>description)
            entity_match = re.search(
                rf'\("entity"{re.escape(TUPLE_DELIMITER)}([^{re.escape(TUPLE_DELIMITER)}]+){re.escape(TUPLE_DELIMITER)}([^{re.escape(TUPLE_DELIMITER)}]+){re.escape(TUPLE_DELIMITER)}(.+?)\)',
                record
            )
            
            if entity_match:
                entity_name = entity_match.group(1).strip().strip('"')
                entity_type = entity_match.group(2).strip().strip('"')
                entity_desc = entity_match.group(3).strip().strip('"')
                
                entities.append({
                    'entity_name': entity_name,
                    'entity_type': entity_type,
                    'description': entity_desc
                })
                continue
            
            # Parse relationship: ("relationship"<|>source<|>target<|>desc<|>keywords<|>strength)
            rel_match = re.search(
                rf'\("relationship"{re.escape(TUPLE_DELIMITER)}([^{re.escape(TUPLE_DELIMITER)}]+){re.escape(TUPLE_DELIMITER)}([^{re.escape(TUPLE_DELIMITER)}]+){re.escape(TUPLE_DELIMITER)}([^{re.escape(TUPLE_DELIMITER)}]+){re.escape(TUPLE_DELIMITER)}([^{re.escape(TUPLE_DELIMITER)}]+){re.escape(TUPLE_DELIMITER)}(\d+)\)',
                record
            )
            
            if rel_match:
                source = rel_match.group(1).strip().strip('"')
                target = rel_match.group(2).strip().strip('"')
                desc = rel_match.group(3).strip().strip('"')
                keywords = rel_match.group(4).strip().strip('"')
                strength = int(rel_match.group(5))
                
                relationships.append({
                    'from_entity': source,
                    'to_entity': target,
                    'description': desc,
                    'keywords': keywords.split(',') if keywords else [],
                    'strength': strength
                })
                continue
            
            # Parse content keywords: ("content_keywords"<|>keywords)
            kw_match = re.search(
                rf'\("content_keywords"{re.escape(TUPLE_DELIMITER)}(.+?)\)',
                record
            )
            
            if kw_match:
                keywords_str = kw_match.group(1).strip().strip('"')
                content_keywords = [kw.strip() for kw in keywords_str.split(',')]
        
        logger.info(f"Parsed {len(entities)} entities, {len(relationships)} relationships")
        return entities, relationships, content_keywords
    
    except Exception as e:
        logger.error(f"Error parsing extraction response: {e}")
        return [], [], []


def extract_entities_from_chunk(
    chunk_text: str,
    language: str = "English",
    entity_types: Optional[List[str]] = None
) -> Tuple[List[Dict], List[Dict], List[str]]:
    """
    Extract entities and relationships from a text chunk using Gemini
    
    Uses RAGFlow's entity extraction prompt template
    
    Args:
        chunk_text: Text chunk to process
        language: Output language
        entity_types: List of entity types to extract
    
    Returns:
        Tuple of (entities, relationships, keywords)
    """
    logger.info(f"🧬 [KG DEBUG] Extracting entities from chunk ({len(chunk_text)} chars)")
    
    if not chunk_text or not chunk_text.strip():
        return [], [], []
    
    entity_types = entity_types or DEFAULT_ENTITY_TYPES
    entity_types_str = ", ".join(entity_types)
    
    # RAGFlow entity extraction prompt (from graphrag/light/graph_prompt.py)
    prompt = f"""---Goal---
Given a text document, identify all entities and relationships.
Use {language} as output language.

---Steps---
1. Identify all entities. For each identified entity, extract:
- entity_name: Name of the entity (use same language as input text)
- entity_type: One of: [{entity_types_str}]
- entity_description: Comprehensive description based ONLY on the input text

Format: ("entity"{TUPLE_DELIMITER}<entity_name>{TUPLE_DELIMITER}<entity_type>{TUPLE_DELIMITER}<entity_description>)

2. Identify all pairs of (source_entity, target_entity) that are clearly related.
Extract:
- source_entity: name from step 1
- target_entity: name from step 1  
- relationship_description: why they are related
- relationship_keywords: high-level keywords
- relationship_strength: numeric score 0-10

Format: ("relationship"{TUPLE_DELIMITER}<source_entity>{TUPLE_DELIMITER}<target_entity>{TUPLE_DELIMITER}<description>{TUPLE_DELIMITER}<keywords>{TUPLE_DELIMITER}<strength>)

3. Identify high-level keywords summarizing main concepts.

Format: ("content_keywords"{TUPLE_DELIMITER}<keywords>)

4. Return output as list using **{RECORD_DELIMITER}** as delimiter.

5. When finished, output {COMPLETION_DELIMITER}

---Real Data---
Entity_types: [{entity_types_str}]
Text:
{chunk_text}

Output:"""
    
    # Call Gemini
    logger.info(f"🧬 [KG DEBUG] Calling Gemini for extraction...")
    response = call_gemini_for_extraction(prompt)
    
    logger.info(f"🧬 [KG DEBUG] Gemini response length: {len(response)} chars")
    
    if not response:
        logger.warning("🧬 [KG WARN] Empty response from Gemini")
        return [], [], []
    
    # Parse response
    logger.info(f"🧬 [KG DEBUG] Parsing extraction response...")
    entities, relationships, keywords = parse_extraction_response(response)
    
    logger.info(f"🧬 [KG DEBUG] Extraction result:")
    logger.info(f"🧬 [KG DEBUG]   - Entities: {len(entities)}")
    logger.info(f"🧬 [KG DEBUG]   - Relationships: {len(relationships)}")
    logger.info(f"🧬 [KG DEBUG]   - Keywords: {len(keywords)}")
    
    return entities, relationships, keywords


def merge_duplicate_entities(entities: List[Dict]) -> List[Dict]:
    """
    Merge duplicate entities by name (case-insensitive)
    
    Args:
        entities: List of entity dicts
    
    Returns:
        Deduplicated list of entities
    """
    entity_map = {}
    
    for entity in entities:
        name_key = entity['entity_name'].lower().strip()
        
        if name_key in entity_map:
            # Merge descriptions
            existing = entity_map[name_key]
            if entity['description'] and entity['description'] not in existing['description']:
                existing['description'] += f" {entity['description']}"
        else:
            entity_map[name_key] = entity.copy()
    
    return list(entity_map.values())


def extract_entities_from_document(
    document_id: str,
    chunks: List[Dict[str, Any]],
    owner_email: str,
    language: str = "English"
) -> Dict[str, Any]:
    """
    Extract entities and relationships from all chunks in a document
    
    Args:
        document_id: Document ID
        chunks: List of chunk dicts with 'chunk_id', 'content'
        owner_email: Document owner
        language: Language for extraction
    
    Returns:
        Dict with extracted entities and relationships
    """
    logger.info(f"Extracting entities from document {document_id} ({len(chunks)} chunks)")
    
    all_entities = []
    all_relationships = []
    all_keywords = []
    
    # Extract from each chunk
    for chunk in chunks:
        chunk_id = chunk['chunk_id']
        chunk_text = chunk['content']
        
        try:
            entities, relationships, keywords = extract_entities_from_chunk(
                chunk_text,
                language=language
            )
            
            # Add source tracking
            for entity in entities:
                entity['chunk_ids'] = [chunk_id]
                entity['document_ids'] = [document_id]
            
            for relationship in relationships:
                relationship['chunk_ids'] = [chunk_id]
                relationship['document_ids'] = [document_id]
            
            all_entities.extend(entities)
            all_relationships.extend(relationships)
            all_keywords.extend(keywords)
            
            logger.info(f"Chunk {chunk_id}: {len(entities)} entities, {len(relationships)} relationships")
        
        except Exception as e:
            logger.error(f"Error extracting from chunk {chunk_id}: {e}")
            continue
    
    # Merge duplicate entities across chunks
    logger.info(f"Merging duplicate entities ({len(all_entities)} total)")
    merged_entities = merge_duplicate_entities(all_entities)
    logger.info(f"After merging: {len(merged_entities)} unique entities")
    
    # Generate embeddings for entities
    logger.info("Generating entity embeddings")
    embedding_service = GeminiEmbeddingService()
    entity_texts = [f"{e['entity_name']}: {e['description']}" for e in merged_entities]
    entity_embeddings = embedding_service.generate_embeddings_batch(
        entity_texts,
        task_type="RETRIEVAL_DOCUMENT"
    )
    
    # Add embeddings to entities
    for i, entity in enumerate(merged_entities):
        entity['embedding'] = entity_embeddings[i]
    
    return {
        'entities': merged_entities,
        'relationships': all_relationships,
        'keywords': list(set(all_keywords)),
        'entity_count': len(merged_entities),
        'relationship_count': len(all_relationships)
    }


def store_knowledge_graph(
    document_id: str,
    entities: List[Dict],
    relationships: List[Dict],
    owner_email: str
) -> Dict[str, Any]:
    """
    Store entities and relationships in Supabase
    
    Args:
        document_id: Document ID
        entities: List of entity dicts
        relationships: List of relationship dicts  
        owner_email: Document owner
    
    Returns:
        Dict with storage results
    """
    logger.info(f"Storing knowledge graph: {len(entities)} entities, {len(relationships)} relationships")
    
    try:
        # Prepare entity records
        entity_records = []
        entity_name_to_id = {}
        
        for entity in entities:
            entity_id = generate_entity_id(entity['entity_name'], entity['entity_type'])
            entity_name_to_id[entity['entity_name']] = entity_id
            
            # Convert embedding array to vector string format
            embedding_str = f"[{','.join(map(str, entity['embedding']))}]"
            
            entity_record = {
                'entity_id': entity_id,
                'entity_name': entity['entity_name'],
                'entity_type': entity['entity_type'],
                'description': entity['description'],
                'document_ids': entity.get('document_ids', [document_id]),
                'chunk_ids': entity.get('chunk_ids', []),
                'embedding': embedding_str,
                'owner_email': owner_email,
                'metadata': {
                    'extraction_date': datetime.utcnow().isoformat(),
                    'source_document': document_id
                }
            }
            entity_records.append(entity_record)
        
        # Upsert entities (merge if already exists)
        if entity_records:
            logger.info(f"Inserting {len(entity_records)} entities")
            response = supabase.table('knowledge_entities').upsert(
                entity_records,
                on_conflict='entity_id'
            ).execute()
            logger.info(f"Entities stored successfully")
        
        # Prepare relationship records
        relationship_records = []
        
        for relationship in relationships:
            from_entity = relationship['from_entity']
            to_entity = relationship['to_entity']
            
            # Get entity IDs
            from_entity_id = entity_name_to_id.get(from_entity)
            to_entity_id = entity_name_to_id.get(to_entity)
            
            if not from_entity_id or not to_entity_id:
                logger.warning(f"Skipping relationship: entity not found ({from_entity} -> {to_entity})")
                continue
            
            rel_type = relationship.get('keywords', ['related'])[0] if relationship.get('keywords') else 'related'
            relationship_id = generate_relationship_id(from_entity, to_entity, rel_type)
            
            relationship_record = {
                'relationship_id': relationship_id,
                'from_entity_id': from_entity_id,
                'to_entity_id': to_entity_id,
                'relationship_type': rel_type,
                'description': relationship['description'],
                'strength': relationship['strength'],
                'keywords': relationship.get('keywords', []),
                'document_ids': relationship.get('document_ids', [document_id]),
                'chunk_ids': relationship.get('chunk_ids', []),
                'owner_email': owner_email,
                'metadata': {
                    'extraction_date': datetime.utcnow().isoformat(),
                    'source_document': document_id
                }
            }
            relationship_records.append(relationship_record)
        
        # Upsert relationships
        if relationship_records:
            logger.info(f"Inserting {len(relationship_records)} relationships")
            response = supabase.table('knowledge_relationships').upsert(
                relationship_records,
                on_conflict='relationship_id'
            ).execute()
            logger.info(f"Relationships stored successfully")
        
        return {
            'success': True,
            'entities_stored': len(entity_records),
            'relationships_stored': len(relationship_records)
        }
    
    except Exception as e:
        logger.error(f"Error storing knowledge graph: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


def lambda_handler(event, context):
    """
    Lambda handler for knowledge graph extraction
    
    Expected event structure:
    {
        "document_id": "doc-uuid",
        "chunks": [
            {"chunk_id": "...", "content": "..."},
            ...
        ],
        "owner_email": "user@example.com",
        "language": "English"  // optional
    }
    """
    try:
        logger.info("Knowledge Graph Extractor - Processing event")
        
        document_id = event.get('document_id')
        chunks = event.get('chunks', [])
        owner_email = event.get('owner_email')
        language = event.get('language', 'English')
        
        if not document_id or not chunks or not owner_email:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'document_id, chunks, and owner_email are required'
                })
            }
        
        # Extract entities and relationships
        extraction_result = extract_entities_from_document(
            document_id=document_id,
            chunks=chunks,
            owner_email=owner_email,
            language=language
        )
        
        # Store in database
        storage_result = store_knowledge_graph(
            document_id=document_id,
            entities=extraction_result['entities'],
            relationships=extraction_result['relationships'],
            owner_email=owner_email
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                **extraction_result,
                **storage_result
            })
        }
    
    except Exception as e:
        logger.error(f"Error in knowledge graph extractor: {str(e)}")
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
            "content": """Kịch bản highlight cho bóng đá:
            
            Nhóm 1: Pha dẫn đến GOAL
            - S (Start): PASS hoặc DRIVE
            - G (Goal Event): GOAL được ghi
            - E (End): Kết thúc highlight
            
            Chuỗi sự kiện: S → G → E
            """
        }
    ]
    
    result = extract_entities_from_document(
        document_id="test-doc",
        chunks=test_chunks,
        owner_email="test@example.com",
        language="Vietnamese"
    )
    
    print(json.dumps(result, indent=2, ensure_ascii=False))

