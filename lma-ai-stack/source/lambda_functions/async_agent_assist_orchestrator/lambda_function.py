#!/usr/bin/env python3.12
# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

from os import getenv
from typing import TYPE_CHECKING, Any, Coroutine, Dict, List, Literal, Optional
import json
import re
import uuid

from datetime import datetime
from eventprocessor_utils import (
    get_transcription_ttl
)

# Try to import Supabase utilities (AWS-free alternative to Kinesis)
try:
    from supabase_utils import realtime as supabase_realtime
    _SUPABASE_AVAILABLE = True
except ImportError:
    supabase_realtime = None
    _SUPABASE_AVAILABLE = False

# Conditional import - Lex is optional (can use Lambda/Gemini agent assist instead)
try:
    from lex_utils import recognize_text_lex
    _LEX_AVAILABLE = True
except ImportError:
    _LEX_AVAILABLE = False
    def recognize_text_lex(*args, **kwargs):
        raise NotImplementedError("Lex utils not available - use IS_LAMBDA_AGENT_ASSIST_ENABLED instead")

# third-party imports from Lambda layer - with fallbacks for non-AWS environments
try:
    from aws_lambda_powertools import Logger  # type: ignore
    from aws_lambda_powertools.utilities.typing import LambdaContext  # type: ignore
except ImportError:
    import logging
    class Logger:  # Minimal shim
        def __init__(self, location: str = "", child: bool = False):
            self._l = logging.getLogger(__name__)
            if not self._l.handlers:
                handler = logging.StreamHandler()
                formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
                handler.setFormatter(formatter)
                self._l.addHandler(handler)
            self._l.setLevel(logging.INFO)
        def info(self, msg, *args, **kwargs):
            self._l.info(msg)
        def debug(self, msg, *args, **kwargs):
            self._l.debug(msg)
        def warning(self, msg, *args, **kwargs):
            self._l.warning(msg)
        def error(self, msg, *args, **kwargs):
            self._l.error(msg)
        def inject_lambda_context(self, func):
            return func
    class LambdaContext:  # type: ignore
        pass

try:
    import boto3  # type: ignore
    from botocore.config import Config as BotoCoreConfig  # type: ignore
    _BOTO3_AVAILABLE = True
except ImportError:
    boto3 = None  # type: ignore
    BotoCoreConfig = None  # type: ignore
    _BOTO3_AVAILABLE = False


# pylint: enable=import-error
LOGGER = Logger(location="%(filename)s:%(lineno)d - %(funcName)s()")

if TYPE_CHECKING:
    from mypy_boto3_lambda.client import LambdaClient
    from mypy_boto3_kinesis.client import KinesisClient
    from mypy_boto3_lexv2_runtime.type_defs import RecognizeTextResponseTypeDef
    from mypy_boto3_lexv2_runtime.client import LexRuntimeV2Client
    from boto3 import Session as Boto3Session
else:
    Boto3Session = object
    LambdaClient = object
    KinesisClient = object
    LexRuntimeV2Client = object
    RecognizeTextResponseTypeDef = object

if _BOTO3_AVAILABLE:
    try:
        BOTO3_SESSION: Boto3Session = boto3.Session()  # type: ignore
        CLIENT_CONFIG = BotoCoreConfig(  # type: ignore
            retries={"mode": "adaptive", "max_attempts": 3},
        )

        LAMBDA_CLIENT: LambdaClient = BOTO3_SESSION.client(  # type: ignore
            "lambda",
            config=CLIENT_CONFIG,
        )
        KINESIS_CLIENT: KinesisClient = BOTO3_SESSION.client(  # type: ignore
            "kinesis"
        )

        LEXV2_CLIENT: LexRuntimeV2Client = BOTO3_SESSION.client(  # type: ignore
            "lexv2-runtime",
            config=CLIENT_CONFIG,
        )
    except Exception as e:
        # boto3 available but AWS not configured (no credentials/region)
        import logging
        logging.getLogger(__name__).info(f"AWS services not available: {e}")
        BOTO3_SESSION = None  # type: ignore
        CLIENT_CONFIG = None  # type: ignore
        LAMBDA_CLIENT = None  # type: ignore
        KINESIS_CLIENT = None  # type: ignore
        LEXV2_CLIENT = None  # type: ignore
else:
    BOTO3_SESSION = None  # type: ignore
    CLIENT_CONFIG = None  # type: ignore
    LAMBDA_CLIENT = None  # type: ignore
    KINESIS_CLIENT = None  # type: ignore
    LEXV2_CLIENT = None  # type: ignore

CALL_DATA_STREAM_NAME = getenv("CALL_DATA_STREAM_NAME", "")

LEX_BOT_ID = getenv("LEX_BOT_ID", "")
LEX_BOT_ALIAS_ID = getenv("LEX_BOT_ALIAS_ID", "")
LEX_BOT_LOCALE_ID = getenv("LEX_BOT_LOCALE_ID", "")

LAMBDA_AGENT_ASSIST_FUNCTION_ARN = getenv(
    "LAMBDA_AGENT_ASSIST_FUNCTION_ARN", "")

IS_LEX_AGENT_ASSIST_ENABLED = getenv(
    "IS_LEX_AGENT_ASSIST_ENABLED", "false").lower() == "true"
IS_LAMBDA_AGENT_ASSIST_ENABLED = getenv(
    "IS_LAMBDA_AGENT_ASSIST_ENABLED", "false").lower() == "true"

DYNAMODB_TABLE_NAME = getenv("DYNAMODB_TABLE_NAME", "")


def write_agent_assist_to_kds(
    message: Dict[str, Any]
):
    """
    Write agent assist event to data stream
    Supports: Kinesis (AWS) OR Supabase Realtime (AWS-free)
    """
    callId = message.get("CallId", None)
    message['EventType'] = "ADD_AGENT_ASSIST"

    if not callId:
        return
    
    event_written = False
    
    # Try Supabase Realtime first (AWS-free)
    if _SUPABASE_AVAILABLE and supabase_realtime:
        try:
            success = supabase_realtime.publish_agent_assist_event(
                call_id=callId,
                transcript=message.get('Transcript', ''),
                segment_id=message.get('SegmentId', ''),
                **message
            )
            if success:
                LOGGER.info("✅ AGENT_ASSIST event published to Supabase Realtime")
                event_written = True
        except Exception as error:
            LOGGER.warning(f"Supabase Realtime publish failed: {error}, trying Kinesis")
    
    # Fallback to Kinesis if Supabase failed or unavailable
    if not event_written and KINESIS_CLIENT and CALL_DATA_STREAM_NAME:
        try:
            KINESIS_CLIENT.put_record(  # type: ignore
                StreamName=CALL_DATA_STREAM_NAME,
                PartitionKey=callId,
                Data=json.dumps(message)
            )
            LOGGER.info("Write AGENT_ASSIST event to Kinesis")
            event_written = True
        except Exception as error:
            LOGGER.error(f"Error writing AGENT_ASSIST event to Kinesis: {error}")
    
    if not event_written:
        LOGGER.info("[LOCAL] AGENT_ASSIST event (no stream): %s", json.dumps(message))
    
    return


def publish_lex_agent_assist_transcript_segment(
    message: Dict[str, Any],
):
    """Add Lex Agent Assist GraphQL Mutations"""
    # pylint: disable=too-many-locals

    if 'ContactId' in message.keys():
        publish_contact_lens_lex_agent_assist_transcript_segment(message)
        return

    call_id: str = message["CallId"]
    channel: str = message["Channel"]
    is_partial: bool = message["IsPartial"]
    segment_id: str = message["SegmentId"]
    start_time: float = message["StartTime"]
    end_time: float = message["EndTime"]
    end_time = float(end_time) + 0.001  # UI sort order
    # Use "OriginalTranscript", if defined (optionally set by transcript lambda hook fn)"
    transcript: str = message.get("OriginalTranscript", message["Transcript"])
    created_at = datetime.utcnow().astimezone().isoformat()
    status: str = message["Status"]
    idToken: str = message["IdToken"]
    refreshToken: str = message["RefreshToken"]
    accessToken: str = message["AccessToken"]

    transcript_segment_args = dict(
        CallId=call_id,
        Channel="AGENT_ASSISTANT",
        CreatedAt=created_at,
        EndTime=end_time,
        ExpiresAfter=get_transcription_ttl(),
        IsPartial=is_partial,
        SegmentId=str(uuid.uuid4()),
        StartTime=start_time,
        Status="TRANSCRIBING",
        IdToken=idToken,
        RefreshToken=refreshToken,
        AccessToken=accessToken
    )
    lex_agent_assist_input = dict(
        content=transcript,
        transcript_segment_args=transcript_segment_args
    )

    # write initial message to indicate that wake word was detected and request submitted.
    transcript_segment = {**transcript_segment_args,
                          "Transcript": "Checking...", "IsPartial": True}
    write_agent_assist_to_kds(transcript_segment)

    transcript_segment = get_lex_agent_assist_transcript(
        **lex_agent_assist_input,
    )

    write_agent_assist_to_kds(transcript_segment)


def get_lex_agent_assist_transcript(
    transcript_segment_args: Dict[str, Any],
    content: str,
):
    """Sends Lex Agent Assist Requests"""
    LOGGER.info("Bot Request: %s", content)

    request_attributes = {
        "callId": transcript_segment_args["CallId"],
        "idtokenjwt": transcript_segment_args["IdToken"],
        "accesstokenjwt": transcript_segment_args["AccessToken"],
        "refreshtoken": transcript_segment_args["RefreshToken"],
    }

    bot_response: RecognizeTextResponseTypeDef = recognize_text_lex(
        text=content,
        session_id=str(hash(transcript_segment_args["CallId"])),
        lex_client=LEXV2_CLIENT,
        bot_id=LEX_BOT_ID,
        bot_alias_id=LEX_BOT_ALIAS_ID,
        locale_id=LEX_BOT_LOCALE_ID,
        request_attributes=request_attributes,
    )

    LOGGER.info("Bot Response: ", extra=bot_response)

    transcript_segment = {}
    transcript = process_lex_bot_response(bot_response)
    if transcript:
        transcript_segment = {
            **transcript_segment_args, "Transcript": transcript}

    return transcript_segment


def process_lex_bot_response(bot_response):
    message = ""
    # Use markdown if present in appContext.altMessages.markdown session attr (Lex Web UI / QnABot)
    appContextJSON = bot_response.get("sessionState", {}).get(
        "sessionAttributes", {}).get("appContext")
    if appContextJSON:
        appContext = json.loads(appContextJSON)
        markdown = appContext.get("altMessages", {}).get("markdown")
        if markdown:
            message = markdown
    # otherwise use bot message
    if not message and "messages" in bot_response and bot_response["messages"]:
        message = bot_response["messages"][0]["content"]
    return message


def is_qnabot_debug_response(message):
    # QnABot debug responses are contained in opening [] section, starting with User Input
    pattern = r'^\**\[User Input.*?\]\**'
    match = re.search(pattern, message)
    if match:
        return match.group()
    return None


def is_qnabot_noanswer(bot_response):
    if (
        bot_response["sessionState"]["dialogAction"]["type"] == "Close"
        and (
            bot_response["sessionState"]
            .get("sessionAttributes", {})
            .get("qnabot_gotanswer")
            == "false"
        )
    ):
        return True
    return False


def publish_lambda_agent_assist_transcript_segment(
    message: Dict[str, Any],
):

    if 'ContactId' in message.keys():
        publish_contact_lens_lambda_agent_assist_transcript_segment(message)
        return

    """Add Lambda Agent Assist GraphQL Mutations"""
    # pylint: disable=too-many-locals

    call_id: str = message["CallId"]
    channel: str = message["Channel"]
    is_partial: bool = message["IsPartial"]
    segment_id: str = message["SegmentId"]
    start_time: float = message["StartTime"]
    end_time: float = message["EndTime"]
    end_time = float(end_time) + 0.001  # UI sort order
    # Use "OriginalTranscript", if defined (optionally set by transcript lambda hook fn)"
    transcript: str = message.get("OriginalTranscript", message["Transcript"])
    created_at = datetime.utcnow().astimezone().isoformat()

    # Determine response channel based on input channel
    response_channel = "CHAT_ASSISTANT" if channel == "CHAT_ASSISTANT" else "AGENT_ASSISTANT"
    
    # Extract MessageId if provided (for chat streaming)
    message_id = message.get("MessageId")
    
    transcript_segment_args = dict(
        CallId=call_id,
        Channel=response_channel,
        CreatedAt=created_at,
        EndTime=end_time,
        ExpiresAfter=get_transcription_ttl(),
        IsPartial=is_partial,
        SegmentId=str(uuid.uuid4()),
        StartTime=start_time,
        Status="TRANSCRIBING",
    )
    
    # Add MessageId if provided (for token streaming)
    if message_id:
        transcript_segment_args["MessageId"] = message_id
    
    # Extract owner email from message
    owner_email = message.get("Owner")
    
    lambda_agent_assist_input = dict(
        content=transcript,
        transcript_segment_args=transcript_segment_args,
        owner_email=owner_email,
    )

    transcript_segment = get_lambda_agent_assist_transcript(
        **lambda_agent_assist_input,
    )

    write_agent_assist_to_kds(transcript_segment)
    
    # Return the transcript segment for synchronous callers
    return transcript_segment


def get_lambda_agent_assist_transcript(
    transcript_segment_args: Dict[str, Any],
    content: str,
    owner_email: Optional[str] = None,
):
    """Sends Agent Assist Requests directly to Gemini Chat Service (AWS-free)"""
    call_id = transcript_segment_args["CallId"]
    message_id = transcript_segment_args.get("MessageId", str(uuid.uuid4()))

    LOGGER.info("Agent Assist Gemini Request: %s", content)

    # Direct call to Gemini chat service (no Lambda invoke)
    try:
        # Import Gemini chat service
        import sys
        import os
        gemini_path = os.path.join(os.path.dirname(__file__), '../gemini_chat_service')
        if gemini_path not in sys.path:
            sys.path.insert(0, gemini_path)
        
        from index import lambda_handler as gemini_handler
        
        # Prepare event for Gemini chat service
        gemini_event = {
            'CallId': call_id,
            'MessageId': message_id,
            'Message': content,
            'Owner': owner_email or 'unknown@example.com',
            'EnableStreaming': False  # Use non-streaming for synchronous response
        }
        
        # Call Gemini chat service directly
        response = gemini_handler(gemini_event, None)
        
        # Extract message from response
        transcript = response.get('message', '')
        
        LOGGER.info("Agent Assist Gemini Response received")
        
        transcript_segment = {}
        if transcript:
            transcript_segment = {
                **transcript_segment_args, "Transcript": transcript}
        
        return transcript_segment
        
    except Exception as error:
        LOGGER.error(
            "Agent assist Gemini call exception: %s",
            error,
        )
        # Return error message to user
        transcript_segment = {
            **transcript_segment_args, 
            "Transcript": f"Error: Unable to generate response. {str(error)}"
        }
        return transcript_segment


def transform_segment_to_issues_agent_assist(
        segment: Dict[str, Any],
        issue: Dict[str, Any],
) -> Dict[str, Any]:
    """Transforms Contact Lens Transcript Issues payload to Agent Assist"""
    # pylint: disable=too-many-locals
    call_id: str = segment["CallId"]
    created_at = datetime.utcnow().astimezone().isoformat()
    is_partial = False
    segment_id = str(uuid.uuid4())
    channel = "AGENT_ASSISTANT"
    segment_item = segment["ContactLensTranscript"]
    transcript = segment_item["Content"]

    issues_detected = segment.get(
        "ContactLensTranscript", {}).get("IssuesDetected", [])
    if not issues_detected:
        raise ValueError("Invalid issue segment")

    begin_offset = issue["CharacterOffsets"]["BeginOffsetChar"]
    end_offset = issue["CharacterOffsets"]["EndOffsetChar"]
    issue_transcript = transcript[begin_offset:end_offset]
    start_time: float = segment_item["BeginOffsetMillis"] / 1000
    end_time: float = segment_item["EndOffsetMillis"] / 1000
    end_time = end_time + 0.001  # UI sort order

    return dict(
        CallId=call_id,
        Channel=channel,
        CreatedAt=created_at,
        ExpiresAfter=get_transcription_ttl(),
        EndTime=end_time,
        IsPartial=is_partial,
        SegmentId=segment_id,
        StartTime=start_time,
        Status="TRANSCRIBING",
        Transcript=issue_transcript,
    )


def publish_contact_lens_lex_agent_assist_transcript_segment(
    segment: Dict[str, Any],
):
    """Add Lex Agent Assist GraphQL Mutations"""
    # pylint: disable=too-many-locals
    call_id: str = segment["ContactId"]
    channel: str = "AGENT_ASSISTANT"
    status: str = "TRANSCRIBING"
    is_partial: bool = False

    created_at: str
    start_time: float
    end_time: float

    send_lex_agent_assist_args = []
    LOGGER.info("LEX CONTACT LENS SEGMENT %s", json.dumps(segment))

    # only send relevant segments to agent assist
    # BobS: Modified to process Utterance rather than Transcript events
    # to lower latency
    if not ("Utterance" in segment or "Categories" in segment):
        return

    if (
        "Utterance" in segment
        and segment["Utterance"].get("ParticipantRole") == "CUSTOMER"
    ):
        is_partial = False
        segment_item = segment["Utterance"]
        content = segment_item["PartialContent"]
        segment_id = str(uuid.uuid4())

        created_at = datetime.utcnow().astimezone().isoformat()
        start_time = segment_item["BeginOffsetMillis"] / 1000
        end_time = segment_item["EndOffsetMillis"] / 1000
        end_time = end_time + 0.001  # UI sort order

        send_lex_agent_assist_args.append(
            dict(
                content=content,
                transcript_segment_args=dict(
                    CallId=call_id,
                    Channel=channel,
                    CreatedAt=created_at,
                    EndTime=end_time,
                    ExpiresAfter=get_transcription_ttl(),
                    IsPartial=is_partial,
                    SegmentId=segment_id,
                    StartTime=start_time,
                    Status=status,
                ),
            )
        )

    issues_detected = segment.get(
        "ContactLensTranscript", {}).get("IssuesDetected", [])
    for issue in issues_detected:
        issue_segment = transform_segment_to_issues_agent_assist(
            segment={**segment, "CallId": call_id},
            issue=issue,
        )
        send_lex_agent_assist_args.append(
            dict(content=issue_segment["Transcript"],
                 transcript_segment_args=issue_segment),
        )

    categories = segment.get("Categories", {})
    for category in categories.get("MatchedCategories", []):
        category_details = categories["MatchedDetails"][category]
        category_segment = transform_segment_to_categories_agent_assist(
            category=category,
            category_details=category_details,
            call_id=call_id,
        )
        send_lex_agent_assist_args.append(
            dict(
                content=category_segment["Transcript"],
                transcript_segment_args=category_segment,
            ),
        )

    for agent_assist_args in send_lex_agent_assist_args:
        transcript_segment = get_lex_agent_assist_transcript(
            **agent_assist_args,
        )

        write_agent_assist_to_kds(transcript_segment)

    return


def transform_segment_to_categories_agent_assist(
        category: str,
        category_details: Dict[str, Any],
        call_id: str,
) -> Dict[str, Any]:
    """Transforms Contact Lens Categories segment payload to Agent Assist"""
    created_at = datetime.utcnow().astimezone().isoformat()
    is_partial = False
    segment_id = str(uuid.uuid4())
    channel = "AGENT_ASSISTANT"

    transcript = f"{category}"
    # get the min and maximum offsets to put a time range
    segment_item = {}
    segment_item["BeginOffsetMillis"] = min(
        (
            point_of_interest["BeginOffsetMillis"]
            for point_of_interest in category_details["PointsOfInterest"]
        )
    )
    segment_item["EndOffsetMillis"] = max(
        (
            point_of_interest["EndOffsetMillis"]
            for point_of_interest in category_details["PointsOfInterest"]
        )
    )

    start_time: float = segment_item["BeginOffsetMillis"] / 1000
    end_time: float = segment_item["EndOffsetMillis"] / 1000

    return dict(
        CallId=call_id,
        Channel=channel,
        CreatedAt=created_at,
        ExpiresAfter=get_transcription_ttl(),
        EndTime=end_time,
        IsPartial=is_partial,
        SegmentId=segment_id,
        StartTime=start_time,
        Status="TRANSCRIBING",
        Transcript=transcript,
    )


def publish_contact_lens_lambda_agent_assist_transcript_segment(
        segment: Dict[str, Any],
):
    """Add Lambda Agent Assist GraphQL Mutations"""
    # pylint: disable=too-many-locals
    call_id: str = segment["ContactId"]
    channel: str = "AGENT_ASSISTANT"
    status: str = "TRANSCRIBING"
    is_partial: bool = False

    created_at: str
    start_time: float
    end_time: float

    send_lambda_agent_assist_args = []
    # only send relevant segments to agent assist
    # BobS: Modified to process Utterance rather than Transcript events
    # to lower latency
    # Kishore: Switch back to using Transcript events because Utterances
    # do not have is_partial flag and does not contain full transcripts
    # anymore.
    if not ("ContactLensTranscript" in segment or "Categories" in segment):
        return

    if (
        "Utterance" in segment
        and segment["Utterance"].get("ParticipantRole") == "CUSTOMER"
    ):
        is_partial = False
        segment_item = segment["Utterance"]
        content = segment_item["PartialContent"]
        segment_id = str(uuid.uuid4())

        created_at = datetime.utcnow().astimezone().isoformat()
        start_time = segment_item["BeginOffsetMillis"] / 1000
        end_time = segment_item["EndOffsetMillis"] / 1000
        end_time = end_time + 0.001  # UI sort order

        send_lambda_agent_assist_args.append(
            dict(
                content=content,
                transcript_segment_args=dict(
                    CallId=call_id,
                    Channel=channel,
                    CreatedAt=created_at,
                    ExpiresAfter=get_transcription_ttl(),
                    EndTime=end_time,
                    IsPartial=is_partial,
                    SegmentId=segment_id,
                    StartTime=start_time,
                    Status=status,
                ),
            )
        )
    # BobS - Issue detection code will not be invoked since we are not processing
    # Transcript events now - only Utterance events - for latency reasons.
    issues_detected = segment.get(
        "ContactLensTranscript", {}).get("IssuesDetected", [])
    if (
        "ContactLensTranscript" in segment
        and segment["ContactLensTranscript"].get("ParticipantRole") == "CUSTOMER"
        and not issues_detected
    ):
        is_partial = False
        segment_item = segment["ContactLensTranscript"]
        content = segment_item["Content"]
        segment_id = str(uuid.uuid4())

        created_at = datetime.utcnow().astimezone().isoformat()
        start_time = segment_item["BeginOffsetMillis"] / 1000
        end_time = segment_item["EndOffsetMillis"] / 1000
        end_time = end_time + 0.001  # UI sort order

        send_lambda_agent_assist_args.append(
            dict(
                content=content,
                transcript_segment_args=dict(
                    CallId=call_id,
                    Channel=channel,
                    CreatedAt=created_at,
                    ExpiresAfter=get_transcription_ttl(),
                    EndTime=end_time,
                    IsPartial=is_partial,
                    SegmentId=segment_id,
                    StartTime=start_time,
                    Status=status,
                ),
            )
        )
    for issue in issues_detected:
        issue_segment = transform_segment_to_issues_agent_assist(
            segment={**segment, "CallId": call_id},
            issue=issue,
        )
        send_lambda_agent_assist_args.append(
            dict(content=issue_segment["Transcript"],
                 transcript_segment_args=issue_segment),
        )

    categories = segment.get("Categories", {})
    for category in categories.get("MatchedCategories", []):
        category_details = categories["MatchedDetails"][category]
        category_segment = transform_segment_to_categories_agent_assist(
            category=category,
            category_details=category_details,
            call_id=call_id,
        )
        send_lambda_agent_assist_args.append(
            dict(
                content=category_segment["Transcript"],
                transcript_segment_args=category_segment,
            ),
        )

    for agent_assist_args in send_lambda_agent_assist_args:
        transcript_segment = get_lambda_agent_assist_transcript(
            **agent_assist_args,
        )

        write_agent_assist_to_kds(transcript_segment)

    # Return the last transcript segment for synchronous callers
    return transcript_segment if transcript_segment else None


@LOGGER.inject_lambda_context
def handler(event, context: LambdaContext):
    # pylint: disable=unused-argument
    """Lambda handler"""
    LOGGER.info("Agent assist lambda event", extra={"event": event})

    data = json.loads(json.dumps(event))

    if IS_LEX_AGENT_ASSIST_ENABLED:
        LOGGER.info("Invoking Lex agent assist")
        publish_lex_agent_assist_transcript_segment(data)
    elif IS_LAMBDA_AGENT_ASSIST_ENABLED:
        LOGGER.info("Invoking Lambda agent assist")
        transcript_segment = publish_lambda_agent_assist_transcript_segment(data)
        # Return the response for synchronous callers (like chat interface)
        if transcript_segment and transcript_segment.get("Transcript"):
            return {"message": transcript_segment.get("Transcript")}
    else:
        LOGGER.warning("Agent assist is not enabled but orchestrator invoked")
    return {}
