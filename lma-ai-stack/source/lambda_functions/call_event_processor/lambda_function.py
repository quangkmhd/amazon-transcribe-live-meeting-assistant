#!/usr/bin/env python3.12
# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

""" Transcription Passthrough Lambda Function
"""
import asyncio
from os import environ, getenv
from typing import TYPE_CHECKING, Dict, List
import json
import re

# third-party imports from Lambda layer - conditional for non-AWS environments
try:
    from aws_lambda_powertools import Logger  # type: ignore
    from aws_lambda_powertools.utilities.typing import LambdaContext  # type: ignore
except ImportError:
    import logging
    class Logger:
        def __init__(self, location: str = ""):
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
        def error(self, msg, *args, **kwargs):
            self._l.error(msg)
        def exception(self, msg, *args, **kwargs):
            self._l.exception(msg)
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

# imports from Lambda layer
# pylint: disable=import-error
from appsync_utils import AppsyncAioGqlClient
from transcript_batch_processor import TranscriptBatchProcessor

# local imports
from event_processor import execute_process_event_api_mutation

# pylint: enable=import-error

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.service_resource import DynamoDBServiceResource, Table as DynamoDbTable
    from mypy_boto3_lexv2_runtime.client import LexRuntimeV2Client
    from mypy_boto3_lambda.client import LambdaClient
    from mypy_boto3_comprehend.client import ComprehendClient
    from mypy_boto3_sns.client import SNSClient
    from mypy_boto3_ssm.client import SSMClient
    from boto3 import Session as Boto3Session
else:
    Boto3Session = object
    DynamoDBServiceResource = object
    DynamoDbTable = object
    LexRuntimeV2Client = object
    LambdaClient = object
    ComprehendClient = object
    SNSClient = object
    SSMClient = object

APPSYNC_GRAPHQL_URL = environ.get("APPSYNC_GRAPHQL_URL", "")
if APPSYNC_GRAPHQL_URL:
    APPSYNC_CLIENT = AppsyncAioGqlClient(
        url=APPSYNC_GRAPHQL_URL, fetch_schema_from_transport=True)
else:
    APPSYNC_CLIENT = None  # type: ignore

if _BOTO3_AVAILABLE:
    try:
        BOTO3_SESSION: Boto3Session = boto3.Session()  # type: ignore
        CLIENT_CONFIG = BotoCoreConfig(  # type: ignore
            retries={"mode": "adaptive", "max_attempts": 3},
        )

        STATE_DYNAMODB_TABLE_NAME = environ.get("STATE_DYNAMODB_TABLE_NAME", "")
        if STATE_DYNAMODB_TABLE_NAME:
            STATE_DYNAMODB_RESOURCE: DynamoDBServiceResource = BOTO3_SESSION.resource(  # type: ignore
                "dynamodb",
                config=CLIENT_CONFIG,
            )
            STATE_DYNAMODB_TABLE: DynamoDbTable = STATE_DYNAMODB_RESOURCE.Table(  # type: ignore
                STATE_DYNAMODB_TABLE_NAME)
        else:
            STATE_DYNAMODB_RESOURCE = None  # type: ignore
            STATE_DYNAMODB_TABLE = None  # type: ignore
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"AWS services not available: {e}")
        BOTO3_SESSION = None  # type: ignore
        CLIENT_CONFIG = None  # type: ignore
        STATE_DYNAMODB_RESOURCE = None  # type: ignore
        STATE_DYNAMODB_TABLE = None  # type: ignore
else:
    BOTO3_SESSION = None  # type: ignore
    CLIENT_CONFIG = None  # type: ignore
    STATE_DYNAMODB_RESOURCE = None  # type: ignore
    STATE_DYNAMODB_TABLE = None  # type: ignore

IS_LEX_AGENT_ASSIST_ENABLED = getenv(
    "IS_LEX_AGENT_ASSIST_ENABLED", "true").lower() == "true"

IS_LAMBDA_AGENT_ASSIST_ENABLED = getenv(
    "IS_LAMBDA_AGENT_ASSIST_ENABLED", "true").lower() == "true"

IS_SENTIMENT_ANALYSIS_ENABLED = getenv(
    "IS_SENTIMENT_ANALYSIS_ENABLED", "true").lower() == "true"

if _BOTO3_AVAILABLE and BOTO3_SESSION:
    try:
        if IS_SENTIMENT_ANALYSIS_ENABLED:
            COMPREHEND_CLIENT: ComprehendClient = BOTO3_SESSION.client(  # type: ignore
                "comprehend", config=CLIENT_CONFIG)
        else:
            COMPREHEND_CLIENT = None  # type: ignore
        
        SNS_CLIENT: SNSClient = BOTO3_SESSION.client("sns", config=CLIENT_CONFIG)  # type: ignore
        SSM_CLIENT: SSMClient = BOTO3_SESSION.client("ssm", config=CLIENT_CONFIG)  # type: ignore
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"AWS clients creation failed: {e}")
        COMPREHEND_CLIENT = None  # type: ignore
        SNS_CLIENT = None  # type: ignore
        SSM_CLIENT = None  # type: ignore
else:
    COMPREHEND_CLIENT = None  # type: ignore
    SNS_CLIENT = None  # type: ignore
    SSM_CLIENT = None  # type: ignore

COMPREHEND_LANGUAGE_CODE = getenv("COMPREHEND_LANGUAGE_CODE", "en")

LOGGER = Logger(location="%(filename)s:%(lineno)d - %(funcName)s()")

EVENT_LOOP = asyncio.get_event_loop()

# Load settings from SSM (if available) or use defaults
if SSM_CLIENT:
    try:
        setting_response = SSM_CLIENT.get_parameter(  # type: ignore
            Name=getenv("PARAMETER_STORE_NAME", ""))
        SETTINGS = json.loads(setting_response["Parameter"]["Value"])
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"SSM parameter load failed: {e}, using defaults")
        SETTINGS = {
            "CategoryAlertRegex": ".*",  # Match all categories
            "AssistantWakePhraseRegEx": "(?i)(hey|ok)\\s+(assistant|alexa)"  # Default wake phrase
        }
else:
    # Default settings for non-AWS environments
    SETTINGS = {
        "CategoryAlertRegex": ".*",
        "AssistantWakePhraseRegEx": "(?i)(hey|ok)\\s+(assistant|alexa)"
    }

if "CategoryAlertRegex" in SETTINGS:
    SETTINGS['AlertRegEx'] = re.compile(SETTINGS["CategoryAlertRegex"])
if "AssistantWakePhraseRegEx" in SETTINGS:
    SETTINGS['AssistantWakePhraseRegEx'] = re.compile(
        SETTINGS["AssistantWakePhraseRegEx"])


async def process_event(event) -> Dict[str, List]:
    """Processes a Batch of Transcript Records"""
    async with TranscriptBatchProcessor(
        appsync_client=APPSYNC_CLIENT,
        agent_assist_args=dict(
            is_lex_agent_assist_enabled=IS_LEX_AGENT_ASSIST_ENABLED,
            is_lambda_agent_assist_enabled=IS_LAMBDA_AGENT_ASSIST_ENABLED,
        ),
        sentiment_analysis_args=dict(
            comprehend_client=COMPREHEND_CLIENT,
            comprehend_language_code=COMPREHEND_LANGUAGE_CODE
        ),
        # called for each record right before the context manager exits
        api_mutation_fn=execute_process_event_api_mutation,
        sns_client=SNS_CLIENT,
        settings=SETTINGS
    ) as processor:
        await processor.handle_event(event=event)

    return processor.results


@LOGGER.inject_lambda_context
def handler(event, context: LambdaContext):
    # pylint: disable=unused-argument
    """Lambda handler"""
    LOGGER.debug("lambda event", extra={"event": event})

    event_processor_results = EVENT_LOOP.run_until_complete(
        process_event(event=event))
    LOGGER.debug("event processor results", extra=dict(
        event_results=event_processor_results))

    for error in event_processor_results.get("errors", []):
        LOGGER.error("event processor error: %s", error)
        if isinstance(error, Exception):
            try:
                raise error
            except Exception:  # pylint: disable=broad-except
                LOGGER.exception("event processor exception")

    return
