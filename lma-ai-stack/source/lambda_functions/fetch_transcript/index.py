# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

#
import os
import io
import json
import logging
import re

# Supabase client (AWS-free replacement for DynamoDB)
try:
    from supabase import create_client, Client
except ImportError:
    import subprocess
    subprocess.check_call(['pip', 'install', 'supabase'])
    from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

issue_remover = re.compile('<span class=\'issue-pill\'>Issue Detected</span>')
html_remover = re.compile('<[^>]*>')
filler_remover = re.compile('(^| )([Uu]m|[Uu]h|[Ll]ike|[Mm]hm)[,]?')

def get_call_metadata(callid):
    """Get call metadata from Supabase (replaces DynamoDB)"""
    print(f"Fetching call metadata for: {callid}")
    try:
        # Query meetings table in Supabase
        response = supabase.table('meetings')\
            .select('*')\
            .eq('meeting_id', callid)\
            .single()\
            .execute()
        
        if response.data:
            return response.data
        else:
            logger.warning(f"No metadata found for call {callid}")
            return {}
            
    except Exception as err:
        logger.error(f"Error getting metadata from Supabase: {str(err)}")
        # Return minimal metadata to avoid breaking downstream
        return {
            'CallId': callid,
            'CreatedAt': '',
            'UpdatedAt': '',
            'Owner': 'unknown@example.com'
        }

def get_transcripts(callid):
    """Get transcripts from Supabase (replaces DynamoDB)"""
    print(f"Fetching transcripts for: {callid}")
    try:
        # Query transcript_events table in Supabase
        response = supabase.table('transcript_events')\
            .select('*')\
            .eq('meeting_id', callid)\
            .eq('is_final', True)\
            .order('end_time', desc=False)\
            .execute()
        
        # Map Supabase fields to expected DynamoDB format
        items = []
        for row in response.data:
            item = {
                'CallId': row.get('meeting_id'),
                'Channel': row.get('channel', 'CALLER'),  # Map channel
                'Transcript': row.get('transcript', ''),
                'Speaker': row.get('speaker_name') or row.get('speaker_number', 'Unknown'),
                'StartTime': row.get('start_time', 0),
                'EndTime': row.get('end_time', 0),
                'IsPartial': False  # Already filtered
            }
            items.append(item)
        
        return items
            
    except Exception as err:
        logger.error(f"Error getting transcripts from Supabase: {str(err)}")
        return []


def preprocess_transcripts(transcripts, condense, includeSpeaker):
    data = []
    transcripts.sort(key=lambda x: x['EndTime'])
    for row in transcripts:
        transcript = row['Transcript']        
        # prefix Speaker name to transcript segments if "IncludeSpeaker" parameter is set to True. 
        if includeSpeaker == True:
            # For LMA 'OK Assistant' answers, we should keep assistant replies as part of the transcript for any contextual followup 'OK Assistant' questions.
            if row['Channel'] == 'AGENT_ASSISTANT':
                # Add the 'MeetingAssistant:' prefix for assistant messages
                transcript = "MeetingAssistant: " + transcript
            else: 
                # Add the 'Speaker:' prefix for Transcript segments if "Speaker" field is present
                speakerName = row.get('Speaker', None)
                if speakerName:
                    transcript = speakerName.strip() + ': ' + transcript
                    
        if condense == True:
            transcript = remove_issues(transcript)
            transcript = remove_html(transcript)
            transcript = remove_filler_words(transcript).strip()
            if len(transcript) > 1:
                transcript = '\n' + transcript
        else:
            transcript = '\n' + transcript
        data.append(transcript)
    return data


def remove_issues(transcript_string):
    return re.sub(issue_remover, '', transcript_string)


def remove_html(transcript_string):
    return re.sub(html_remover, '', transcript_string)


def remove_filler_words(transcript_string):
    return re.sub(filler_remover, '', transcript_string)


def truncate_number_of_words(transcript_string, truncateLength):
    # findall can retain carriage returns
    data = re.findall(r'\S+|\n|.|,', transcript_string)
    if truncateLength > 0:
        data = data[0:truncateLength]
    print('Token Count: ' + str(len(data)))
    return ''.join(data)


def lambda_handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))

    # Setup model input data using text (utterances) received from LCA
    data = json.loads(json.dumps(event))
    callid = data['CallId']
    tokenCount = 0
    if 'TokenCount' in data:
        tokenCount = data['TokenCount']

    preProcess = False
    if 'ProcessTranscript' in data:
        preProcess = data['ProcessTranscript']

    includeSpeaker = False
    if 'IncludeSpeaker' in data:
        includeSpeaker = data['IncludeSpeaker']
        
    transcripts = get_transcripts(callid)
    transcripts = preprocess_transcripts(transcripts, preProcess, includeSpeaker)
    transcript_string = ''.join(transcripts)
    transcript_string = truncate_number_of_words(transcript_string, tokenCount)
    metadata = get_call_metadata(callid)
    response = {
        'transcript': transcript_string,
        'metadata': metadata
    }
    print("Fetch Transcript response:", response)
    return response


# Test case
if __name__ == '__main__':
    lambda_handler({
        "CallId": "2359fb61-f612-4fe9-bce2-839061c328f9",
        "TokenCount": 0,
        "ProcessTranscript": False,
        "LastNTurns": 20
    }, {})
