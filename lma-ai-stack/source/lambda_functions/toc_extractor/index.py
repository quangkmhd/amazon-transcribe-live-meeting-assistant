#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Table of Contents (TOC) Extractor
Detects and extracts TOC structure from documents using Gemini
Implements RAGFlow's TOC extraction strategy
"""

import os
import json
import logging
import requests
import re
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'


def call_gemini(prompt: str, max_tokens: int = 2048) -> str:
    """Call Gemini API"""
    try:
        url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL}:generateContent"
        params = {'key': GEMINI_API_KEY}
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": max_tokens,
                "topP": 0.95
            }
        }
        
        response = requests.post(url, params=params, json=payload, timeout=60)
        
        if response.status_code != 200:
            logger.error(f"Gemini API error: {response.status_code}")
            return ""
        
        result = response.json()
        if 'candidates' in result and result['candidates']:
            parts = result['candidates'][0].get('content', {}).get('parts', [])
            if parts and 'text' in parts[0]:
                return parts[0]['text']
        
        return ""
    
    except Exception as e:
        logger.error(f"Error calling Gemini: {e}")
        return ""


def detect_table_of_contents(first_pages: List[str]) -> List[str]:
    """
    Detect if document has TOC in first pages
    
    Args:
        first_pages: List of first ~10 pages as text
    
    Returns:
        List of pages containing TOC (empty if no TOC)
    """
    toc_pages = []
    
    for i, page_text in enumerate(first_pages[:10]):
        # RAGFlow TOC detection prompt
        prompt = f"""You are an AI assistant designed to analyze text content and detect whether a table of contents (TOC) list exists on the given page.

Indicators of a TOC:
- Numbered or hierarchical structure (1, 1.1, 1.2 or Chapter 1, Section 1.1)
- Page numbers or references
- Phrases like "Table of Contents", "Contents", or similar headings
- List of chapter/section titles

Page Text:
{page_text[:2000]}

Return JSON: {{"exists": true/false, "confidence": 0.0-1.0}}

JSON Response:"""
        
        response = call_gemini(prompt, max_tokens=256)
        
        try:
            json_match = re.search(r'\{[^}]*"exists"[^}]*\}', response)
            if json_match:
                data = json.loads(json_match.group())
                if data.get('exists') and data.get('confidence', 0) > 0.6:
                    toc_pages.append(page_text)
                    logger.info(f"TOC detected on page {i+1}")
                elif toc_pages:
                    # Stop if we had TOC pages but this one doesn't
                    break
        except Exception as e:
            logger.warning(f"Error parsing TOC detection response: {e}")
            continue
    
    return toc_pages


def extract_toc_structure(toc_pages: List[str]) -> List[Dict[str, Any]]:
    """
    Extract TOC structure from pages
    
    Args:
        toc_pages: Pages containing TOC
    
    Returns:
        List of TOC entries with structure, title, page
    """
    if not toc_pages:
        return []
    
    toc_text = "\n\n".join(toc_pages)
    
    # RAGFlow TOC extraction prompt
    prompt = f"""You are an expert parser and data formatter. Your task is to analyze the provided table of contents (TOC) text and convert it into a valid JSON array of objects.

Each object should have:
- "structure": The numeric hierarchy index (e.g., "1", "1.1", "1.2", "2", "2.1")
- "title": The section/chapter title
- "page": The page number (as integer, or null if not available)

Rules:
1. Preserve the hierarchical structure using dot notation
2. Extract page numbers when available
3. Clean up formatting (remove extra spaces, special characters)
4. Return ONLY valid JSON array, no explanation

Table of Contents:
{toc_text}

JSON Response:"""
    
    response = call_gemini(prompt, max_tokens=4096)
    
    try:
        # Extract JSON array from response
        json_match = re.search(r'\[[\s\S]*\]', response)
        if json_match:
            toc_structure = json.loads(json_match.group())
            logger.info(f"Extracted {len(toc_structure)} TOC entries")
            return toc_structure
        else:
            logger.warning("No JSON array found in TOC extraction response")
            return []
    
    except Exception as e:
        logger.error(f"Error parsing TOC structure: {e}")
        return []


def map_chunks_to_toc(
    chunks: List[Dict[str, Any]],
    toc_structure: List[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """
    Map each chunk to its TOC section
    
    Args:
        chunks: List of document chunks
        toc_structure: Extracted TOC structure
    
    Returns:
        Dict mapping chunk_id to TOC section info
    """
    if not toc_structure:
        return {}
    
    chunk_to_section = {}
    
    # Simple heuristic: map chunks sequentially to TOC sections
    # In production, would use page numbers or heading detection
    chunks_per_section = max(1, len(chunks) // len(toc_structure))
    
    for i, chunk in enumerate(chunks):
        section_index = min(i // chunks_per_section, len(toc_structure) - 1)
        section = toc_structure[section_index]
        
        chunk_to_section[chunk['chunk_id']] = {
            'structure': section.get('structure', ''),
            'title': section.get('title', ''),
            'page': section.get('page'),
            'section_index': section_index
        }
    
    return chunk_to_section


def lambda_handler(event, context):
    """
    Lambda handler for TOC extraction
    
    Expected event structure:
    {
        "document_id": "doc-uuid",
        "document_text": "full document text",
        "chunks": [{"chunk_id": "...", "content": "..."}]
    }
    """
    try:
        logger.info("TOC Extractor - Processing event")
        
        document_id = event.get('document_id')
        document_text = event.get('document_text', '')
        chunks = event.get('chunks', [])
        
        if not document_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'document_id required'})
            }
        
        # Split into pages (rough approximation: 2000 chars/page)
        page_size = 2000
        pages = [document_text[i:i+page_size] for i in range(0, len(document_text), page_size)]
        
        # Detect TOC
        logger.info(f"Detecting TOC in first {min(len(pages), 10)} pages")
        toc_pages = detect_table_of_contents(pages[:10])
        
        if not toc_pages:
            logger.info("No TOC detected")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'has_toc': False,
                    'toc_structure': [],
                    'chunk_mappings': {}
                })
            }
        
        # Extract TOC structure
        logger.info(f"Extracting TOC structure from {len(toc_pages)} pages")
        toc_structure = extract_toc_structure(toc_pages)
        
        if not toc_structure:
            logger.warning("TOC detected but extraction failed")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'has_toc': False,
                    'toc_structure': [],
                    'chunk_mappings': {}
                })
            }
        
        # Map chunks to TOC sections
        chunk_mappings = map_chunks_to_toc(chunks, toc_structure)
        
        logger.info(f"TOC extraction complete: {len(toc_structure)} sections, {len(chunk_mappings)} chunks mapped")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'has_toc': True,
                'toc_structure': toc_structure,
                'chunk_mappings': chunk_mappings,
                'toc_entry_count': len(toc_structure)
            })
        }
    
    except Exception as e:
        logger.error(f"Error in TOC extractor: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal error: {str(e)}'})
        }


# For testing
if __name__ == "__main__":
    test_text = """
Table of Contents

1. Introduction ................. 1
   1.1 Background ............... 2
   1.2 Objectives ............... 3

2. Methodology .................. 5
   2.1 Data Collection .......... 6
   2.2 Analysis ................. 8

3. Results ..................... 10
"""
    
    pages = [test_text]
    toc_pages = detect_table_of_contents(pages)
    if toc_pages:
        structure = extract_toc_structure(toc_pages)
        print(json.dumps(structure, indent=2))

