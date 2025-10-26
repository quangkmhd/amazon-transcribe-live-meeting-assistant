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
from document_parsers import DocumentParserFactory, TextChunker

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
    """Main document processing pipeline"""
    
    def __init__(self):
        self.parser_factory = DocumentParserFactory()
        self.chunker = TextChunker(chunk_size=512, overlap=50)
        self.embedding_service = GeminiEmbeddingService()
    
    def process_document(
        self, 
        file_content: bytes, 
        filename: str, 
        owner_email: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a document: parse, chunk, embed, and store
        
        Args:
            file_content: Binary content of the file
            filename: Original filename
            owner_email: Email of document owner
            metadata: Optional metadata (author, title, etc.)
        
        Returns:
            Dict with processing results
        """
        try:
            document_id = str(uuid.uuid4())
            logger.info(f"Processing document {filename} (ID: {document_id})")
            
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
            
            doc_record = {
                'document_id': document_id,
                'owner_email': owner_email,
                'file_name': filename,
                'file_type': file_type,
                'file_size': file_size,
                'storage_path': f"{owner_email}/{document_id}/{filename}",
                'processing_status': 'processing',
                'metadata': metadata or {}
            }
            
            response = supabase.table('knowledge_documents').insert(doc_record).execute()
            logger.info(f"Created document record: {response.data}")
            
            # Step 3: Chunk text
            logger.info("Step 3: Chunking text...")
            chunks = self.chunker.chunk_text(text, strategy='paragraphs')
            logger.info(f"Created {len(chunks)} chunks")
            
            # Step 4: Generate embeddings
            logger.info("Step 4: Generating embeddings...")
            embeddings = self.embedding_service.generate_embeddings_batch(
                chunks, 
                task_type="RETRIEVAL_DOCUMENT"
            )
            logger.info(f"Generated {len(embeddings)} embeddings")
            
            # Step 5: Store chunks with embeddings
            logger.info("Step 5: Storing chunks...")
            chunk_records = []
            
            for idx, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
                chunk_id = f"{document_id}_{idx}"
                chunk_record = {
                    'chunk_id': chunk_id,
                    'document_id': document_id,
                    'owner_email': owner_email,
                    'chunk_index': idx,
                    'content': chunk_text,
                    'content_length': len(chunk_text),
                    'embedding': embedding,
                    'metadata': {
                        'chunk_index': idx,
                        'total_chunks': len(chunks)
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
                'chunk_count': len(chunks)
            }).eq('document_id', document_id).execute()
            
            logger.info(f"Document processing completed: {document_id}")
            
            return {
                'success': True,
                'document_id': document_id,
                'filename': filename,
                'chunk_count': len(chunks),
                'total_characters': len(text)
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


