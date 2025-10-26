#!/usr/bin/env python3.12
# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

from os import getenv
from typing import TYPE_CHECKING, Dict, List, Any
import json
import re

# third-party imports from Lambda layer
try:
    from aws_lambda_powertools import Logger  # type: ignore
    from aws_lambda_powertools.utilities.typing import LambdaContext  # type: ignore
except Exception:
    import logging
    class Logger:  # minimal shim
        def __init__(self, location: str = "", child: bool = False):
            self._l = logging.getLogger(__name__)
            if not self._l.handlers:
                handler = logging.StreamHandler()
                formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
                handler.setFormatter(formatter)
                self._l.addHandler(handler)
            self._l.setLevel(logging.INFO)
        def info(self, msg, extra=None):
            self._l.info(msg)
        def debug(self, msg, extra=None):
            self._l.debug(msg)
        def warning(self, msg, extra=None):
            self._l.warning(msg)
        def error(self, msg, extra=None):
            self._l.error(msg)
        def inject_lambda_context(self, func):
            return func
    class LambdaContext:  # type: ignore
        pass

try:
    import boto3  # type: ignore
    from botocore.config import Config as BotoCoreConfig  # type: ignore
    _BOTO3_AVAILABLE = True
except Exception:
    boto3 = None  # type: ignore
    BotoCoreConfig = None  # type: ignore
    _BOTO3_AVAILABLE = False
from eventprocessor_utils import (
    get_meeting_ttl
)

# Try to import Supabase utilities (AWS-free alternative to Kinesis)
try:
    from supabase_utils import realtime as supabase_realtime
    _SUPABASE_AVAILABLE = True
except ImportError:
    supabase_realtime = None
    _SUPABASE_AVAILABLE = False


# pylint: enable=import-error
LOGGER = Logger(location="%(filename)s:%(lineno)d - %(funcName)s()")

if TYPE_CHECKING:
    from mypy_boto3_lambda.client import LambdaClient
    from mypy_boto3_kinesis.client import KinesisClient
    from boto3 import Session as Boto3Session
else:
    Boto3Session = object
    LambdaClient = object
    KinesisClient = object

if _BOTO3_AVAILABLE:
    try:
        BOTO3_SESSION: Boto3Session = boto3.Session()  # type: ignore
        CLIENT_CONFIG = BotoCoreConfig(  # type: ignore
            read_timeout=int(getenv("BOTO_READ_TIMEOUT", '60')),
            retries={"mode": "adaptive", "max_attempts": 3},
        )
        LAMBDA_CLIENT: LambdaClient = BOTO3_SESSION.client(  # type: ignore
            "lambda",
            config=CLIENT_CONFIG,
        )
        KINESIS_CLIENT: KinesisClient = BOTO3_SESSION.client(  # type: ignore
            "kinesis"
        )
    except Exception as e:
        # boto3 available but AWS not configured (no credentials/region)
        import logging
        logging.getLogger(__name__).info(f"AWS services not available: {e}")
        BOTO3_SESSION = None  # type: ignore
        CLIENT_CONFIG = None  # type: ignore
        LAMBDA_CLIENT = None  # type: ignore
        KINESIS_CLIENT = None  # type: ignore
else:
    BOTO3_SESSION = None  # type: ignore
    CLIENT_CONFIG = None  # type: ignore
    LAMBDA_CLIENT = None  # type: ignore
    KINESIS_CLIENT = None  # type: ignore

TRANSCRIPT_SUMMARY_FUNCTION_ARN = getenv("TRANSCRIPT_SUMMARY_FUNCTION_ARN", "")
CALL_DATA_STREAM_NAME = getenv("CALL_DATA_STREAM_NAME", "")


def get_call_summary(
    message: Dict[str, Any]
):
    # Prefer direct local call to summary service when AWS is not available
    if LAMBDA_CLIENT and TRANSCRIPT_SUMMARY_FUNCTION_ARN:
        lambda_response = LAMBDA_CLIENT.invoke(
            FunctionName=TRANSCRIPT_SUMMARY_FUNCTION_ARN,
            InvocationType='RequestResponse',
            Payload=json.dumps(message)
        )
        try:
            message = json.loads(lambda_response.get(
                "Payload").read().decode("utf-8"))
        except Exception as error:
            LOGGER.error(
                "Transcript summary result payload parsing exception. Lambda must return JSON object with (modified) input event fields",
                extra=error,
            )
        return message
    else:
        try:
            # Local fallback: call Gemini-based summary directly
            import sys, os
            summary_path = os.path.join(os.path.dirname(__file__), '../bedrock_summary_lambda')
            if summary_path not in sys.path:
                sys.path.insert(0, summary_path)
            from index import handler as summary_handler
            return summary_handler(message, None)
        except Exception as error:
            LOGGER.error("Local summary call failed", extra=error)
            return {**message, "summary": ""}


def write_call_summary_to_kds(
    message: Dict[str, Any]
):
    """
    Write summary event to data stream
    Supports: Supabase Realtime (AWS-free) OR Kinesis (AWS)
    """
    callId = message.get("CallId", None)
    expiresAfter = message.get("ExpiresAfter", get_meeting_ttl())

    new_message = dict(
        CallId=callId,
        EventType="ADD_SUMMARY",
        ExpiresAfter=expiresAfter,
        CallSummaryText=message["CallSummaryText"]
    )

    if not callId:
        return
    
    event_written = False
    
    # Try Supabase Realtime first (AWS-free)
    if _SUPABASE_AVAILABLE and supabase_realtime:
        try:
            success = supabase_realtime.publish_summary_event(
                call_id=callId,
                summary_text=message["CallSummaryText"],
                ExpiresAfter=expiresAfter
            )
            if success:
                LOGGER.info("✅ ADD_SUMMARY event published to Supabase Realtime")
                event_written = True
        except Exception as error:
            LOGGER.warning(f"Supabase Realtime publish failed: {error}, trying Kinesis")
    
    # Fallback to Kinesis if Supabase failed or unavailable
    if not event_written and KINESIS_CLIENT and CALL_DATA_STREAM_NAME:
        try:
            KINESIS_CLIENT.put_record(  # type: ignore
                StreamName=CALL_DATA_STREAM_NAME,
                PartitionKey=callId,
                Data=json.dumps(new_message)
            )
            LOGGER.info("Write ADD_SUMMARY event to Kinesis")
            event_written = True
        except Exception as error:
            LOGGER.error(f"Error writing ADD_SUMMARY event to Kinesis: {error}")
    
    if not event_written:
        LOGGER.info("[LOCAL] ADD_SUMMARY event (no stream): %s", json.dumps(new_message))
    
    return


@LOGGER.inject_lambda_context
def handler(event, context: LambdaContext):
    # pylint: disable=unused-argument
    """Lambda handler"""
    LOGGER.debug("Transcript summary lambda event", extra={"event": event})

    data = json.loads(json.dumps(event))

    call_summary = get_call_summary(message=data)

    LOGGER.debug("Call summary: ")
    LOGGER.debug(call_summary)
    data['CallSummaryText'] = call_summary['summary']

    write_call_summary_to_kds(data)
