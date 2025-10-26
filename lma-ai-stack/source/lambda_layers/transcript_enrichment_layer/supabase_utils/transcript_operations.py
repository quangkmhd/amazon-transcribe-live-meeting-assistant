#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Supabase Transcript Operations
Alternative to DynamoDB transcript segment operations
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from .client import get_supabase_client

logger = logging.getLogger(__name__)


def add_transcript_segment(
    call_id: str,
    channel: str,
    transcript: str,
    start_time: float,
    end_time: float,
    is_partial: bool,
    speaker: str = "",
    segment_id: Optional[str] = None,
    sentiment: Optional[str] = None,
    sentiment_score: Optional[Dict] = None,
    sentiment_weighted: Optional[float] = None,
    owner: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Add transcript segment to Supabase
    Alternative to DynamoDB addTranscriptSegment mutation
    
    Args:
        call_id: Meeting ID
        channel: CALLER, AGENT, AGENT_ASSISTANT, etc.
        transcript: Transcript text
        start_time: Start time in seconds
        end_time: End time in seconds
        is_partial: Whether this is partial transcript
        speaker: Speaker name/number
        segment_id: Optional segment ID (generated if not provided)
        sentiment: Sentiment label
        sentiment_score: Sentiment scores
        sentiment_weighted: Weighted sentiment score
        owner: Owner email
        **kwargs: Additional fields
    
    Returns:
        Created transcript segment
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        segment_id = segment_id or str(uuid.uuid4())
        
        segment_data = {
            'meeting_id': call_id,
            'segment_id': segment_id,
            'channel': channel,
            'transcript': transcript,
            'start_time': start_time,
            'end_time': end_time,
            'is_final': not is_partial,  # Supabase uses is_final instead of is_partial
            'speaker_name': speaker if speaker else None,
            'created_at': datetime.utcnow().isoformat(),
        }
        
        # Add sentiment if provided
        if sentiment:
            segment_data['sentiment'] = sentiment
        if sentiment_score:
            segment_data['sentiment_scores'] = sentiment_score
        if sentiment_weighted is not None:
            segment_data['sentiment_weighted'] = sentiment_weighted
        
        # Add owner if provided
        if owner:
            segment_data['owner_email'] = owner
        
        # Add any additional fields
        segment_data.update(kwargs)
        
        # Upsert to handle duplicate segment IDs (for partial → final updates)
        response = supabase.table('transcript_events').upsert(  # type: ignore
            segment_data,
            on_conflict='meeting_id,segment_id'
        ).execute()
        
        logger.debug(f"Added transcript segment: {segment_id}")
        return response.data[0] if response.data else segment_data
        
    except Exception as e:
        logger.error(f"Error adding transcript segment: {e}")
        raise


def get_transcript_segments(
    call_id: str,
    is_final: Optional[bool] = None,
    limit: int = 1000
) -> List[Dict[str, Any]]:
    """
    Get transcript segments for a meeting
    Alternative to DynamoDB getTranscriptSegments query
    
    Args:
        call_id: Meeting ID
        is_final: Filter by is_final (None = all)
        limit: Max results
    
    Returns:
        List of transcript segments
    """
    supabase = get_supabase_client()
    if not supabase:
        return []
    
    try:
        query = supabase.table('transcript_events').select('*').eq('meeting_id', call_id).order('end_time', desc=False).limit(limit)  # type: ignore
        
        if is_final is not None:
            query = query.eq('is_final', is_final)
        
        response = query.execute()
        
        # Transform to match DynamoDB format
        segments = []
        for item in (response.data or []):
            segment = {
                'CallId': item.get('meeting_id'),
                'SegmentId': item.get('segment_id'),
                'Channel': item.get('channel', 'CALLER'),
                'Transcript': item.get('transcript', ''),
                'StartTime': item.get('start_time', 0),
                'EndTime': item.get('end_time', 0),
                'IsPartial': not item.get('is_final', True),
                'Speaker': item.get('speaker_name', item.get('speaker_number', '')),
                'CreatedAt': item.get('created_at'),
                'Sentiment': item.get('sentiment'),
                'SentimentScore': item.get('sentiment_scores'),
                'SentimentWeighted': item.get('sentiment_weighted'),
            }
            segments.append(segment)
        
        return segments
        
    except Exception as e:
        logger.error(f"Error getting transcript segments: {e}")
        return []


def delete_transcript_segment(segment_id: str, meeting_id: str) -> bool:
    """
    Delete transcript segment
    Alternative to DynamoDB deleteTranscriptSegment mutation
    
    Args:
        segment_id: Segment ID
        meeting_id: Meeting ID
    
    Returns:
        True if successful
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        response = supabase.table('transcript_events').delete().eq('meeting_id', meeting_id).eq('segment_id', segment_id).execute()  # type: ignore
        
        logger.info(f"Deleted transcript segment: {segment_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting transcript segment: {e}")
        raise


def get_transcript_segments_with_sentiment(
    call_id: str,
    limit: int = 1000
) -> List[Dict[str, Any]]:
    """
    Get transcript segments with sentiment data
    Alternative to DynamoDB getTranscriptSegmentsWithSentiment query
    
    Args:
        call_id: Meeting ID
        limit: Max results
    
    Returns:
        List of segments with sentiment
    """
    supabase = get_supabase_client()
    if not supabase:
        return []
    
    try:
        response = supabase.table('transcript_events').select('*').eq('meeting_id', call_id).eq('is_final', True).not_.is_('sentiment', 'null').order('end_time', desc=False).limit(limit).execute()  # type: ignore
        
        # Transform to match DynamoDB format
        segments = []
        for item in (response.data or []):
            segment = {
                'CallId': item.get('meeting_id'),
                'SegmentId': item.get('segment_id'),
                'Channel': item.get('channel', 'CALLER'),
                'StartTime': item.get('start_time', 0),
                'EndTime': item.get('end_time', 0),
                'Sentiment': item.get('sentiment'),
                'SentimentWeighted': item.get('sentiment_weighted'),
            }
            segments.append(segment)
        
        return segments
        
    except Exception as e:
        logger.error(f"Error getting segments with sentiment: {e}")
        return []


def update_transcript_segment_sentiment(
    segment_id: str,
    meeting_id: str,
    sentiment: str,
    sentiment_score: Dict[str, float],
    sentiment_weighted: float
) -> Dict[str, Any]:
    """
    Update transcript segment with sentiment data
    
    Args:
        segment_id: Segment ID
        meeting_id: Meeting ID
        sentiment: Sentiment label
        sentiment_score: Sentiment scores dict
        sentiment_weighted: Weighted sentiment score
    
    Returns:
        Updated segment
    """
    supabase = get_supabase_client()
    if not supabase:
        raise RuntimeError("Supabase not available")
    
    try:
        update_data = {
            'sentiment': sentiment,
            'sentiment_scores': sentiment_score,
            'sentiment_weighted': sentiment_weighted,
            'updated_at': datetime.utcnow().isoformat(),
        }
        
        response = supabase.table('transcript_events').update(update_data).eq('meeting_id', meeting_id).eq('segment_id', segment_id).execute()  # type: ignore
        
        logger.debug(f"Updated sentiment for segment: {segment_id}")
        return response.data[0] if response.data else update_data
        
    except Exception as e:
        logger.error(f"Error updating segment sentiment: {e}")
        raise

