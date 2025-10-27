# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

#
# RAG Knowledge Base Query using Supabase + Gemini (AWS-free)
import json
import os
import sys
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Import debug logger
sys.path.append('../../../../../../utilities')
from debug_logger import lma_rag_logger, StepTracer

# Import RAG query engine and Gemini chat
import os as _os
rag_path = _os.path.join(_os.path.dirname(__file__), '../rag_query_resolver')
gemini_path = _os.path.join(_os.path.dirname(__file__), '../gemini_chat_service')

if rag_path not in sys.path:
    sys.path.insert(0, rag_path)
if gemini_path not in sys.path:
    sys.path.insert(0, gemini_path)

# Import from different modules to avoid conflict
import sys as _sys
_rag_module_path = _os.path.join(_os.path.dirname(__file__), '../rag_query_resolver/index.py')
_gemini_module_path = _os.path.join(_os.path.dirname(__file__), '../gemini_chat_service/index.py')

# Import RAGQueryEngine from rag_query_resolver
import importlib.util
_rag_spec = importlib.util.spec_from_file_location("rag_resolver", _rag_module_path)
_rag_module = importlib.util.module_from_spec(_rag_spec)
_rag_spec.loader.exec_module(_rag_module)
RAGQueryEngine = _rag_module.RAGQueryEngine

# Import Gemini functions from gemini_chat_service
_gemini_spec = importlib.util.spec_from_file_location("gemini_service", _gemini_module_path)
_gemini_module = importlib.util.module_from_spec(_gemini_spec)
_gemini_spec.loader.exec_module(_gemini_module)
generate_gemini_response_non_streaming = _gemini_module.generate_gemini_response_non_streaming
get_meeting_assistant_prompt = _gemini_module.get_meeting_assistant_prompt

def get_kb_response(query, userId, isAdminUser, sessionId, tracer: StepTracer = None):
    """Query RAG knowledge base using Supabase + Gemini (replaces AWS Bedrock KB)"""
    print(f"RAG Query Request - User: {userId}, Query: {query}")
    lma_rag_logger.info("KB Query Request", user=userId, query=query[:100], is_admin=isAdminUser)
    
    if tracer:
        tracer.start_step(
            "KB Query Processing",
            "Query knowledge base and generate answer with Gemini",
            {
                "query": query[:100],
                "user_id": userId,
                "is_admin": isAdminUser,
                "session_id": sessionId
            }
        )
    
    try:
        print(f"\n{'='*80}")
        print(f"🚀 [DEBUG] KB QUERY REQUEST")
        print(f"{'='*80}")
        print(f"Query: {query}")
        print(f"User: {userId}")
        print(f"Admin: {isAdminUser}")
        print(f"Session: {sessionId}")
        print(f"{'='*80}\n")
        
        # Use RAGQueryEngine for retrieval
        if tracer:
            tracer.add_checkpoint("Initializing RAG Query Engine")
        
        rag_engine = RAGQueryEngine(tracer=tracer)
        
        # Assemble context from knowledge base
        # Admin users can see all documents (don't filter by email)
        user_email = 'admin@system.com' if isAdminUser else userId
        
        if tracer:
            tracer.add_checkpoint("Determining user permissions", {"user_email": user_email})
        
        lma_rag_logger.debug("User permissions set", user_email=user_email, is_admin=isAdminUser)
        
        rag_result = rag_engine.assemble_context(
            query=query,
            user_email=user_email,
            meeting_id=None,  # Search across all meetings
            include_documents=True,
            include_transcripts=True,
            include_knowledge_graph=True,  # NEW: Enable Knowledge Graph
            doc_match_count=10,  # Increased from 5 to 10 for better coverage
            transcript_match_count=5,   # Increased from 3 to 5
            graph_entity_count=5  # NEW: Top 5 entities from graph
        )
        
        # Build prompt for Gemini to generate answer based on context
        context = rag_result.get('context', '')
        source_count = len(rag_result.get('sources', []))
        entity_count = rag_result.get('entity_count', 0)
        has_graph = rag_result.get('has_graph', False)
        
        print(f"\n📦 [DEBUG] CONTEXT ASSEMBLY RESULT:")
        print(f"  - Context length: {len(context)} chars")
        print(f"  - Source count: {source_count}")
        print(f"  - Entity count: {entity_count}")
        print(f"  - Has graph: {has_graph}")
        print(f"  - Has context: {bool(context)}\n")
        
        lma_rag_logger.info("Context retrieved", context_length=len(context), source_count=source_count)
        
        if not context:
            lma_rag_logger.warning("No context found for query")
            
            if tracer:
                tracer.end_step(result={"has_context": False})
            
            return {
                "output": {"text": "I couldn't find any relevant information in the knowledge base to answer your question."},
                "citations": [],
                "sessionId": sessionId
            }
        
        # Generate answer using Gemini with RAG context
        if tracer:
            tracer.add_checkpoint("Building prompt for Gemini")
        
        # Build RAGFlow-style prompt for better RAG responses
        # Format context as Document Chunks JSON for structured retrieval
        document_chunks_json = []
        for idx, source in enumerate(rag_result.get('sources', []), 1):
            document_chunks_json.append({
                "chunk_id": f"DC{idx}",
                "document_id": source.get('document_id', 'unknown'),
                "content": source.get('excerpt', ''),
                "relevance_score": source.get('relevance_score', source.get('similarity_score', 0))
            })
        
        content_data = "\n\n".join([
            f"[DC{idx}] Document: {chunk['document_id']}\nRelevance Score: {chunk['relevance_score']:.2f}\nContent:\n{chunk['content']}"
            for idx, chunk in enumerate(document_chunks_json, 1)
        ])
        
        # Check if we have graph context
        has_graph = rag_result.get('has_graph', False)
        graph_entities = rag_result.get('graph_entities', [])
        
        print(f"🧬 [DEBUG] KNOWLEDGE GRAPH STATUS:")
        print(f"  - Has graph: {has_graph}")
        print(f"  - Graph entities: {len(graph_entities)}")
        if graph_entities:
            for i, entity in enumerate(graph_entities[:3]):
                print(f"  - Entity {i+1}: {entity.get('entity_name')} ({entity.get('entity_type')})")
        print("")
        
        # Format Knowledge Graph context if available
        graph_context = ""
        if has_graph and graph_entities:
            graph_parts = []
            for entity in graph_entities:
                entity_text = f"[KG] {entity['entity_name']} ({entity['entity_type']}): {entity['description']}"
                graph_parts.append(entity_text)
            graph_context = "\n\n".join(graph_parts)
        
        # RAGFlow-style prompt with KG+DC support (from graphrag/light/graph_prompt.py line 199-237)
        # Use full `rag_response` template if graph available, else `naive_rag_response`
        if has_graph:
            answer_prompt = f"""---Role---

You are a helpful assistant responding to user query about Knowledge Graph and Document Chunks provided in JSON format below.

---Goal---

Generate a concise response based on Knowledge Base and follow Response Rules, considering both current query and the conversation history if provided. Summarize all information in the provided Knowledge Base, and incorporating general knowledge relevant to the Knowledge Base. Do not include information not provided by Knowledge Base.

---Conversation History---
(Previous conversation context if any)

---Knowledge Graph and Document Chunks---
## Knowledge Graph (KG)
{graph_context}

## Document Chunks (DC)
{content_data}

---RESPONSE GUIDELINES---
**1. Content & Adherence:**
- Strictly adhere to the provided context from the Knowledge Base. Do not invent, assume, or include any information not present in the source data.
- If the answer cannot be found in the provided context, state that you do not have enough information to answer.
- Ensure the response maintains continuity with the conversation history.
- Prioritize Knowledge Graph for structured information (rules, sequences, relationships)
- Use Document Chunks for detailed context and examples

**2. Formatting & Language:**
- Format the response using markdown with appropriate section headings.
- The response language must match the user's question language.
- Target format and length: Detailed and comprehensive answer

**3. Citations / References:**
- At the end of the response, under a "References" section, cite a maximum of 5 most relevant sources used.
- Use the following formats for citations:
  - For Knowledge Graph Entity: `[KG] <entity_name>`
  - For Knowledge Graph Relationship: `[KG] <entity1_name> - <entity2_name>`
  - For Document Chunk: `[DC] <file_path_or_document_name>`

---USER CONTEXT---
- User Query: {query}

Response:"""
        else:
            # Fallback to naive_rag_response (DC only)
            answer_prompt = f"""---Role---

You are a helpful assistant responding to user query about Document Chunks provided in JSON format below.

---Goal---

Generate a concise response based on Document Chunks and follow Response Rules, considering both the conversation history and the current query. Summarize all information in the provided Document Chunks, and incorporating general knowledge relevant to the Document Chunks. Do not include information not provided by Document Chunks.

---Conversation History---
(Previous conversation context if any)

---Document Chunks(DC)---
{content_data}

---RESPONSE GUIDELINES---
**1. Content & Adherence:**
- Strictly adhere to the provided context from the Knowledge Base. Do not invent, assume, or include any information not present in the source data.
- If the answer cannot be found in the provided context, state that you do not have enough information to answer.
- Ensure the response maintains continuity with the conversation history.

**2. Formatting & Language:**
- Format the response using markdown with appropriate section headings.
- The response language must match the user's question language.
- Target format and length: Detailed and comprehensive answer

**3. Citations / References:**
- At the end of the response, under a "References" section, cite a maximum of 5 most relevant sources used.
- Use the following formats for citations: `[DC] <file_path_or_document_name>`

---USER CONTEXT---
- User Query: {query}

Response:"""
        
        lma_rag_logger.debug("Prompt constructed", prompt_length=len(answer_prompt))
        
        # Generate answer using Gemini (already imported above)
        if tracer:
            tracer.add_checkpoint("Calling Gemini API for answer generation")
        
        print(f"🤖 [DEBUG] CALLING GEMINI:")
        print(f"  - Prompt length: {len(answer_prompt)} chars")
        print(f"  - Using prompt type: {'KG+DC' if has_graph else 'DC only'}")
        print(f"  - Model: gemini-2.0-flash-exp\n")
        
        answer = generate_gemini_response_non_streaming(answer_prompt, get_meeting_assistant_prompt())
        
        print(f"🤖 [DEBUG] GEMINI RESPONSE:")
        print(f"  - Answer length: {len(answer)} chars")
        print(f"  - Preview: {answer[:200]}...\n")
        
        lma_rag_logger.info("Answer generated", answer_length=len(answer))
        
        if tracer:
            tracer.add_checkpoint("Answer generated", {"answer_length": len(answer)})
        
        # Format response to match Bedrock KB structure
        if tracer:
            tracer.add_checkpoint("Formatting response with citations")
        
        resp = {
            "output": {"text": answer},
            "citations": [{
                "retrievedReferences": [
                    {
                        "content": {"text": source.get('excerpt', '')},
                        "metadata": {
                            "CallId": source.get('meeting_id', source.get('document_id', 'unknown')),
                            "type": source.get('type', 'unknown'),
                            "score": source.get('relevance_score', source.get('similarity_score', 0))
                        }
                    }
                    for source in rag_result.get('sources', [])
                ]
            }],
            "sessionId": sessionId
        }
        
        print("RAG Response: ", json.dumps(resp))
        lma_rag_logger.info("KB Query completed successfully", citations_count=len(resp["citations"][0]["retrievedReferences"]))
        
        if tracer:
            tracer.end_step(result={
                "answer_length": len(answer),
                "citations_count": len(resp["citations"][0]["retrievedReferences"]),
                "has_answer": True
            })
        
        return resp
        
    except Exception as e:
        print("RAG Query Exception: ", e)
        logger.error(f"Error in RAG query: {str(e)}")
        lma_rag_logger.error("KB Query failed", error=e)
        
        if tracer:
            tracer.end_step(error=e)
        
        return {
            "systemMessage": "RAG Query Error: " + str(e),
            "output": {"text": "An error occurred while processing your question."},
            "citations": []
        }


def markdown_response(kb_response):
    showContextText = True
    message = kb_response.get("output", {}).get("text", {}) or kb_response.get(
        "systemMessage") or "No answer found"
    markdown = message
    if showContextText:
        contextText = ""
        sourceLinks = []
        for source in kb_response.get("citations", []):
            for reference in source.get("retrievedReferences", []):
                snippet = reference.get("content", {}).get(
                    "text", "no reference text")
                callId = reference.get("metadata",{}).get("CallId")
                url = f"{callId}"
                title = callId
                contextText = f'{contextText}<br><callid href="{url}">{title}</callid><br>{snippet}\n'
                sourceLinks.append(f'<callid href="{url}">{title}</callid>')
        if contextText:
            markdown = f'{markdown}\n<details><summary>Context</summary><p style="white-space: pre-line;">{contextText}</p></details>'
        if len(sourceLinks):
            markdown = f'{markdown}<br>Sources: ' + ", ".join(sourceLinks)
    return markdown


def handler(event, context):
    print("Received event: %s" % json.dumps(event))
    
    # Check if debug mode is enabled
    enable_debug = event.get("arguments", {}).get("enable_debug", False)
    tracer = None
    
    if enable_debug:
        tracer = lma_rag_logger.start_trace("KB_QUERY_HANDLER")
        tracer.start_step(
            "Lambda Handler - KB Query",
            "Process knowledge base query from AppSync",
            {
                "query": event.get("arguments", {}).get("input", "")[:100],
                "user": event.get("identity", {}).get("username")
            }
        )
    
    lma_rag_logger.info("KB Query Handler started", enable_debug=enable_debug)
    
    try:
        if tracer:
            tracer.add_checkpoint("Parsing event parameters")
        
        query = event["arguments"]["input"]
        sessionId = event["arguments"].get("sessionId") or None
        userId = event["identity"]["username"]
        isAdminUser = False
        groups = event["identity"].get("groups")
        if groups:
            isAdminUser = "Admin" in groups
        
        lma_rag_logger.debug("Event parsed", user=userId, is_admin=isAdminUser, has_session=bool(sessionId))
        
        if tracer:
            tracer.add_checkpoint("Parameters validated")
            tracer.end_step(result={"query_length": len(query), "is_admin": isAdminUser})
        
        kb_response = get_kb_response(query, userId, isAdminUser, sessionId, tracer=tracer)
        kb_response["markdown"] = markdown_response(kb_response)
        
        lma_rag_logger.info("KB Query Handler completed")
        
        # End trace
        if tracer:
            lma_rag_logger.end_trace(tracer.session_id)
        
        print("Returning response: %s" % json.dumps(kb_response))
        return json.dumps(kb_response)
        
    except Exception as e:
        lma_rag_logger.error("KB Query Handler failed", error=e)
        
        if tracer:
            lma_rag_logger.end_trace(tracer.session_id)
        
        raise
