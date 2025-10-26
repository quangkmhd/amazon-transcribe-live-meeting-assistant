#!/usr/bin/env python3
"""
Test Debug Logging System
Test all 3 systems: LMA RAG, RAGFlow, Meeting Assistant
"""

import sys
import os

# Add utilities to path
sys.path.append('../utilities')
from debug_logger import lma_rag_logger, ragflow_logger, meeting_assistant_logger

def test_lma_rag_logger():
    """Test LMA RAG System logging"""
    print("\n" + "="*80)
    print("🧪 TESTING LMA RAG SYSTEM LOGGER")
    print("="*80 + "\n")
    
    # Start trace
    tracer = lma_rag_logger.start_trace("TEST_LMA_RAG")
    
    # Step 1: Query Processing
    tracer.start_step(
        "Query Processing",
        "Parse and validate user query",
        {"query": "What is the capital of France?", "user_email": "test@example.com"}
    )
    tracer.add_checkpoint("Query validated")
    tracer.add_checkpoint("User permissions checked")
    tracer.end_step(result={"valid": True, "query_length": 32})
    
    # Step 2: Embedding Generation
    tracer.start_step(
        "Embedding Generation",
        "Generate vector embedding with Gemini",
        {"model": "text-embedding-004", "dimension": 768}
    )
    tracer.add_checkpoint("Gemini API called")
    tracer.add_checkpoint("Embedding received")
    tracer.end_step(result={"embedding_dim": 768, "latency_ms": 145})
    
    # Step 3: Hybrid Search
    tracer.start_step(
        "Hybrid Search",
        "Search knowledge base using vector + full-text",
        {"vector_weight": 0.7, "match_count": 5}
    )
    tracer.add_checkpoint("Vector search completed")
    tracer.add_checkpoint("Full-text search completed")
    tracer.add_checkpoint("Results merged and ranked")
    tracer.end_step(result={"matches": 5, "top_score": 0.92})
    
    # Step 4: Context Assembly
    tracer.start_step(
        "Context Assembly",
        "Format retrieved documents into context",
        {"include_documents": True, "include_transcripts": False}
    )
    tracer.add_checkpoint("Documents formatted")
    tracer.add_checkpoint("Context trimmed to fit token limit")
    tracer.end_step(result={"context_length": 2048, "source_count": 5})
    
    # Step 5: Answer Generation
    tracer.start_step(
        "Answer Generation",
        "Generate answer with Gemini LLM",
        {"model": "gemini-1.5-flash", "temperature": 0.7}
    )
    tracer.add_checkpoint("Prompt constructed")
    tracer.add_checkpoint("Gemini API called")
    tracer.add_checkpoint("Answer received")
    tracer.end_step(result={"answer": "The capital of France is Paris.", "answer_length": 32})
    
    # End trace
    lma_rag_logger.end_trace(tracer.session_id)
    
    print("\n✅ LMA RAG logging test completed!\n")


def test_meeting_assistant_logger():
    """Test Meeting Assistant Chatbot logging"""
    print("\n" + "="*80)
    print("🧪 TESTING MEETING ASSISTANT CHATBOT LOGGER")
    print("="*80 + "\n")
    
    # Start trace
    tracer = meeting_assistant_logger.start_trace("TEST_MEETING_ASSISTANT")
    
    # Step 1: Receive Query
    tracer.start_step(
        "Receive Chat Query",
        "User asks question during meeting",
        {"query": "What did John say about the budget?", "call_id": "meeting-123", "user": "sarah@company.com"}
    )
    tracer.add_checkpoint("Query received via AppSync")
    tracer.add_checkpoint("User authenticated")
    tracer.end_step(result={"query_length": 36, "meeting_active": True})
    
    # Step 2: Live Transcript Retrieval
    tracer.start_step(
        "Live Transcript Retrieval",
        "Fetch last 20 segments from current meeting",
        {"call_id": "meeting-123", "last_n_segments": 20}
    )
    tracer.add_checkpoint("Query Supabase transcript_events")
    tracer.add_checkpoint("Retrieved 18 segments")
    tracer.add_checkpoint("Formatted transcript")
    tracer.end_step(result={"segments": 18, "transcript_length": 1024})
    
    # Step 3: RAG Knowledge Base Search
    tracer.start_step(
        "RAG Knowledge Base Search",
        "Search documents and past transcripts",
        {"query": "budget discussion", "doc_match_count": 3, "transcript_match_count": 2}
    )
    tracer.add_checkpoint("Embedding generated")
    tracer.add_checkpoint("Vector search completed")
    tracer.add_checkpoint("Found 3 documents, 2 past transcripts")
    tracer.end_step(result={"doc_matches": 3, "transcript_matches": 2, "total_sources": 5})
    
    # Step 4: Context Assembly
    tracer.start_step(
        "Meeting Context Assembly",
        "Combine live transcript + RAG results",
        {"has_live": True, "has_rag": True}
    )
    tracer.add_checkpoint("Live transcript added (priority)")
    tracer.add_checkpoint("RAG context added")
    tracer.add_checkpoint("Context combined")
    tracer.end_step(result={"context_length": 3072, "has_live": True, "has_rag": True})
    
    # Step 5: Prompt Construction
    tracer.start_step(
        "Prompt Construction",
        "Build prompt with system instructions",
        {"model": "gemini-1.5-flash"}
    )
    tracer.add_checkpoint("System prompt loaded")
    tracer.add_checkpoint("Context inserted")
    tracer.add_checkpoint("User query added")
    tracer.end_step(result={"prompt_length": 3500, "estimated_tokens": 875})
    
    # Step 6: Gemini Streaming Response
    tracer.start_step(
        "Gemini Streaming Response",
        "Stream answer back to user",
        {"streaming": True, "model": "gemini-2.0-flash-exp"}
    )
    tracer.add_checkpoint("Gemini API called")
    tracer.add_checkpoint("Streaming started")
    tracer.add_checkpoint("Token 1: According")
    tracer.add_checkpoint("Token 10: discussion...")
    tracer.add_checkpoint("Streaming completed")
    tracer.end_step(result={"tokens_streamed": 45, "streaming_time_ms": 2300, "complete": True})
    
    # End trace
    meeting_assistant_logger.end_trace(tracer.session_id)
    
    print("\n✅ Meeting Assistant logging test completed!\n")


def test_ragflow_logger():
    """Test RAGFlow Framework logging"""
    print("\n" + "="*80)
    print("🧪 TESTING RAGFLOW FRAMEWORK LOGGER")
    print("="*80 + "\n")
    
    # Start trace
    tracer = ragflow_logger.start_trace("TEST_RAGFLOW")
    
    # Step 1: Session Management
    tracer.start_step(
        "Session Management",
        "Create or resume conversation session",
        {"session_id": "session-456", "dialog_id": "dialog-789", "user_id": "user-123"}
    )
    tracer.add_checkpoint("Session found in database")
    tracer.add_checkpoint("Chat history loaded (8 messages)")
    tracer.end_step(result={"session_exists": True, "message_count": 8})
    
    # Step 2: Knowledge Base Retrieval
    tracer.start_step(
        "Knowledge Base Retrieval",
        "Query knowledge base with hybrid search",
        {"query": "How to install Python?", "kb_ids": ["kb-001", "kb-002"], "top_k": 12}
    )
    tracer.add_checkpoint("Embedding generated")
    tracer.add_checkpoint("Vector search in Elasticsearch")
    tracer.add_checkpoint("BM25 full-text search")
    tracer.add_checkpoint("Results fused and reranked")
    tracer.end_step(result={"matches": 12, "reranked": True, "top_score": 0.88})
    
    # Step 3: Context Assembly
    tracer.start_step(
        "Context Assembly",
        "Format retrieved chunks for LLM",
        {"max_tokens": 8192, "chunk_count": 12}
    )
    tracer.add_checkpoint("Chunks formatted")
    tracer.add_checkpoint("Token limit checked")
    tracer.add_checkpoint("Context trimmed to fit")
    tracer.end_step(result={"context_length": 6500, "chunks_used": 10, "chunks_dropped": 2})
    
    # Step 4: Prompt Construction
    tracer.start_step(
        "Prompt Construction",
        "Build prompt with config and history",
        {"prologue": True, "chat_history": 8}
    )
    tracer.add_checkpoint("System prologue added")
    tracer.add_checkpoint("Retrieved context added")
    tracer.add_checkpoint("Chat history added")
    tracer.add_checkpoint("User question added")
    tracer.end_step(result={"prompt_tokens": 7200, "context_tokens": 6500, "history_tokens": 500})
    
    # Step 5: LLM Generation
    tracer.start_step(
        "LLM Generation",
        "Generate answer with streaming",
        {"model": "gpt-4", "temperature": 0.7, "streaming": True}
    )
    tracer.add_checkpoint("LLM API called")
    tracer.add_checkpoint("Streaming tokens...")
    tracer.add_checkpoint("Citation extraction")
    tracer.add_checkpoint("TTS generation (optional)")
    tracer.end_step(result={"answer_tokens": 150, "citations": 3, "has_audio": False})
    
    # Step 6: Response Delivery
    tracer.start_step(
        "Response Delivery",
        "Send response via Server-Sent Events",
        {"streaming": True, "format": "SSE"}
    )
    tracer.add_checkpoint("SSE connection established")
    tracer.add_checkpoint("Answer streamed")
    tracer.add_checkpoint("References sent")
    tracer.add_checkpoint("End signal sent")
    tracer.end_step(result={"sse_events": 25, "complete": True})
    
    # End trace
    ragflow_logger.end_trace(tracer.session_id)
    
    print("\n✅ RAGFlow logging test completed!\n")


def test_error_handling():
    """Test error handling in logging"""
    print("\n" + "="*80)
    print("🧪 TESTING ERROR HANDLING")
    print("="*80 + "\n")
    
    tracer = lma_rag_logger.start_trace("TEST_ERROR_HANDLING")
    
    # Successful step
    tracer.start_step("Step 1", "This step will succeed")
    tracer.end_step(result={"status": "ok"})
    
    # Failed step
    tracer.start_step("Step 2", "This step will fail")
    try:
        raise ValueError("Simulated error for testing")
    except Exception as e:
        tracer.end_step(error=e)
    
    # Recovery step
    tracer.start_step("Step 3", "Recovery after error")
    tracer.add_checkpoint("Error handled")
    tracer.add_checkpoint("Fallback strategy applied")
    tracer.end_step(result={"recovered": True})
    
    lma_rag_logger.end_trace(tracer.session_id)
    
    print("\n✅ Error handling test completed!\n")


def main():
    """Run all tests"""
    print("\n" + "🚀 " + "="*74)
    print("🚀   DEBUG LOGGING SYSTEM - COMPREHENSIVE TEST SUITE")
    print("🚀 " + "="*74 + "\n")
    
    # Test all 3 systems
    test_lma_rag_logger()
    test_meeting_assistant_logger()
    test_ragflow_logger()
    test_error_handling()
    
    # Summary
    print("\n" + "="*80)
    print("✨ ALL TESTS COMPLETED SUCCESSFULLY!")
    print("="*80)
    print("\n📁 Check log files:")
    print(f"   - /home/quangnh58/dev/amazon-transcribe-live-meeting-assistant/log/LMA_RAG_*.log")
    print(f"   - /home/quangnh58/dev/amazon-transcribe-live-meeting-assistant/log/MeetingAssistant_*.log")
    print(f"   - /home/quangnh58/dev/amazon-transcribe-live-meeting-assistant/log/RAGFlow_*.log")
    print(f"   - /home/quangnh58/dev/amazon-transcribe-live-meeting-assistant/log/trace_*.json")
    print("\n")


if __name__ == "__main__":
    main()


