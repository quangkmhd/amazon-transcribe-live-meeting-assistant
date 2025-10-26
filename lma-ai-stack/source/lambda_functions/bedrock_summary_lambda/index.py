# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

#
# Summary generation using Gemini API (AWS-free replacement for Bedrock)

import os
import json
import re
import requests
from typing import Dict, Any, Optional

import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Gemini API Configuration (replaces AWS Bedrock)
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

# Supabase configuration (replaces DynamoDB)
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# Import Supabase client
try:
    from supabase import create_client, Client
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Legacy environment variables (for backward compatibility)
PROCESS_TRANSCRIPT = (os.getenv('PROCESS_TRANSCRIPT', 'False') == 'True')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0'))  # default 0 - do not truncate

def get_templates_from_supabase(prompt_override):
    """Get prompt templates from Supabase (replaces DynamoDB)"""
    templates = []
    prompt_template_str = None

    if prompt_override is not None:
        print("Prompt Template String override:", prompt_override)
        prompt_template_str = prompt_override
        try:
            prompt_templates = json.loads(prompt_template_str)
            for k, v in prompt_templates.items():
                prompt = v.replace("<br>", "\n")
                templates.append({k: prompt})
        except:
            prompt = prompt_template_str.replace("<br>", "\n")
            templates.append({
                "Summary": prompt
            })

    if prompt_template_str is None:
        try:
            # Query Supabase for prompt templates (replaces DynamoDB)
            # Default template
            default_response = supabase.table('prompt_templates')\
                .select('templates')\
                .eq('template_id', 'DefaultSummaryPromptTemplates')\
                .single()\
                .execute()
            
            # Custom template
            custom_response = supabase.table('prompt_templates')\
                .select('templates')\
                .eq('template_id', 'CustomSummaryPromptTemplates')\
                .single()\
                .execute()
            
            # Extract the 'templates' JSONB field (not the whole row)
            defaultPromptTemplates = default_response.data.get('templates', {}) if default_response.data else {}
            customPromptTemplates = custom_response.data.get('templates', {}) if custom_response.data else {}
            
            print("Default Prompt Template:", defaultPromptTemplates)
            print("Custom Template:", customPromptTemplates)

            # Merge templates (custom overrides default)
            mergedPromptTemplates = {**defaultPromptTemplates, **customPromptTemplates}
            print("Merged Prompt Template:", mergedPromptTemplates)

            for k in sorted(mergedPromptTemplates):
                prompt = mergedPromptTemplates[k]
                # skip if prompt value is empty, or set to 'NONE'
                if (prompt and prompt != 'NONE'):
                    prompt = prompt.replace("<br>", "\n")
                    # Handle keys with # prefix (e.g., "001#Summary" → "Summary")
                    index = k.find('#')
                    k_stripped = k[index+1:] if index >= 0 else k
                    templates.append({k_stripped: prompt})
        except Exception as e:
            print("Exception loading templates from Supabase:", e)
            # Fallback to default summary template
            templates.append({
                "Summary": """Please provide a summary of the following meeting transcript:

{transcript}

Include:
- Key discussion points
- Decisions made
- Action items
- Participants"""
            })

    return templates

def get_transcripts(callId):
    """Get transcripts directly from Supabase (replaces Lambda invoke)"""
    print(f"Fetching transcripts for call {callId}")
    
    try:
        # Import fetch_transcript logic directly
        import sys
        import os
        fetch_path = os.path.join(os.path.dirname(__file__), '../fetch_transcript')
        if fetch_path not in sys.path:
            sys.path.insert(0, fetch_path)
        
        from index import lambda_handler as fetch_handler
        
        # Call fetch_transcript directly (no Lambda invoke)
        payload = {
            'CallId': callId,
            'ProcessTranscript': PROCESS_TRANSCRIPT,
            'TokenCount': TOKEN_COUNT,
            'IncludeSpeaker': True
        }
        
        transcript_json = fetch_handler(payload, None)
        print("Transcript JSON:", transcript_json)
        return transcript_json
        
    except Exception as e:
        logger.error(f"Error fetching transcripts: {str(e)}")
        return {
            'transcript': '',
            'metadata': {'CallId': callId}
        }

def call_gemini(prompt_data):
    """Call Gemini API (replaces AWS Bedrock)"""
    print(f"Gemini request - Model: {GEMINI_MODEL}")
    
    try:
        url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL}:generateContent"
        params = {'key': GEMINI_API_KEY}
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt_data}]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 1024,
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
            return f"Error: API returned {response.status_code}"
        
        result = response.json()
        
        # Extract text from response
        if 'candidates' in result and len(result['candidates']) > 0:
            candidate = result['candidates'][0]
            if 'content' in candidate:
                parts = candidate['content'].get('parts', [])
                if parts and 'text' in parts[0]:
                    generated_text = parts[0]['text']
                    print("Gemini response: ", json.dumps(generated_text))
                    return generated_text
        
        return "No summary generated"
        
    except Exception as e:
        logger.error(f"Error calling Gemini: {str(e)}")
        return f"Error: {str(e)}"

def generate_summary(transcript, prompt_override):
    """Generate summary using Gemini (replaces Bedrock)"""
    # first check to see if this is one prompt, or many prompts as a json
    templates = get_templates_from_supabase(prompt_override)
    result = {}
    for item in templates:
        key = list(item.keys())[0]
        prompt = item[key]
        prompt = prompt.replace("{transcript}", transcript)
        print("Prompt:", prompt)
        response = call_gemini(prompt)  # Use Gemini instead of Bedrock
        print("API Response:", response)
        result[key] = response
    if len(result.keys()) == 1:
        # there's only one summary in here, so let's return just that.
        # this may contain json or a string.
        return result[list(result.keys())[0]]
    return json.dumps(result)

def posixify_filename(filename: str) -> str:
    # Replace all invalid characters with underscores
    regex = r'[^a-zA-Z0-9_.]'
    posix_filename = re.sub(regex, '_', filename)
    # Remove leading and trailing underscores
    posix_filename = re.sub(r'^_+', '', posix_filename)
    posix_filename = re.sub(r'_+$', '', posix_filename)
    return posix_filename

def getKBMetadata(metadata):
    # Keys to include
    keys_to_include = ["CallId", "CreatedAt", "UpdatedAt", "Owner", "TotalConversationDurationMillis"]
    # Create a new dictionary with only the specified keys
    filtered_metadata = {key: metadata[key] for key in keys_to_include if key in metadata}
    kbMetadata = {
        "metadataAttributes": filtered_metadata
    }
    return json.dumps(kbMetadata)

def format_summary(summary, metadata):
    summary_dict = json.loads(summary)
    summary_dict["MEETING NAME"]=metadata["CallId"]
    summary_dict["MEETING DATE AND TIME"]=metadata["CreatedAt"]
    summary_dict["MEETING DURATION (SECONDS)"]=int(metadata["TotalConversationDurationMillis"]/1000)
    return json.dumps(summary_dict)

def write_to_supabase(callId, metadata, transcript, summary):
    """Store summary in Supabase (replaces S3)"""
    try:
        filename = posixify_filename(f"{callId}")
        summary_formatted = format_summary(summary, metadata)
        
        # Store in Supabase table instead of S3
        summary_record = {
            'meeting_id': callId,
            'summary': summary_formatted,
            'transcript': transcript,
            'metadata': metadata,
            'created_at': metadata.get('CreatedAt', ''),
            'owner_email': metadata.get('Owner', 'unknown@example.com')
        }
        
        # Upsert into meeting_summaries table
        response = supabase.table('meeting_summaries')\
            .upsert(summary_record, on_conflict='meeting_id')\
            .execute()
        
        print(f"Wrote summary to Supabase for meeting {callId}")
        return True
        
    except Exception as e:
        logger.error(f"Error writing summary to Supabase: {str(e)}")
        return False

def handler(event, context):
    """Lambda handler - now uses Gemini + Supabase (AWS-free)"""
    print("Received event: ", json.dumps(event))
    callId = event['CallId']
    try:
        transcript_json = get_transcripts(callId)
        transcript = transcript_json['transcript']
        metadata = transcript_json['metadata']
        summary = "No summary available"
        prompt_override = None
        if 'Prompt' in event:
            prompt_override = event['Prompt']
        summary = generate_summary(transcript, prompt_override)
        if not prompt_override:
            # Store to Supabase instead of S3 (AWS-free)
            write_to_supabase(callId, metadata, transcript, summary)
    except Exception as e:
        print(e)
        summary = 'An error occurred.'
    print("Returning: ", json.dumps({"summary": summary}))
    return {"summary": summary}
    
# for testing on terminal
if __name__ == "__main__":
    event = {
        "CallId": "8cfc6ec4-0dbe-4959-b1f3-34f13359826b"
    }
    handler(event)
