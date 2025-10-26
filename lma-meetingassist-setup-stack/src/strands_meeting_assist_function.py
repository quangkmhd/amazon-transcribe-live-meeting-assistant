#!/usr/bin/env python3.12
# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

"""
Strands-based Meeting Assistant Lambda Function
Provides a lightweight alternative to QnABot using AWS Strands SDK
"""

import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr
from typing import Dict, Any
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients (DshieldoDB only - Bedrock removed)
dynamodb = boto3.resource('dynamodb')
# bedrock_agent_runtime - REMOVED: No longer using AWS Bedrock

# Get AppSync endpoint from environment
APPSYNC_GRAPHQL_URL = os.environ.get('APPSYNC_GRAPHQL_URL', '')
ENABLE_STREAMING = os.environ.get('ENABLE_STREAMING', 'false').lower() == 'true'

def send_chat_token_to_appsync(call_id: str, message_id: str, token: str, is_complete: bool, sequence: int):
    """
    Send a chat token to AppSync for real-time streaming
    """
    try:
        if not APPSYNC_GRAPHQL_URL:
            logger.warning("APPSYNC_GRAPHQL_URL not configured, skipping token streaming")
            return
        
        from asst_gql_client import AppsyncRequestsGqlClient
        from datetime import datetime
        from gql import gql
        
        # Initialize AppSync client
        appsync_client = AppsyncRequestsGqlClient(
            url=APPSYNC_GRAPHQL_URL,
            fetch_schema_from_transport=False
        )
        
        # GraphQL mutation - parse it into an AST
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
        logger.debug(f"Sent token {sequence} to AppSync: {token[:50]}...")
        
    except Exception as e:
        logger.error(f"Error sending token to AppSync: {str(e)}")

def fetch_meeting_transcript(call_id: str, dynamodb_table_name: str) -> str:
    """
    Fetch the meeting transcript from DynamoDB
    """
    try:
        table = dynamodb.Table(dynamodb_table_name)
        pk = f'trs#{call_id}'
        
        # Query for transcript segments
        response = table.query(
            KeyConditionExpression=Key('PK').eq(pk),
            FilterExpression=(
                (Attr('Channel').eq('AGENT') | Attr('Channel').eq('CALLER') | Attr('Channel').eq('AGENT_ASSISTANT')) 
                & Attr('IsPartial').eq(False)
            )
        )
        
        # Sort by EndTime and format transcript
        items = sorted(response.get('Items', []), key=lambda x: x.get('EndTime', 0))
        
        transcript_parts = []
        for item in items:
            speaker = item.get('Speaker', 'Unknown')
            transcript = item.get('Transcript', '')
            channel = item.get('Channel', '')
            
            # Format based on channel
            if channel == 'AGENT_ASSISTANT':
                transcript_parts.append(f"MeetingAssistant: {transcript}")
            else:
                transcript_parts.append(f"{speaker}: {transcript}")
        
        full_transcript = '\n'.join(transcript_parts)
        logger.info(f"Fetched transcript for {call_id}: {len(full_transcript)} characters")
        
        return full_transcript
        
    except Exception as e:
        logger.error(f"Error fetching transcript: {str(e)}")
        return ""

def query_knowledge_base(user_input: str, call_id: str, owner_email: str = 'unknown@example.com') -> str:
    """
    Query RAG Knowledge Base using Supabase pgvector + Gemini embeddings
    Replaces AWS Bedrock Knowledge Base
    """
    try:
        # Import RAG query engine
        from supabase import create_client
        
        # Initialize Supabase client
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        
        if not supabase_url or not supabase_key:
            logger.warning("Supabase not configured for RAG")
            return ""
        
        supabase = create_client(supabase_url, supabase_key)
        
        # Import embedding service
        import sys
        import os
        rag_path = os.path.join(os.path.dirname(__file__), '../../lma-ai-stack/source/lambda_functions/embedding_service')
        if rag_path not in sys.path:
            sys.path.insert(0, rag_path)
        
        from gemini_embeddings import GeminiEmbeddingService
        
        # Generate query embedding
        embedding_service = GeminiEmbeddingService()
        query_embedding = embedding_service.generate_query_embedding(user_input)
        
        if not query_embedding or len(query_embedding) == 0:
            logger.warning("Failed to generate query embedding")
            return ""
        
        # Search knowledge base using hybrid search
        response = supabase.rpc(
            'hybrid_search_knowledge',
            {
                'query_text': user_input,
                'query_embedding': query_embedding,
                'user_email': owner_email,
                'match_count': 5,
                'vector_weight': 0.7
            }
        ).execute()
        
        if not response.data:
            logger.info("No knowledge base results found")
            return ""
        
        # Format results as context
        context_parts = []
        for idx, result in enumerate(response.data[:3]):  # Top 3 results
            content = result.get('content', '')
            if content:
                context_parts.append(f"[Document {idx + 1}]\n{content}")
        
        kb_context = "\n\n".join(context_parts)
        logger.info(f"RAG KB returned {len(response.data)} results")
        
        return kb_context
        
    except Exception as e:
        logger.error(f"Error querying RAG knowledge base: {str(e)}")
        import traceback
        traceback.print_exc()
        return ""

def handler(event, context):
    """
    Lambda handler for Strands-based meeting assistance
    
    Expected event structure:
    {
        "transcript": "meeting transcript context",
        "userInput": "user question or request",
        "callId": "unique call identifier"
    }
    """
    try:
        logger.info(f"Strands Meeting Assist - Processing event: {json.dumps(event)}")
        
        # Extract parameters from event - handle both 'text' and 'userInput' for compatibility
        user_input = event.get('userInput', '') or event.get('text', '')
        call_id = event.get('callId', '') or event.get('call_id', '')
        dynamodb_table_name = event.get('dynamodb_table_name', '')
        
        if not user_input:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'userInput or text is required'
                })
            }
        
        # Get owner email from event
        owner_email = event.get('Owner', 'unknown@example.com')
        
        # Fetch meeting transcript from DynamoDB or Supabase
        transcript = fetch_meeting_transcript(call_id, dynamodb_table_name) if dynamodb_table_name else event.get('transcript', '')
        
        # Query RAG knowledge base (replaces AWS Bedrock KB)
        kb_context = query_knowledge_base(user_input, call_id, owner_email)
        
        # Use Gemini for chat instead of Bedrock/Strands
        try:
            import requests
            
            # Get message ID for streaming
            transcript_segment_args = event.get('transcript_segment_args', {})
            message_id = transcript_segment_args.get('MessageId') or transcript_segment_args.get('SegmentId', f"msg-{call_id}")
            
            logger.info(f"Using MessageId for streaming: {message_id}")
            
            # Get Gemini configuration
            gemini_api_key = os.environ.get('GEMINI_API_KEY')
            gemini_model = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
            
            if not gemini_api_key:
                logger.error("GEMINI_API_KEY not configured")
                return {
                    'statusCode': 500,
                    'body': json.dumps({'error': 'Gemini API not configured'})
                }
            
            # Prepare prompt for Gemini
            context_parts = []
            
            # Add live transcript
            if transcript:
                context_parts.append("# Current Meeting Transcript:")
                context_parts.append(transcript)
            
            # Add RAG knowledge base context
            if kb_context:
                context_parts.append("\n# Knowledge Base Context:")
                context_parts.append(kb_context)
            
            context_text = "\n".join(context_parts) if context_parts else "No context available yet."
            
            prompt = f"""Context:
{context_text}

User Question: {user_input}

Please provide a helpful response based on the context above. If the answer is in the meeting transcript, prioritize that. If not, use the knowledge base documents. Be concise and professional."""
            
            system_instruction = get_meeting_assistant_prompt()
            
            # Handle streaming vs non-streaming
            if ENABLE_STREAMING and APPSYNC_GRAPHQL_URL:
                logger.info("Streaming mode enabled with Gemini - sending tokens to AppSync")
                
                sequence = 0
                full_response = []
                
                # Stream from Gemini API
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:streamGenerateContent"
                params = {'key': gemini_api_key, 'alt': 'sse'}
                
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
                
                try:
                    response = requests.post(url, params=params, json=payload, stream=True, timeout=60)
                    
                    if response.status_code == 200:
                        # Parse SSE stream
                        for line in response.iter_lines():
                            if line:
                                line_str = line.decode('utf-8')
                                
                                if line_str.startswith('data: '):
                                    data_json = line_str[6:]
                                    
                                    try:
                                        data = json.loads(data_json)
                                        
                                        # Extract text from response
                                        if 'candidates' in data:
                                            for candidate in data['candidates']:
                                                if 'content' in candidate:
                                                    for part in candidate['content'].get('parts', []):
                                                        if 'text' in part:
                                                            token_text = part['text']
                                                            full_response.append(token_text)
                                                            
                                                            # Send token to AppSync
                                                            send_chat_token_to_appsync(
                                                                call_id=call_id,
                                                                message_id=message_id,
                                                                token=token_text,
                                                                is_complete=False,
                                                                sequence=sequence
                                                            )
                                                            sequence += 1
                                    
                                    except json.JSONDecodeError:
                                        continue
                        
                        # Send completion token
                        send_chat_token_to_appsync(
                            call_id=call_id,
                            message_id=message_id,
                            token='',
                            is_complete=True,
                            sequence=sequence
                        )
                        
                        response_text = ''.join(full_response)
                        logger.info(f"Gemini streaming complete. Total tokens: {sequence}")
                    
                    else:
                        logger.error(f"Gemini API error: {response.status_code}")
                        response_text = f"Error: Gemini API returned {response.status_code}"
                
                except Exception as stream_error:
                    logger.error(f"Gemini streaming error: {str(stream_error)}")
                    response_text = f"Streaming error: {str(stream_error)}"
                
            else:
                # Non-streaming mode with Gemini
                logger.info("Non-streaming mode with Gemini")
                
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
                params = {'key': gemini_api_key}
                
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
                
                try:
                    response = requests.post(url, params=params, json=payload, timeout=30)
                    
                    if response.status_code == 200:
                        result = response.json()
                        
                        # Extract text
                        if 'candidates' in result and len(result['candidates']) > 0:
                            candidate = result['candidates'][0]
                            if 'content' in candidate:
                                parts = candidate['content'].get('parts', [])
                                if parts and 'text' in parts[0]:
                                    response_text = parts[0]['text']
                                else:
                                    response_text = "No response generated"
                            else:
                                response_text = "No response generated"
                        else:
                            response_text = "No response generated"
                    else:
                        logger.error(f"Gemini API error: {response.status_code}")
                        response_text = f"Error: Gemini API returned {response.status_code}"
                
                except Exception as gen_error:
                    logger.error(f"Gemini generation error: {str(gen_error)}")
                    response_text = f"Error: {str(gen_error)}"
            
            logger.info(f"Gemini response generated: {len(response_text)} characters")
            
            # Format response for LMA
            return {
                'message': response_text,
                'callId': call_id,
                'source': 'gemini_rag',
                'context_used': {
                    'has_transcript': bool(transcript),
                    'has_kb_context': bool(kb_context)
                }
            }
            
        except ImportError as e:
            logger.error(f"Required module not available: {e}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': f'Import error: {str(e)}',
                    'callId': call_id
                })
            }
            
    except Exception as e:
        logger.error(f"Error in Strands meeting assist: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Internal error: {str(e)}',
                'callId': call_id
            })
        }

def get_meeting_assistant_prompt() -> str:
    """
    Returns the system prompt for the meeting assistant
    """
    return """You are an AI assistant helping participants during a live meeting. Your role is to:

1. Answer questions based on the meeting context and transcript
2. Provide helpful information relevant to the discussion
3. Keep responses concise and focused (under 100 words when possible)
4. If you don't have enough context from the meeting transcript, use your general knowledge
5. Be professional and supportive

When responding:
- Reference specific parts of the meeting transcript when relevant
- Provide actionable insights when possible
- Ask clarifying questions if the request is ambiguous
- Maintain a helpful and professional tone"""

# Removed fallback_bedrock_response - No longer using AWS Bedrock
# All chat functionality now uses Gemini + Supabase RAG
