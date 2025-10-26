#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Gemini Streaming Chat Service
Real-time chat with Gemini API and AppSync streaming
Replaces AWS Bedrock for meeting assistant chatbot
"""

import os
import json
import logging
from typing import Dict, Any, Optional, Generator
import requests

# Supabase client
try:
    from supabase import create_client, Client
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_CHAT_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')  # Fast model for real-time
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# AppSync configuration
APPSYNC_GRAPHQL_URL = os.environ.get('APPSYNC_GRAPHQL_URL', '')
ENABLE_STREAMING = os.environ.get('ENABLE_STREAMING', 'true').lower() == 'true'

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def send_chat_token_to_appsync(call_id: str, message_id: str, token: str, is_complete: bool, sequence: int):
    """
    Send a chat token to AppSync for real-time streaming
    """
    try:
        if not APPSYNC_GRAPHQL_URL:
            logger.warning("APPSYNC_GRAPHQL_URL not configured, skipping token streaming")
            return
        
        from asst_gql_client import AppsyncRequestsGqlClient
        from gql import gql
        
        # Initialize AppSync client
        appsync_client = AppsyncRequestsGqlClient(
            url=APPSYNC_GRAPHQL_URL,
            fetch_schema_from_transport=False
        )
        
        # GraphQL mutation
        mutation = gql("""
        mutation AddChatToken($input: AddChatTokenInput!) {
            addChatToken(input: $input) {
                CallId
                MessageId
                Token
                IsComplete
                Sequence
                Timestamp
            }
        }
        """)
        
        variables = {
            'input': {
                'CallId': call_id,
                'MessageId': message_id,
                'Token': token,
                'IsComplete': is_complete,
                'Sequence': sequence
            }
        }
        
        # Execute mutation
        result = appsync_client.execute(mutation, variable_values=variables)
        logger.debug(f"Sent token {sequence} to AppSync")
        
    except Exception as e:
        logger.error(f"Error sending token to AppSync: {str(e)}")


def get_live_transcript_context(call_id: str, last_n_segments: int = 20) -> str:
    """
    Fetch recent transcript segments from live meeting
    
    Args:
        call_id: Meeting/Call ID
        last_n_segments: Number of recent segments to retrieve
    
    Returns:
        Formatted transcript string
    """
    try:
        # Query Supabase for recent final transcript events
        response = supabase.table('transcript_events')\
            .select('*')\
            .eq('meeting_id', call_id)\
            .eq('is_final', True)\
            .order('end_time', desc=True)\
            .limit(last_n_segments)\
            .execute()
        
        if not response.data:
            return "No transcript available yet for this meeting."
        
        # Sort by start_time (ascending) for chronological order
        segments = sorted(response.data, key=lambda x: x.get('start_time', 0))
        
        # Format as conversation
        transcript_parts = []
        for segment in segments:
            speaker = segment.get('speaker_name') or segment.get('speaker_number', 'Unknown')
            text = segment.get('transcript', '')
            if text.strip():
                transcript_parts.append(f"{speaker}: {text}")
        
        return "\n".join(transcript_parts)
    
    except Exception as e:
        logger.error(f"Error fetching live transcript: {str(e)}")
        return ""


def assemble_meeting_context(user_query: str, call_id: str, owner_email: str) -> Dict[str, Any]:
    """
    Assemble unified context from live transcript + RAG knowledge base
    
    Args:
        user_query: User's question
        call_id: Meeting ID
        owner_email: User's email for RAG filtering
    
    Returns:
        Dict with combined context and sources
    """
    try:
        # Import RAG query engine
        import sys
        sys.path.append('../../rag_query_resolver')
        from index import RAGQueryEngine
        
        # 1. Get live transcript (recent conversation)
        logger.info(f"Fetching live transcript for call {call_id}")
        live_transcript = get_live_transcript_context(call_id, last_n_segments=20)
        
        # 2. Get RAG context (documents + indexed transcripts)
        logger.info(f"Querying RAG knowledge base for: {user_query}")
        rag_engine = RAGQueryEngine()
        rag_result = rag_engine.assemble_context(
            query=user_query,
            user_email=owner_email,
            meeting_id=call_id,
            include_documents=True,
            include_transcripts=True,
            doc_match_count=3,
            transcript_match_count=2
        )
        
        # 3. Combine contexts intelligently
        context_parts = []
        
        # Always include live transcript first (most recent context)
        if live_transcript:
            context_parts.append("# Current Meeting Conversation (Last 20 messages)")
            context_parts.append(live_transcript)
        
        # Add RAG context if available
        if rag_result.get('has_context') and rag_result.get('context'):
            context_parts.append("\n\n# Additional Context from Knowledge Base")
            context_parts.append(rag_result['context'])
        
        combined_context = "\n".join(context_parts)
        
        return {
            'context': combined_context,
            'live_transcript': live_transcript,
            'rag_context': rag_result.get('context', ''),
            'sources': rag_result.get('sources', []),
            'has_live_transcript': bool(live_transcript),
            'has_rag_context': rag_result.get('has_context', False)
        }
    
    except Exception as e:
        logger.error(f"Error assembling meeting context: {str(e)}")
        # Fallback to just live transcript
        live_transcript = get_live_transcript_context(call_id, last_n_segments=20)
        return {
            'context': live_transcript or "No context available.",
            'live_transcript': live_transcript,
            'rag_context': '',
            'sources': [],
            'has_live_transcript': bool(live_transcript),
            'has_rag_context': False,
            'error': str(e)
        }


def stream_gemini_response(prompt: str, system_instruction: str) -> Generator[str, None, None]:
    """
    Stream response from Gemini API
    
    Args:
        prompt: User prompt with context
        system_instruction: System instructions for the model
    
    Yields:
        Token strings from the response
    """
    try:
        url = f"{GEMINI_API_BASE_URL}/{GEMINI_CHAT_MODEL}:streamGenerateContent"
        params = {'key': GEMINI_API_KEY, 'alt': 'sse'}
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
                "topP": 0.95
            }
        }
        
        response = requests.post(
            url,
            params=params,
            json=payload,
            stream=True,
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"Gemini API error: {response.status_code} - {response.text}")
            yield f"Error: API returned {response.status_code}"
            return
        
        # Parse SSE stream
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                
                # SSE format: "data: {...}"
                if line_str.startswith('data: '):
                    data_json = line_str[6:]  # Remove "data: " prefix
                    
                    try:
                        data = json.loads(data_json)
                        
                        # Extract text from response
                        if 'candidates' in data:
                            for candidate in data['candidates']:
                                if 'content' in candidate:
                                    for part in candidate['content'].get('parts', []):
                                        if 'text' in part:
                                            yield part['text']
                    
                    except json.JSONDecodeError:
                        continue
    
    except Exception as e:
        logger.error(f"Error streaming from Gemini: {str(e)}")
        yield f"Error: {str(e)}"


def generate_gemini_response_non_streaming(prompt: str, system_instruction: str) -> str:
    """
    Generate non-streaming response from Gemini API
    
    Args:
        prompt: User prompt with context
        system_instruction: System instructions for the model
    
    Returns:
        Complete response text
    """
    try:
        url = f"{GEMINI_API_BASE_URL}/{GEMINI_CHAT_MODEL}:generateContent"
        params = {'key': GEMINI_API_KEY}
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
                "topP": 0.95
            }
        }
        
        response = requests.post(
            url,
            params=params,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            logger.error(f"Gemini API error: {response.status_code} - {response.text}")
            return f"Error: API returned {response.status_code}"
        
        result = response.json()
        
        # Extract text from response
        if 'candidates' in result and len(result['candidates']) > 0:
            candidate = result['candidates'][0]
            if 'content' in candidate:
                parts = candidate['content'].get('parts', [])
                if parts and 'text' in parts[0]:
                    return parts[0]['text']
        
        return "No response generated"
    
    except Exception as e:
        logger.error(f"Error generating Gemini response: {str(e)}")
        return f"Error: {str(e)}"


def get_meeting_assistant_prompt() -> str:
    """
    System prompt for meeting assistant
    """
    return """You are an AI assistant helping participants during a live meeting. Your role is to:

1. Answer questions based on the current meeting conversation and any uploaded documents
2. Provide helpful, accurate, and concise responses
3. Reference specific parts of the conversation when relevant
4. If information is not available in the meeting context, use the knowledge base documents
5. If neither source has the answer, use your general knowledge but mention this
6. Be professional, supportive, and conversational

Response Guidelines:
- Keep responses under 150 words when possible
- Use bullet points for lists
- Quote relevant parts from the transcript or documents
- Indicate your source (e.g., "Based on the conversation..." or "According to the document...")
- If unsure, ask clarifying questions

Context Priority:
1. Live meeting transcript (most recent, most relevant)
2. Uploaded knowledge base documents
3. General knowledge (clearly state when using this)"""


def lambda_handler(event, context):
    """
    Lambda handler for Gemini-based meeting chat
    
    Expected event structure:
    {
        "CallId": "call-id",
        "MessageId": "message-id",
        "Message": "user message",
        "Owner": "user@example.com",
        "EnableStreaming": true
    }
    """
    try:
        logger.info(f"Gemini Chat Service - Processing event")
        
        # Extract parameters
        call_id = event.get('CallId', '')
        message_id = event.get('MessageId', '')
        user_message = event.get('Message', '') or event.get('Transcript', '')
        owner_email = event.get('Owner', 'unknown@example.com')
        enable_streaming = event.get('EnableStreaming', ENABLE_STREAMING)
        
        if not user_message or not call_id:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'CallId and Message are required'
                })
            }
        
        logger.info(f"Processing chat message for call {call_id}: {user_message[:100]}...")
        
        # Assemble context from live transcript + RAG
        context_result = assemble_meeting_context(user_message, call_id, owner_email)
        
        # Build prompt for Gemini
        prompt = f"""Context:
{context_result['context']}

User Question: {user_message}

Please provide a helpful response based on the context above."""
        
        system_instruction = get_meeting_assistant_prompt()
        
        # Handle streaming vs non-streaming
        if enable_streaming and APPSYNC_GRAPHQL_URL:
            logger.info("Streaming mode enabled - sending tokens to AppSync")
            
            sequence = 0
            full_response = []
            
            # Stream from Gemini
            for token in stream_gemini_response(prompt, system_instruction):
                full_response.append(token)
                
                # Send token to AppSync
                send_chat_token_to_appsync(
                    call_id=call_id,
                    message_id=message_id,
                    token=token,
                    is_complete=False,
                    sequence=sequence
                )
                sequence += 1
            
            # Send completion token
            send_chat_token_to_appsync(
                call_id=call_id,
                message_id=message_id,
                token='',
                is_complete=True,
                sequence=sequence
            )
            
            response_text = ''.join(full_response)
            logger.info(f"Streaming complete. Total tokens: {sequence}")
        
        else:
            # Non-streaming mode
            logger.info("Non-streaming mode")
            response_text = generate_gemini_response_non_streaming(prompt, system_instruction)
        
        # Log context sources for debugging
        logger.info(f"Response generated using:")
        logger.info(f"  - Live transcript: {context_result['has_live_transcript']}")
        logger.info(f"  - RAG context: {context_result['has_rag_context']}")
        logger.info(f"  - Sources: {len(context_result.get('sources', []))}")
        
        return {
            'message': response_text,
            'callId': call_id,
            'messageId': message_id,
            'sources': context_result.get('sources', []),
            'context_stats': {
                'has_live_transcript': context_result['has_live_transcript'],
                'has_rag_context': context_result['has_rag_context']
            }
        }
    
    except Exception as e:
        logger.error(f"Error in Gemini chat service: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}',
                'callId': call_id if 'call_id' in locals() else 'unknown'
            })
        }


# For testing
if __name__ == "__main__":
    # Test the service
    test_event = {
        'CallId': 'test-call-123',
        'MessageId': 'test-msg-456',
        'Message': 'What is this meeting about?',
        'Owner': 'test@example.com',
        'EnableStreaming': False
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))

