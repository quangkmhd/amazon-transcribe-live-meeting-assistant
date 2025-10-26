#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Supabase Meeting Operations
Alternative to DynamoDB VTL resolvers for meeting/call operations
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from .client import get_supabase_client

logger = logging.getLogger(__name__)


def create_meeting(
    call_id: str,
    owner: str,
    customer_phone: str = "",
    system_phone: str = "",
    agent_id: str = "",
    metadata: Optional[Dict] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Create a new meeting record in Supabase
    Alternative to DynamoDB createCall mutation
    
    Args:
        call_id: Unique meeting/call ID
        owner: Owner email
        customer_phone: Customer phone number
        system_phone: System phone number
        agent_id: Agent ID
        metadata: Additional metadata
        **kwargs: Additional fields
    
    Returns:
        Created meeting record
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        meeting_data = {
            'meeting_id': call_id,
            'owner_email': owner,
            'customer_phone': customer_phone,
            'system_phone': system_phone,
            'agent_id': agent_id,
            'status': 'STARTED',
            'created_at': datetime.utcnow().isoformat(),
            'metadata': metadata or {},
            **kwargs
        }
        
        response = supabase.table('meetings').insert(meeting_data).execute()  # type: ignore
        
        logger.info(f"Created meeting: {call_id}")
        return response.data[0] if response.data else meeting_data
        
    except Exception as e:
        logger.error(f"Error creating meeting: {e}")
        raise


def get_meeting(call_id: str, owner: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Get meeting by ID
    Alternative to DynamoDB getCall query
    
    Args:
        call_id: Meeting ID
        owner: Optional owner for permission check
    
    Returns:
        Meeting record or None
    """
    supabase = get_supabase_client()
    if not supabase:
        return None
    
    try:
        query = supabase.table('meetings').select('*').eq('meeting_id', call_id)  # type: ignore
        
        # Add owner filter if provided (RLS will also enforce this)
        if owner:
            query = query.eq('owner_email', owner)
        
        response = query.single().execute()
        
        return response.data if response.data else None
        
    except Exception as e:
        logger.warning(f"Meeting not found or error: {e}")
        return None


def update_meeting_status(
    call_id: str,
    status: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Update meeting status
    Alternative to DynamoDB updateCallStatus mutation
    
    Args:
        call_id: Meeting ID
        status: New status (STARTED, TRANSCRIBING, ENDED, ERRORED)
        **kwargs: Additional fields to update
    
    Returns:
        Updated meeting record
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        update_data = {
            'status': status,
            'updated_at': datetime.utcnow().isoformat(),
            **kwargs
        }
        
        response = supabase.table('meetings').update(update_data).eq('meeting_id', call_id).execute()  # type: ignore
        
        logger.info(f"Updated meeting {call_id} status to {status}")
        return response.data[0] if response.data else update_data
        
    except Exception as e:
        logger.error(f"Error updating meeting status: {e}")
        raise


def update_meeting_aggregation(
    call_id: str,
    sentiment: Optional[Dict] = None,
    duration_millis: Optional[float] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Update meeting aggregation data (sentiment, duration, etc.)
    Alternative to DynamoDB updateCallAggregation mutation
    
    Args:
        call_id: Meeting ID
        sentiment: Sentiment aggregation data
        duration_millis: Total conversation duration
        **kwargs: Additional fields
    
    Returns:
        Updated meeting record
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        update_data = {
            'updated_at': datetime.utcnow().isoformat(),
        }
        
        if sentiment:
            update_data['sentiment'] = sentiment
        
        if duration_millis is not None:
            update_data['total_duration_ms'] = duration_millis
        
        update_data.update(kwargs)
        
        response = supabase.table('meetings').update(update_data).eq('meeting_id', call_id).execute()  # type: ignore
        
        logger.info(f"Updated meeting {call_id} aggregation")
        return response.data[0] if response.data else update_data
        
    except Exception as e:
        logger.error(f"Error updating meeting aggregation: {e}")
        raise


def list_meetings(
    owner: str,
    limit: int = 100,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    List meetings for owner
    Alternative to DynamoDB listCalls query
    
    Args:
        owner: Owner email
        limit: Max results
        start_date: Optional start date filter
        end_date: Optional end date filter
    
    Returns:
        List of meeting records
    """
    supabase = get_supabase_client()
    if not supabase:
        return []
    
    try:
        query = supabase.table('meetings').select('*').eq('owner_email', owner).order('created_at', desc=True).limit(limit)  # type: ignore
        
        if start_date:
            query = query.gte('created_at', start_date)
        if end_date:
            query = query.lte('created_at', end_date)
        
        response = query.execute()
        
        return response.data if response.data else []
        
    except Exception as e:
        logger.error(f"Error listing meetings: {e}")
        return []


def add_call_summary(
    call_id: str,
    summary_text: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Add/update call summary text
    Alternative to DynamoDB addCallSummaryText mutation
    
    Args:
        call_id: Meeting ID
        summary_text: Summary text
        **kwargs: Additional fields
    
    Returns:
        Updated meeting record
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        update_data = {
            'summary': summary_text,
            'updated_at': datetime.utcnow().isoformat(),
            **kwargs
        }
        
        response = supabase.table('meetings').update(update_data).eq('meeting_id', call_id).execute()  # type: ignore
        
        logger.info(f"Added summary to meeting {call_id}")
        return response.data[0] if response.data else update_data
        
    except Exception as e:
        logger.error(f"Error adding summary: {e}")
        raise


def share_meeting(
    call_id: str,
    owner: str,
    recipients: List[str]
) -> Dict[str, Any]:
    """
    Share meeting with recipients
    
    Args:
        call_id: Meeting ID
        owner: Owner email
        recipients: List of recipient emails
    
    Returns:
        Updated meeting record
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        update_data = {
            'shared_with': recipients,
            'updated_at': datetime.utcnow().isoformat(),
        }
        
        response = supabase.table('meetings').update(update_data).eq('meeting_id', call_id).eq('owner_email', owner).execute()  # type: ignore
        
        logger.info(f"Shared meeting {call_id} with {len(recipients)} recipients")
        return response.data[0] if response.data else update_data
        
    except Exception as e:
        logger.error(f"Error sharing meeting: {e}")
        raise


def delete_meeting(call_id: str, owner: str) -> bool:
    """
    Delete meeting and all related data
    
    Args:
        call_id: Meeting ID
        owner: Owner email for permission check
    
    Returns:
        True if successful
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        # Cascade delete will handle:
        # - transcript_events
        # - speaker_identity
        # - virtual_participants
        # - pipeline_logs
        
        response = supabase.table('meetings').delete().eq('meeting_id', call_id).eq('owner_email', owner).execute()  # type: ignore
        
        logger.info(f"Deleted meeting {call_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting meeting: {e}")
        raise

