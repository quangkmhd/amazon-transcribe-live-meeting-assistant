/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logger } from 'aws-amplify';

import useCallsContext from '../../contexts/calls';
import useSettingsContext from '../../contexts/settings';

import mapCallsAttributes from '../common/map-call-attributes';
import { IN_PROGRESS_STATUS } from '../common/get-recording-status';

import '@awsui/global-styles/index.css';

import CallPanel from '../call-panel';

const logger = new Logger('CallDetails');

const CallDetails = () => {
  const { callId } = useParams();
  const {
    calls,
    callTranscriptPerCallId,
    getCallDetailsFromCallIds,
    sendGetTranscriptSegmentsRequest,
    setToolsOpen,
    setLiveTranscriptCallId,
  } = useCallsContext();
  const { settings } = useSettingsContext();

  const [call, setCall] = useState(null);

  const sendInitCallRequests = async () => {
    const response = await getCallDetailsFromCallIds([callId]);
    logger.debug('call detail response', response);
    const callsMap = mapCallsAttributes(response, settings);
    const callDetails = callsMap[0];
    if (callDetails) {
      setCall(callDetails);
      console.log('[DEBUG CallDetails] callTranscriptPerCallId:', callTranscriptPerCallId);
      console.log('[DEBUG CallDetails] callId:', callId);
      console.log('[DEBUG CallDetails] Cached data for this call:', callTranscriptPerCallId[callId]);
      console.log('[DEBUG CallDetails] Has cached data?', !!callTranscriptPerCallId[callId]);

      // Always fetch database segments to get historical data
      console.log('[DEBUG CallDetails] Fetching transcript segments from database...');
      await sendGetTranscriptSegmentsRequest(callId);

      // ✅ Subscribe to live transcripts if meeting is in progress (STARTED or TRANSCRIBING)
      // Check both Status field and recordingStatusLabel
      const isInProgress =
        callDetails?.recordingStatusLabel === IN_PROGRESS_STATUS ||
        callDetails?.Status === 'STARTED' ||
        callDetails?.Status === 'TRANSCRIBING';

      if (isInProgress) {
        console.log('[DEBUG CallDetails] Meeting is in progress, subscribing to live transcripts...');
        setLiveTranscriptCallId(callId);
      } else {
        console.log('[DEBUG CallDetails] Meeting is completed, no live subscription needed');
      }
    }
  };

  useEffect(() => {
    if (!callId) {
      return () => {};
    }
    sendInitCallRequests();
    return () => {
      logger.debug('set live transcript contact to null');
      setLiveTranscriptCallId(null);
    };
  }, [callId]);

  useEffect(async () => {
    if (!callId || !call || !calls?.length) {
      return;
    }
    const callsFiltered = calls.filter((c) => c.CallId === callId);
    if (callsFiltered && callsFiltered?.length) {
      const callsMap = mapCallsAttributes([callsFiltered[0]], settings);
      const callDetails = callsMap[0];
      if (callDetails?.updatedAt && call.updatedAt < callDetails.updatedAt) {
        logger.debug('Updating call', callDetails);
        setCall(callDetails);
      }
    }
  }, [calls, callId]);

  return (
    call && (
      <CallPanel
        item={call}
        setToolsOpen={setToolsOpen}
        callTranscriptPerCallId={callTranscriptPerCallId}
        getCallDetailsFromCallIds={getCallDetailsFromCallIds}
      />
    )
  );
};

export default CallDetails;
