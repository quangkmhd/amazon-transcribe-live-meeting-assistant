#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Document Processing Pipeline for RAG Knowledge Base
Handles: Upload → Parse → Chunk → Embed → Store
"""

import os
import json
import uuid
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

# Supabase client
try:
    from supabase import create_client, Client
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client

# Import our custom modules
from document_parsers import (
    DocumentParserFactory, 
    TextChunker,
    extract_embedded_files
)

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


class DocumentProcessor:
    """
    Enhanced Document Processing Pipeline
    Features: Context-aware chunking, Embedded file extraction, 30+ file formats
    
    ALL FEATURES ARE LIGHTWEIGHT - NO GPU/ML MODELS REQUIRED
    """
    
    def __init__(self):
        self.parser_factory = DocumentParserFactory()
        self.chunker = TextChunker(chunk_size=512, overlap=50)
        self.embedding_service = GeminiEmbeddingService()
        self.max_recursion_depth = 2  # Limit embedded file recursion
    
    def process_document(
        self, 
        file_content: bytes, 
        filename: str, 
        owner_email: str,
        metadata: Optional[Dict[str, Any]] = None,
        recursion_depth: int = 0
    ) -> Dict[str, Any]:
        """
        Enhanced document processing with embedded file extraction and context-aware chunking
        
        NEW FEATURES (all lightweight):
        - Extracts and processes embedded files (DOCX with embedded PDFs, etc.)
        - Context-aware chunking (preserves heading hierarchy)
        - Table location tracking
        - 30+ file format support
        
        Args:
            file_content: Binary content of the file
            filename: Original filename
            owner_email: Email of document owner
            metadata: Optional metadata (author, title, etc.)
            recursion_depth: Current recursion depth for embedded files
        
        Returns:
            Dict with processing results
        """
        try:
            document_id = str(uuid.uuid4())
            logger.info(f"Processing document {filename} (ID: {document_id}, depth: {recursion_depth})")
            
            # Step 0: Extract embedded files (NEW FEATURE)
            embedded_results = []
            if recursion_depth < self.max_recursion_depth:
                logger.info("Step 0: Checking for embedded files...")
                embedded_files = extract_embedded_files(file_content)
                
                if embedded_files:
                    logger.info(f"Found {len(embedded_files)} embedded files")
                    for embed_name, embed_content in embedded_files:
                        try:
                            # Safety: Skip if embedded content is too small (likely corrupt)
                            if len(embed_content) < 100:
                                logger.warning(f"Skipping tiny embedded file {embed_name}: {len(embed_content)} bytes")
                                continue
                            
                            # Process embedded file recursively
                            embed_result = self.process_document(
                                embed_content,
                                embed_name,
                                owner_email,
                                {'parent_document': filename, 'embedded': True},
                                recursion_depth + 1
                            )
                            if embed_result['success']:
                                embedded_results.append(embed_result)
                            else:
                                logger.warning(f"Embedded file {embed_name} failed: {embed_result.get('error', 'Unknown error')}")
                        except Exception as e:
                            logger.error(f"Exception processing embedded file {embed_name}: {e}", exc_info=True)
            
            # Step 1: Parse document
            logger.info("Step 1: Parsing document...")
            text = self.parser_factory.parse_document(file_content, filename)
            
            if not text or not text.strip():
                raise ValueError("No text content extracted from document")
            
            logger.info(f"Extracted {len(text)} characters")
            
            # Step 2: Create document record
            logger.info("Step 2: Creating document record...")
            file_size = len(file_content)
            file_type = filename.split('.')[-1].lower()
            
            doc_metadata = metadata or {}
            doc_metadata['embedded_file_count'] = len(embedded_results)
            doc_metadata['recursion_depth'] = recursion_depth
            
            doc_record = {
                'document_id': document_id,
                'owner_email': owner_email,
                'file_name': filename,
                'file_type': file_type,
                'file_size': file_size,
                'storage_path': f"{owner_email}/{document_id}/{filename}",
                'processing_status': 'processing',
                'metadata': doc_metadata
            }
            
            response = supabase.table('knowledge_documents').insert(doc_record).execute()
            logger.info(f"Created document record: {response.data}")
            
            # Step 3: Context-aware chunking (NEW FEATURE)
            logger.info("Step 3: Context-aware chunking...")
            enhanced_chunks = self.chunker.chunk_text_with_context(
                text, 
                filename, 
                strategy='paragraphs'
            )
            logger.info(f"Created {len(enhanced_chunks)} context-aware chunks")
            
            # Step 4: Generate embeddings (use enhanced text with context)
            logger.info("Step 4: Generating embeddings...")
            chunk_texts = [c['enhanced_text'] for c in enhanced_chunks]
            embeddings = self.embedding_service.generate_embeddings_batch(
                chunk_texts, 
                task_type="RETRIEVAL_DOCUMENT"
            )
            logger.info(f"Generated {len(embeddings)} embeddings")
            
            # SAFETY CHECK: Verify embeddings count matches chunks count
            if len(embeddings) != len(enhanced_chunks):
                error_msg = f"Embedding count mismatch: {len(embeddings)} embeddings for {len(enhanced_chunks)} chunks"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            # Step 5: Store chunks with embeddings and context
            logger.info("Step 5: Storing chunks...")
            chunk_records = []
            
            for idx, (chunk_data, embedding) in enumerate(zip(enhanced_chunks, embeddings)):
                chunk_id = f"{document_id}_{idx}"
                chunk_record = {
                    'chunk_id': chunk_id,
                    'document_id': document_id,
                    'owner_email': owner_email,
                    'chunk_index': idx,
                    'content': chunk_data['content'],
                    'content_length': len(chunk_data['content']),
                    'embedding': embedding,
                    'metadata': {
                        'chunk_index': idx,
                        'total_chunks': len(enhanced_chunks),
                        'context': chunk_data['context'],  # NEW: Store context
                        'enhanced_text': chunk_data['enhanced_text']  # NEW: Store enhanced version
                    }
                }
                chunk_records.append(chunk_record)
            
            # Batch insert chunks
            if chunk_records:
                response = supabase.table('knowledge_chunks').insert(chunk_records).execute()
                logger.info(f"Stored {len(chunk_records)} chunks")
            
            # Step 6: Update document status
            logger.info("Step 6: Updating document status...")
            supabase.table('knowledge_documents').update({
                'processing_status': 'completed',
                'chunk_count': len(enhanced_chunks)
            }).eq('document_id', document_id).execute()
            
            logger.info(f"Document processing completed: {document_id}")
            
            return {
                'success': True,
                'document_id': document_id,
                'filename': filename,
                'chunk_count': len(enhanced_chunks),
                'total_characters': len(text),
                'embedded_documents': len(embedded_results),
                'embedded_results': embedded_results
            }
        
        except Exception as e:
            logger.error(f"Error processing document: {str(e)}")
            
            # Update document status to failed
            if 'document_id' in locals():
                try:
                    supabase.table('knowledge_documents').update({
                        'processing_status': 'failed',
                        'processing_error': str(e)
                    }).eq('document_id', document_id).execute()
                except:
                    pass
            
            return {
                'success': False,
                'error': str(e)
            }
    
    def delete_document(self, document_id: str, owner_email: str) -> Dict[str, Any]:
        """
        Delete a document and all its chunks
        
        Args:
            document_id: Document ID
            owner_email: Owner email for verification
        
        Returns:
            Dict with deletion results
        """
        try:
            logger.info(f"Deleting document {document_id}")
            
            # Verify ownership
            doc_response = supabase.table('knowledge_documents').select('*').eq(
                'document_id', document_id
            ).eq('owner_email', owner_email).execute()
            
            if not doc_response.data:
                return {
                    'success': False,
                    'error': 'Document not found or access denied'
                }
            
            # Delete chunks (CASCADE will handle this, but explicit is clearer)
            supabase.table('knowledge_chunks').delete().eq(
                'document_id', document_id
            ).execute()
            
            # Delete document record
            supabase.table('knowledge_documents').delete().eq(
                'document_id', document_id
            ).execute()
            
            # Delete from storage
            doc = doc_response.data[0]
            storage_path = doc.get('storage_path')
            if storage_path:
                try:
                    supabase.storage.from_('knowledge-documents').remove([storage_path])
                except:
                    logger.warning(f"Could not delete file from storage: {storage_path}")
            
            logger.info(f"Document deleted: {document_id}")
            
            return {
                'success': True,
                'document_id': document_id
            }
        
        except Exception as e:
            logger.error(f"Error deleting document: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }


def lambda_handler(event, context):
    """
    Lambda handler for document processing
    
    Expected event structure:
    {
        "operation": "process" | "delete" | "list",
        "file_content": "base64_encoded_content" (for process),
        "filename": "document.pdf",
        "owner_email": "user@example.com",
        "metadata": {...} (optional),
        "document_id": "uuid" (for delete)
    }
    """
    try:
        logger.info(f"Document processor - Processing event")
        
        operation = event.get('operation', 'process')
        owner_email = event.get('owner_email')
        
        if not owner_email:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'owner_email is required'
                })
            }
        
        processor = DocumentProcessor()
        
        if operation == 'process':
            # Decode base64 content
            import base64
            file_content_b64 = event.get('file_content')
            filename = event.get('filename')
            metadata = event.get('metadata', {})
            
            if not file_content_b64 or not filename:
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'file_content and filename are required'
                    })
                }
            
            file_content = base64.b64decode(file_content_b64)
            
            result = processor.process_document(
                file_content, 
                filename, 
                owner_email, 
                metadata
            )
            
            if result['success']:
                return {
                    'statusCode': 200,
                    'body': json.dumps(result)
                }
            else:
                return {
                    'statusCode': 500,
                    'body': json.dumps(result)
                }
        
        elif operation == 'delete':
            document_id = event.get('document_id')
            
            if not document_id:
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'document_id is required'
                    })
                }
            
            result = processor.delete_document(document_id, owner_email)
            
            if result['success']:
                return {
                    'statusCode': 200,
                    'body': json.dumps(result)
                }
            else:
                return {
                    'statusCode': 500,
                    'body': json.dumps(result)
                }
        
        elif operation == 'list':
            # List user's documents
            response = supabase.table('knowledge_documents').select('*').eq(
                'owner_email', owner_email
            ).order('upload_date', desc=True).execute()
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'documents': response.data
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
        logger.error(f"Error in document processor: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}'
            })
        }


# For testing
if __name__ == "__main__":
    # Test document processing
    test_text = """
# Test Document

This is a test document for the RAG knowledge base.

## Section 1
This section contains important information about machine learning.

## Section 2
This section discusses artificial intelligence applications.
"""
    
    processor = DocumentProcessor()
    
    # Simulate processing
    result = processor.process_document(
        test_text.encode('utf-8'),
        'test.md',
        'test@example.com',
        {'title': 'Test Document', 'author': 'Test User'}
    )
    
    print(json.dumps(result, indent=2))


