#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Supabase Realtime Utilities
Alternative to Kinesis for event streaming
"""

import logging
import json
from typing import Dict, Any, Optional, Callable
from datetime import datetime

from .client import get_supabase_client

logger = logging.getLogger(__name__)


def publish_event(
    event_type: str,
    call_id: str,
    data: Dict[str, Any],
    channel: str = "call_events"
) -> bool:
    """
    Publish event to Supabase Realtime channel
    Alternative to Kinesis put_record
    
    Args:
        event_type: Event type (ADD_TRANSCRIPT_SEGMENT, ADD_SUMMARY, etc.)
        call_id: Call/Meeting ID
        data: Event data
        channel: Realtime channel name
    
    Returns:
        True if successful
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.warning(f"Supabase not available, event not published: {event_type}")
        return False
    
    try:
        # Store event in events table for persistence + trigger Realtime
        event_data = {
            'event_type': event_type,
            'call_id': call_id,
            'event_data': data,
            'created_at': datetime.utcnow().isoformat(),
        }
        
        response = supabase.table('call_events').insert(event_data).execute()  # type: ignore
        
        logger.debug(f"Published event: {event_type} for call {call_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error publishing event: {e}")
        return False


def publish_transcript_segment(
    call_id: str,
    segment: Dict[str, Any]
) -> bool:
    """
    Publish transcript segment event
    Alternative to Kinesis ADD_TRANSCRIPT_SEGMENT event
    
    Args:
        call_id: Meeting ID
        segment: Transcript segment data
    
    Returns:
        True if successful
    """
    return publish_event(
        event_type="ADD_TRANSCRIPT_SEGMENT",
        call_id=call_id,
        data=segment
    )


def publish_agent_assist_event(
    call_id: str,
    transcript: str,
    segment_id: str,
    **kwargs
) -> bool:
    """
    Publish agent assist event
    Alternative to Kinesis ADD_AGENT_ASSIST event
    
    Args:
        call_id: Meeting ID
        transcript: Agent assist response
        segment_id: Segment ID
        **kwargs: Additional fields
    
    Returns:
        True if successful
    """
    data = {
        'Transcript': transcript,
        'SegmentId': segment_id,
        **kwargs
    }
    
    return publish_event(
        event_type="ADD_AGENT_ASSIST",
        call_id=call_id,
        data=data
    )


def publish_summary_event(
    call_id: str,
    summary_text: str,
    **kwargs
) -> bool:
    """
    Publish summary event
    Alternative to Kinesis ADD_SUMMARY event
    
    Args:
        call_id: Meeting ID
        summary_text: Summary text
        **kwargs: Additional fields
    
    Returns:
        True if successful
    """
    data = {
        'CallSummaryText': summary_text,
        **kwargs
    }
    
    return publish_event(
        event_type="ADD_SUMMARY",
        call_id=call_id,
        data=data
    )


def subscribe_to_call_events(
    call_id: str,
    callback: Callable[[Dict[str, Any]], None]
):
    """
    Subscribe to call events in real-time
    Alternative to Kinesis consumer
    
    Args:
        call_id: Meeting ID to subscribe to
        callback: Function to call on each event
    
    Returns:
        Subscription object with unsubscribe method
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.warning("Supabase not available, cannot subscribe to events")
        return None
    
    try:
        def handle_event(payload):
            """Handle incoming event"""
            event_data = payload.get('new', {})
            if event_data.get('call_id') == call_id:
                callback(event_data)
        
        # Subscribe to postgres changes on call_events table
        subscription = supabase.channel(f'call_events_{call_id}').on(  # type: ignore
            'postgres_changes',
            {
                'event': 'INSERT',
                'schema': 'public',
                'table': 'call_events',
                'filter': f'call_id=eq.{call_id}'
            },
            handle_event
        ).subscribe()
        
        logger.info(f"Subscribed to call events for {call_id}")
        return subscription
        
    except Exception as e:
        logger.error(f"Error subscribing to call events: {e}")
        return None

