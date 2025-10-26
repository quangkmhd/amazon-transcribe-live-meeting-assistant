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

def get_kb_response(query, userId, isAdminUser, sessionId):
    """Query RAG knowledge base using Supabase + Gemini (replaces AWS Bedrock KB)"""
    print(f"RAG Query Request - User: {userId}, Query: {query}")
    
    try:
        # Use RAGQueryEngine for retrieval
        rag_engine = RAGQueryEngine()
        
        # Assemble context from knowledge base
        # Admin users can see all documents (don't filter by email)
        user_email = 'admin@system.com' if isAdminUser else userId
        
        rag_result = rag_engine.assemble_context(
            query=query,
            user_email=user_email,
            meeting_id=None,  # Search across all meetings
            include_documents=True,
            include_transcripts=True,
            doc_match_count=5,
            transcript_match_count=3
        )
        
        # Build prompt for Gemini to generate answer based on context
        context = rag_result.get('context', '')
        
        if not context:
            return {
                "output": {"text": "I couldn't find any relevant information in the knowledge base to answer your question."},
                "citations": [],
                "sessionId": sessionId
            }
        
        # Generate answer using Gemini with RAG context
        answer_prompt = f"""Based on the following context from the knowledge base, please answer the user's question.

Context:
{context}

User Question: {query}

Please provide a helpful, accurate response based solely on the context above. If the context doesn't contain enough information to answer the question, say so."""
        
        # Generate answer using Gemini (already imported above)
        answer = generate_gemini_response_non_streaming(answer_prompt, get_meeting_assistant_prompt())
        
        # Format response to match Bedrock KB structure
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
        return resp
        
    except Exception as e:
        print("RAG Query Exception: ", e)
        logger.error(f"Error in RAG query: {str(e)}")
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
    query = event["arguments"]["input"]
    sessionId = event["arguments"].get("sessionId") or None
    userId = event["identity"]["username"]
    isAdminUser = False
    groups = event["identity"].get("groups")
    if groups:
        isAdminUser = "Admin" in groups       
    kb_response = get_kb_response(query, userId, isAdminUser, sessionId)
    kb_response["markdown"] = markdown_response(kb_response)
    print("Returning response: %s" % json.dumps(kb_response))
    return json.dumps(kb_response)
