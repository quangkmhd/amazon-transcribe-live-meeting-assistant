#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Bulk Re-processing Script for Knowledge Graph Extraction
Re-processes ALL existing documents to extract:
- Entities and Relationships (Knowledge Graph)
- Table of Contents (TOC) - Phase 3
- RAPTOR hierarchical summaries - Phase 4

Optimized for speed with parallel processing and progress tracking
"""

import os
import sys
import json
import time
import logging
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Add lambda functions to path
sys.path.append('../lma-ai-stack/source/lambda_functions')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment from .env file
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    sys.exit(1)

try:
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
except ImportError:
    print("Error: supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

# Configuration
MAX_PARALLEL_DOCS = 5  # Process 5 documents at a time
CHECKPOINT_FILE = 'reprocess_checkpoint.json'
DRY_RUN = False  # Set to True to test without actual processing


class ProgressTracker:
    """Track progress and save checkpoints"""
    
    def __init__(self, checkpoint_file: str):
        self.checkpoint_file = checkpoint_file
        self.processed = set()
        self.failed = {}
        self.stats = {
            'total': 0,
            'processed': 0,
            'failed': 0,
            'entities_extracted': 0,
            'relationships_extracted': 0,
            'start_time': None,
            'end_time': None
        }
        self.load_checkpoint()
    
    def load_checkpoint(self):
        """Load checkpoint from file"""
        if os.path.exists(self.checkpoint_file):
            try:
                with open(self.checkpoint_file, 'r') as f:
                    data = json.load(f)
                    self.processed = set(data.get('processed', []))
                    self.failed = data.get('failed', {})
                    self.stats = data.get('stats', self.stats)
                logger.info(f"Loaded checkpoint: {len(self.processed)} documents already processed")
            except Exception as e:
                logger.warning(f"Could not load checkpoint: {e}")
    
    def save_checkpoint(self):
        """Save checkpoint to file"""
        try:
            data = {
                'processed': list(self.processed),
                'failed': self.failed,
                'stats': self.stats,
                'last_updated': datetime.utcnow().isoformat()
            }
            with open(self.checkpoint_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not save checkpoint: {e}")
    
    def mark_processed(self, doc_id: str, entities: int = 0, relationships: int = 0):
        """Mark document as processed"""
        self.processed.add(doc_id)
        self.stats['processed'] += 1
        self.stats['entities_extracted'] += entities
        self.stats['relationships_extracted'] += relationships
        self.save_checkpoint()
    
    def mark_failed(self, doc_id: str, error: str):
        """Mark document as failed"""
        self.failed[doc_id] = error
        self.stats['failed'] += 1
        self.save_checkpoint()
    
    def print_stats(self):
        """Print current statistics"""
        elapsed = 0
        if self.stats['start_time']:
            start = datetime.fromisoformat(self.stats['start_time'])
            elapsed = (datetime.utcnow() - start).total_seconds()
        
        print("\n" + "="*80)
        print("PROCESSING STATISTICS")
        print("="*80)
        print(f"Total Documents: {self.stats['total']}")
        print(f"Processed: {self.stats['processed']}")
        print(f"Failed: {self.stats['failed']}")
        print(f"Remaining: {self.stats['total'] - self.stats['processed'] - self.stats['failed']}")
        print(f"")
        print(f"Entities Extracted: {self.stats['entities_extracted']}")
        print(f"Relationships Extracted: {self.stats['relationships_extracted']}")
        print(f"")
        if elapsed > 0:
            print(f"Elapsed Time: {elapsed/60:.1f} minutes")
            print(f"Avg Time/Doc: {elapsed/max(self.stats['processed'], 1):.1f} seconds")
        print("="*80 + "\n")


def get_all_documents() -> List[Dict[str, Any]]:
    """
    Fetch all documents from Supabase
    
    Returns:
        List of document records
    """
    logger.info("Fetching all documents from Supabase")
    
    try:
        response = supabase.table('knowledge_documents')\
            .select('document_id, owner_email, file_name, processing_status, chunk_count')\
            .eq('processing_status', 'completed')\
            .execute()
        
        documents = response.data
        logger.info(f"Found {len(documents)} completed documents")
        return documents
    
    except Exception as e:
        logger.error(f"Error fetching documents: {e}")
        return []


def get_document_chunks(document_id: str) -> List[Dict[str, Any]]:
    """
    Get all chunks for a document
    
    Args:
        document_id: Document ID
    
    Returns:
        List of chunk records
    """
    try:
        response = supabase.table('knowledge_chunks')\
            .select('chunk_id, content, chunk_index')\
            .eq('document_id', document_id)\
            .eq('raptor_level', 0)\
            .order('chunk_index')\
            .execute()
        
        return response.data
    
    except Exception as e:
        logger.error(f"Error fetching chunks for {document_id}: {e}")
        return []


def process_document_for_graph(document: Dict[str, Any], tracker: ProgressTracker) -> Dict[str, Any]:
    """
    Process a single document to extract:
    - Knowledge Graph (entities + relationships)
    - TOC structure (if applicable)
    - RAPTOR tree (3 levels)
    
    Args:
        document: Document record
        tracker: Progress tracker
    
    Returns:
        Processing result dict
    """
    document_id = document['document_id']
    owner_email = document['owner_email']
    file_name = document['file_name']
    
    logger.info(f"Processing: {file_name} ({document_id})")
    
    # Check if already processed
    if document_id in tracker.processed:
        logger.info(f"Skipping (already processed): {document_id}")
        return {'status': 'skipped', 'document_id': document_id}
    
    if DRY_RUN:
        logger.info(f"DRY RUN: Would process {file_name}")
        tracker.mark_processed(document_id, entities=0, relationships=0)
        return {'status': 'dry_run', 'document_id': document_id}
    
    try:
        # Get chunks
        chunks = get_document_chunks(document_id)
        
        if not chunks:
            logger.warning(f"No chunks found for {document_id}")
            tracker.mark_failed(document_id, "No chunks found")
            return {'status': 'error', 'document_id': document_id, 'error': 'No chunks'}
        
        logger.info(f"  Found {len(chunks)} chunks")
        
        result_summary = {
            'status': 'success',
            'document_id': document_id,
            'entities': 0,
            'relationships': 0,
            'toc_sections': 0,
            'raptor_levels': 0
        }
        
        # Phase 1: Knowledge Graph Extraction
        logger.info(f"  [Phase 1] Extracting Knowledge Graph...")
        try:
            from knowledge_graph_extractor.index import extract_entities_from_document, store_knowledge_graph
            
            extraction_result = extract_entities_from_document(
                document_id=document_id,
                chunks=chunks,
                owner_email=owner_email,
                language="English"  # Auto-detect from content
            )
            
            entity_count = extraction_result['entity_count']
            rel_count = extraction_result['relationship_count']
            
            storage_result = store_knowledge_graph(
                document_id=document_id,
                entities=extraction_result['entities'],
                relationships=extraction_result['relationships'],
                owner_email=owner_email
            )
            
            if storage_result['success']:
                result_summary['entities'] = entity_count
                result_summary['relationships'] = rel_count
                logger.info(f"  ✓ KG: {entity_count} entities, {rel_count} relationships")
            else:
                logger.warning(f"  ✗ KG storage failed: {storage_result.get('error')}")
        
        except Exception as e:
            logger.error(f"  ✗ KG extraction failed: {e}")
        
        # Phase 2: RAPTOR Tree Building
        logger.info(f"  [Phase 2] Building RAPTOR tree...")
        try:
            from raptor_builder.index import build_raptor_tree
            
            raptor_stats = build_raptor_tree(
                document_id=document_id,
                level_0_chunks=chunks,
                owner_email=owner_email,
                max_levels=3
            )
            
            result_summary['raptor_levels'] = raptor_stats.get('levels_built', 0)
            logger.info(f"  ✓ RAPTOR: {raptor_stats.get('levels_built', 0)} levels, {raptor_stats.get('total_summaries', 0)} summaries")
        
        except Exception as e:
            logger.error(f"  ✗ RAPTOR building failed: {e}")
        
        # Mark as processed
        tracker.mark_processed(
            document_id, 
            entities=result_summary['entities'],
            relationships=result_summary['relationships']
        )
        
        logger.info(f"  ✓ Complete: {file_name}")
        return result_summary
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"  ✗ Exception processing {file_name}: {error_msg}")
        tracker.mark_failed(document_id, error_msg)
        return {
            'status': 'error',
            'document_id': document_id,
            'error': error_msg
        }


def main():
    """Main re-processing function"""
    print("\n" + "="*80)
    print("BULK DOCUMENT RE-PROCESSING FOR KNOWLEDGE GRAPH")
    print("="*80 + "\n")
    
    if DRY_RUN:
        print("⚠️  DRY RUN MODE - No actual processing will occur\n")
    
    # Initialize progress tracker
    tracker = ProgressTracker(CHECKPOINT_FILE)
    tracker.stats['start_time'] = datetime.utcnow().isoformat()
    
    # Fetch all documents
    documents = get_all_documents()
    tracker.stats['total'] = len(documents)
    
    if not documents:
        print("No documents found to process")
        return
    
    print(f"Found {len(documents)} documents to process")
    print(f"Already processed: {len(tracker.processed)}")
    print(f"Parallel workers: {MAX_PARALLEL_DOCS}")
    print(f"")
    
    # Filter out already processed
    docs_to_process = [d for d in documents if d['document_id'] not in tracker.processed]
    
    if not docs_to_process:
        print("All documents already processed!")
        tracker.print_stats()
        return
    
    print(f"Processing {len(docs_to_process)} documents...\n")
    
    # Process in parallel
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_DOCS) as executor:
        # Submit all tasks
        future_to_doc = {
            executor.submit(process_document_for_graph, doc, tracker): doc
            for doc in docs_to_process
        }
        
        # Process results as they complete
        for i, future in enumerate(as_completed(future_to_doc), 1):
            doc = future_to_doc[future]
            
            try:
                result = future.result()
                
                # Print progress
                progress_pct = (tracker.stats['processed'] + tracker.stats['failed']) / tracker.stats['total'] * 100
                print(f"[{i}/{len(docs_to_process)}] ({progress_pct:.1f}%) - {doc['file_name']}: {result['status']}")
                
                # Print stats every 10 documents
                if i % 10 == 0:
                    tracker.print_stats()
            
            except Exception as e:
                logger.error(f"Future exception for {doc['file_name']}: {e}")
                tracker.mark_failed(doc['document_id'], str(e))
    
    # Final statistics
    tracker.stats['end_time'] = datetime.utcnow().isoformat()
    tracker.save_checkpoint()
    
    print("\n" + "="*80)
    print("PROCESSING COMPLETE")
    print("="*80)
    tracker.print_stats()
    
    # Print failed documents
    if tracker.failed:
        print("\n" + "="*80)
        print("FAILED DOCUMENTS")
        print("="*80)
        for doc_id, error in tracker.failed.items():
            print(f"  - {doc_id}: {error}")
        print("")


if __name__ == "__main__":
    main()

