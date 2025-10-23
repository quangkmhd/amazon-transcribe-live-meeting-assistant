/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { useEffect, useState } from 'react';

import supabase from '../utils/supabase-client';
import useAppContext from '../contexts/app';

import { CALL_LIST_SHARDS_PER_DAY } from '../components/call-list/calls-table-config';

const logger = {
  debug: (...args) => console.log('[useCallsSupabaseApi]', ...args),
  error: (...args) => console.error('[useCallsSupabaseApi]', ...args),
};

const useCallsSupabaseApi = ({ initialPeriodsToLoad = CALL_LIST_SHARDS_PER_DAY * 2 } = {}) => {
  const [periodsToLoad, setPeriodsToLoad] = useState(initialPeriodsToLoad);
  const [isCallsListLoading, setIsCallsListLoading] = useState(false);
  const [calls, setCalls] = useState([]);
  const [liveTranscriptCallId, setLiveTranscriptCallId] = useState();
  const [callTranscriptPerCallId, setCallTranscriptPerCallId] = useState({});
  const { setErrorMessage } = useAppContext();

  const setCallsDeduped = (callValues) => {
    setCalls((currentCalls) => {
      const callValuesCallIds = callValues.map((c) => c.CallId);
      return [
        ...currentCalls.filter((c) => !callValuesCallIds.includes(c.CallId)),
        ...callValues.map((call) => ({
          ...call,
          ListPK: call.ListPK || currentCalls.find((c) => c.CallId === call.CallId)?.ListPK,
          ListSK: call.ListSK || currentCalls.find((c) => c.CallId === call.CallId)?.ListSK,
        })),
      ];
    });
  };

  // Map Supabase meeting to AppSync Call format
  const mapMeetingToCall = (meeting) => ({
    CallId: meeting.meeting_id,
    AgentId: meeting.agent_id,
    Owner: meeting.owner_email,
    SharedWith: meeting.shared_with || [],
    CallCategories: meeting.categories?.categories || [],
    IssuesDetected: meeting.issues_detected,
    CallSummaryText: meeting.summary_text,
    CreatedAt: meeting.created_at,
    UpdatedAt: meeting.updated_at,
    Status: meeting.status?.toUpperCase() || 'ENDED',
    RecordingUrl: meeting.recording_url,
    TotalConversationDurationMillis: meeting.duration_ms,
    Sentiment: meeting.sentiment_stats,
    CustomerPhoneNumber: '',
    SystemPhoneNumber: '',
    PcaUrl: '',
    ListPK: `m#${meeting.meeting_id}`,
    ListSK: meeting.started_at || meeting.created_at,
  });

  const getCallDetailsFromCallIds = async (callIds) => {
    try {
      const { data, error } = await supabase.from('meetings').select('*').in('meeting_id', callIds);

      if (error) {
        logger.error('Error fetching meetings:', error);
        setErrorMessage('failed to get call details - please try again later');
        return [];
      }

      return data.map(mapMeetingToCall);
    } catch (error) {
      logger.error('Error in getCallDetailsFromCallIds:', error);
      return [];
    }
  };

  // Subscribe to new meetings (onCreateCall replacement)
  useEffect(() => {
    logger.debug('Setting up meetings INSERT subscription');
    const channel = supabase
      .channel('meetings-inserts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meetings',
        },
        async (payload) => {
          logger.debug('New meeting created:', payload.new);
          const callValue = mapMeetingToCall(payload.new);
          setCallsDeduped([callValue]);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('Subscribed to meetings INSERT');
        }
        if (status === 'CHANNEL_ERROR') {
          logger.error('Meeting subscription error');
          setErrorMessage('call list network subscription failed - please reload the page');
        }
      });

    return () => {
      logger.debug('Unsubscribing from meetings INSERT');
      channel.unsubscribe();
    };
  }, []);

  // Subscribe to meeting updates (onUpdateCall replacement)
  useEffect(() => {
    logger.debug('Setting up meetings UPDATE subscription');
    const channel = supabase
      .channel('meetings-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meetings',
        },
        (payload) => {
          logger.debug('Meeting updated:', payload.new);
          const callValue = mapMeetingToCall(payload.new);
          setCallsDeduped([callValue]);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Subscribe to meeting deletes (onDeleteCall replacement)
  useEffect(() => {
    logger.debug('Setting up meetings DELETE subscription');
    const channel = supabase
      .channel('meetings-deletes')
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'meetings',
        },
        (payload) => {
          logger.debug('Meeting deleted:', payload.old);
          const meetingId = payload.old.meeting_id;
          if (meetingId) {
            setCalls((currentCalls) => currentCalls.filter((c) => c.CallId !== meetingId));
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const handleCallTranscriptSegmentMessage = (transcriptSegment) => {
    const { callId, transcript, isPartial, channel } = transcriptSegment;

    setCallTranscriptPerCallId((current) => {
      logger.debug('setCallTrancriptPerCallId current: ', current);

      const currentContactEntry = current[callId] || {};
      const currentChannelEntry = currentContactEntry[channel] || {};

      const currentBase = currentChannelEntry?.base || '';
      const currentSegments = currentChannelEntry?.segments || [];
      logger.debug('setCallTrancriptPerCallId current segments: ', currentSegments);
      const lastSameSegmentId = currentSegments.filter((s) => s.segmentId === transcriptSegment.segmentId).pop();
      const dedupedSegments = currentSegments.filter((s) => s.segmentId !== transcriptSegment.segmentId);

      const segments = [
        ...dedupedSegments,
        // prettier-ignore
        // avoid overwriting a final segment or one with sentiment with a late arriving segment
        (lastSameSegmentId?.isPartial === false && transcriptSegment?.isPartial === true)
        || (lastSameSegmentId?.isPartial === false && lastSameSegmentId?.sentiment)
          ? lastSameSegmentId
          : transcriptSegment,
      ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const entry = {
        ...currentContactEntry,
        [channel]: {
          base: !isPartial ? `${currentBase} ${transcript}`.trim() : currentBase,
          lastPartial: isPartial ? transcript : '',
          segments,
        },
      };
      logger.debug('setCallTrancriptPerCallId new contact id entry: ', entry);

      return {
        ...current,
        [callId]: { ...entry },
      };
    });
  };

  const mapTranscriptSegmentValue = (transcriptSegmentValue) => {
    const {
      meeting_id: callId,
      segment_id: segmentId,
      start_time: startTime,
      end_time: endTime,
      speaker_number: speakerNumber,
      speaker_name: speaker,
      transcript,
      is_partial: isPartial,
      channel,
      created_at: createdAt,
      sentiment,
      sentiment_score: sentimentScore,
      sentiment_weighted: sentimentWeighted,
    } = transcriptSegmentValue;

    return {
      callId,
      segmentId,
      startTime,
      endTime,
      speaker_number: speakerNumber,
      speaker: speaker || channel,
      transcript,
      isPartial,
      channel: channel || 'AGENT',
      createdAt,
      sentiment,
      sentimentScore,
      sentimentWeighted,
    };
  };

  // Subscribe to transcript segments for live meeting (onAddTranscriptSegment replacement)
  useEffect(() => {
    if (!liveTranscriptCallId) {
      return () => {};
    }

    logger.debug('Setting up transcript segments subscription for:', liveTranscriptCallId);

    const channel = supabase
      .channel(`transcripts-${liveTranscriptCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
          filter: `meeting_id=eq.${liveTranscriptCallId}`,
        },
        (payload) => {
          logger.debug('New transcript segment:', payload.new);
          const transcriptSegment = mapTranscriptSegmentValue(payload.new);
          const { callId, transcript, segmentId } = transcriptSegment;
          if (callId !== liveTranscriptCallId) {
            return;
          }
          if (transcript && segmentId) {
            handleCallTranscriptSegmentMessage(transcriptSegment);
          }
        },
      )
      .subscribe();

    return () => {
      logger.debug('Unsubscribed from transcript segments');
      channel.unsubscribe();
    };
  }, [liveTranscriptCallId]);

  // List calls by date range
  const sendSetCallsForPeriod = async () => {
    try {
      const now = new Date();
      const hoursInShard = 24 / CALL_LIST_SHARDS_PER_DAY;
      const hoursBack = periodsToLoad * hoursInShard;
      const startDate = new Date(now - hoursBack * 3600 * 1000);

      logger.debug('Fetching meetings from:', startDate.toISOString());

      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: false });

      if (error) {
        logger.error('Error fetching meetings:', error);
        setErrorMessage('failed to list calls - please try again later');
        setIsCallsListLoading(false);
        return;
      }

      const callValues = data.map(mapMeetingToCall);
      logger.debug('Fetched meetings:', callValues.length);
      setCallsDeduped(callValues);
      setIsCallsListLoading(false);
    } catch (error) {
      logger.error('Error in sendSetCallsForPeriod:', error);
      setErrorMessage('failed to list calls - please try again later');
      setIsCallsListLoading(false);
    }
  };

  useEffect(() => {
    if (isCallsListLoading) {
      logger.debug('call list is loading');
      setTimeout(() => {
        setCalls([]);
        sendSetCallsForPeriod();
      }, 1);
    }
  }, [isCallsListLoading]);

  useEffect(() => {
    logger.debug('list period changed', periodsToLoad);
    setIsCallsListLoading(true);
  }, [periodsToLoad]);

  const sendGetTranscriptSegmentsRequest = async (callId) => {
    try {
      const { data: transcriptSegments, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', callId)
        .order('start_time', { ascending: true });

      if (error) {
        logger.error('Error fetching transcript segments:', error);
        setErrorMessage('failed to get transcript - please try again later');
        return;
      }

      logger.debug('transcript segments response', transcriptSegments);
      if (transcriptSegments?.length > 0) {
        const mappedSegments = transcriptSegments.map((t) => mapTranscriptSegmentValue(t));

        const transcriptSegmentsReduced = mappedSegments.reduce((p, c) => {
          const previousSegments = p[c.channel]?.segments || [];
          const lastSameSegmentId = previousSegments.filter((s) => s?.segmentId === c?.segmentId).pop();
          const dedupedSegments = previousSegments.filter((s) => s.segmentId !== c.segmentId);

          // prettier-ignore
          const segment = !lastSameSegmentId?.sentiment && c?.sentiment
            ? c
            : lastSameSegmentId || c;

          return { ...p, [c.channel]: { segments: [...dedupedSegments, segment] } };
        }, {});

        setCallTranscriptPerCallId((current) => {
          logger.debug('updating callTranscriptPerCallId', current, transcriptSegmentsReduced);
          return {
            ...current,
            [callId]: transcriptSegmentsReduced,
          };
        });
      }
    } catch (error) {
      setErrorMessage('failed to get transcript - please try again later');
      logger.error('failed to set transcript segments', error);
    }
  };

  return {
    calls,
    callTranscriptPerCallId,
    isCallsListLoading,
    getCallDetailsFromCallIds,
    sendGetTranscriptSegmentsRequest,
    setIsCallsListLoading,
    setLiveTranscriptCallId,
    setPeriodsToLoad,
    periodsToLoad,
  };
};

export default useCallsSupabaseApi;
