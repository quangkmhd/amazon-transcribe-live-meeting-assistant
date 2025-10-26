# Copyright (c) 2025
# This file is licensed under the MIT License.

"""Supabase Utilities - AWS-free alternatives to DynamoDB operations"""

from .client import get_supabase_client, SupabaseClient
from .meeting_operations import (
    create_meeting,
    get_meeting,
    update_meeting_status,
    update_meeting_aggregation,
    list_meetings,
)
from .transcript_operations import (
    add_transcript_segment,
    get_transcript_segments,
    delete_transcript_segment,
)

__all__ = [
    "get_supabase_client",
    "SupabaseClient",
    "create_meeting",
    "get_meeting",
    "update_meeting_status",
    "update_meeting_aggregation",
    "list_meetings",
    "add_transcript_segment",
    "get_transcript_segments",
    "delete_transcript_segment",
]

