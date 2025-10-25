/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  ButtonDropdown,
  ColumnLayout,
  Container,
  Grid,
  Header,
  Icon,
  Link,
  Popover,
  SpaceBetween,
  StatusIndicator,
  Tabs,
  TextContent,
  Toggle,
} from '@awsui/components-react';
import rehypeRaw from 'rehype-raw';
import ReactMarkdown from 'react-markdown';
import useWebSocket from 'react-use-websocket';
import { API, Logger, graphqlOperation } from 'aws-amplify';
import { GeminiTranslateClient, TranslateTextCommand } from '../../utils/gemini-translate';
import { getEmailFormattedSummary, getMarkdownSummary, getTextFileFormattedMeetingDetails } from '../common/summary';
import { COMPREHEND_PII_TYPES, DEFAULT_OTHER_SPEAKER_NAME, LANGUAGE_CODES } from '../common/constants';

import RecordingPlayer from '../recording-player';
import useSettingsContext from '../../contexts/settings';

import { DONE_STATUS, IN_PROGRESS_STATUS } from '../common/get-recording-status';
import { InfoLink } from '../common/info-link';
import { getWeightedSentimentLabel } from '../common/sentiment';

import { VoiceToneFluctuationChart, SentimentFluctuationChart, SentimentPerQuarterChart } from './sentiment-charts';

import './CallPanel.css';
import { SentimentTrendIcon } from '../sentiment-trend-icon/SentimentTrendIcon';
import { SentimentIcon } from '../sentiment-icon/SentimentIcon';
import useAppContext from '../../contexts/app';
import {
  downloadTranscriptAsExcel,
  downloadTranscriptAsText,
  exportToTextFile,
  downloadTranscriptAsDocx,
  exportToDocxFile,
} from '../common/download-func';
import useCallsContext from '../../contexts/calls';
import { shareModal, deleteModal } from '../common/meeting-controls';
import { getSpeakerIdentities, setSpeakerName } from '../../utils/supabase-client';
import SpeakerIdentificationModal from './SpeakerIdentificationModal';

const logger = new Logger('CallPanel');

// comprehend PII types
const piiTypesSplitRegEx = new RegExp(`\\[(${COMPREHEND_PII_TYPES.join('|')})\\]`);

const MAXIMUM_ATTEMPTS = 100;

/* eslint-disable react/prop-types, react/destructuring-assignment */
const CallAttributes = ({ item, setToolsOpen, getCallDetailsFromCallIds }) => {
  const { calls } = useCallsContext();
  const props = {
    calls,
    selectedItems: [item],
    loading: false,
    getCallDetailsFromCallIds,
  };

  return (
    <Container
      header={
        <Header
          variant="h4"
          info={<InfoLink onFollow={() => setToolsOpen(true)} />}
          actions={
            <SpaceBetween size="xxxs" direction="horizontal">
              {shareModal(props)} {deleteModal(props)}
            </SpaceBetween>
          }
        >
          Meeting Attributes
        </Header>
      }
    >
      <ColumnLayout columns={6} variant="text-grid">
        <SpaceBetween key="meeting-id" size="xs">
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              <strong>Meeting ID</strong>
            </Box>
            <div>{item.callId}</div>
          </div>
        </SpaceBetween>

        <SpaceBetween key="initiation-timestamp" size="xs">
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              <strong>Initiation Timestamp</strong>
            </Box>
            <div>{item.initiationTimeStamp}</div>
          </div>
        </SpaceBetween>

        <SpaceBetween key="last-update-timestamp" size="xs">
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              <strong>Last Update Timestamp</strong>
            </Box>
            <div>{item.updatedAt}</div>
          </div>
        </SpaceBetween>

        <SpaceBetween key="duration" size="xs">
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              <strong>Duration</strong>
            </Box>
            <div>{item.conversationDurationTimeStamp}</div>
          </div>
        </SpaceBetween>

        <SpaceBetween key="status" size="xs">
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              <strong>Status</strong>
            </Box>
            <StatusIndicator type={item.recordingStatusIcon}>{` ${item.recordingStatusLabel} `}</StatusIndicator>
          </div>
        </SpaceBetween>
        {item?.pcaUrl?.length && (
          <SpaceBetween key="pca-url" size="xs">
            <div>
              <Box margin={{ bottom: 'xxxs' }} color="text-label">
                <strong>Post Meeting Analytics</strong>
              </Box>
              <Button variant="normal" href={item.pcaUrl} target="_blank" iconAlign="right" iconName="external">
                Open in Post Call Analytics
              </Button>
            </div>
          </SpaceBetween>
        )}
        {item?.recordingUrl?.length && item?.recordingStatusLabel !== IN_PROGRESS_STATUS && (
          <SpaceBetween key="recording-url" size="xs">
            <div>
              <Box margin={{ bottom: 'xxxs' }} color="text-label">
                <strong>Recording Audio</strong>
              </Box>
              <RecordingPlayer recordingUrl={item.recordingUrl} />
            </div>
          </SpaceBetween>
        )}
      </ColumnLayout>
    </Container>
  );
};

// eslint-disable-next-line arrow-body-style
const CallSummary = ({ item }) => {
  const [setCopySuccess] = useState(false);

  const copyToClipboard = async () => {
    try {
      const summaryText = getTextFileFormattedMeetingDetails(item);
      await navigator.clipboard.writeText(summaryText);
      setCopySuccess(true);
      // Reset the success state after 2 seconds
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = getTextFileFormattedMeetingDetails(item);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (fallbackErr) {
        logger.error('Fallback copy failed:', fallbackErr);
      }
    }
  };

  const downloadCallSummary = async (option) => {
    if (option.detail.id === 'download') {
      await exportToTextFile(getTextFileFormattedMeetingDetails(item), `Summary-${item.callId}`);
    } else if (option.detail.id === 'email') {
      window.open(`mailto:?subject=${item.callId}&body=${getEmailFormattedSummary(item.callSummaryText)}`);
    } else if (option.detail.id === 'docx') {
      await exportToDocxFile(getTextFileFormattedMeetingDetails(item), `Summary-${item.callId}`);
    } else if (option.detail.id === 'copy') {
      await copyToClipboard();
    }
  };

  return (
    <Container
      header={
        <Header
          variant="h4"
          info={
            <Link
              variant="info"
              target="_blank"
              href="https://docs.aws.amazon.com/transcribe/latest/dg/call-analytics-insights.html#call-analytics-insights-summarization"
            >
              Info
            </Link>
          }
          actions={
            <SpaceBetween size="xxs" direction="horizontal">
              {item.callSummaryText && (
                <ButtonDropdown
                  items={[
                    { text: 'Copy to clipboard', id: 'copy', disabled: false, iconName: 'copy' },
                    { text: 'Download summary', id: 'download', disabled: false, iconName: 'download' },
                    { text: 'Email summary (beta)', id: 'email', disabled: false, iconName: 'envelope' },
                    { text: 'Download as Word', id: 'docx', disabled: false, iconName: 'file' },
                  ]}
                  variant="normal"
                  onItemClick={(option) => downloadCallSummary(option)}
                >
                  <Icon name="download" variant="primary" />
                </ButtonDropdown>
              )}
            </SpaceBetween>
          }
        >
          Meeting Summary
        </Header>
      }
    >
      <Grid gridDefinition={[{ colspan: { default: 12 } }]}>
        <Tabs
          tabs={[
            {
              label: 'Transcript Summary',
              id: 'summary',
              content: (
                <div>
                  <div>
                    {/* eslint-disable-next-line react/no-array-index-key */}
                    <TextContent color="gray">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                        {getMarkdownSummary(item.callSummaryText)}
                      </ReactMarkdown>
                    </TextContent>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Grid>
    </Container>
  );
};

const getSentimentImage = (segment, enableSentimentAnalysis) => {
  const { sentiment, sentimentScore, sentimentWeighted } = segment;
  if (!sentiment || !enableSentimentAnalysis) {
    // returns an empty div to maintain spacing
    return <div className="sentiment-image" />;
  }
  const weightedSentimentLabel = getWeightedSentimentLabel(sentimentWeighted);
  return (
    <Popover
      dismissAriaLabel="Close"
      header="Sentiment"
      size="medium"
      triggerType="custom"
      content={
        <SpaceBetween size="s">
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              Sentiment
            </Box>
            <div>{sentiment}</div>
          </div>
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              Sentiment Scores
            </Box>
            <div>{JSON.stringify(sentimentScore)}</div>
          </div>
          <div>
            <Box margin={{ bottom: 'xxxs' }} color="text-label">
              Weighted Sentiment
            </Box>
            <div>{sentimentWeighted}</div>
          </div>
        </SpaceBetween>
      }
    >
      <div className="sentiment-image-popover">
        <SentimentIcon sentiment={weightedSentimentLabel} />
      </div>
    </Popover>
  );
};

const getTimestampFromSeconds = (secs) => {
  if (secs === null || secs === undefined || Number.isNaN(secs)) {
    return '00:00.0';
  }
  return new Date(secs * 1000).toISOString().substr(14, 7);
};

const getTimestampFromMilliseconds = (ms) => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return '00:00.0';
  }
  return new Date(ms).toISOString().substr(14, 7);
};

const TranscriptContent = ({ segment, translateCache }) => {
  const { settings } = useSettingsContext();
  const regex = settings?.CategoryAlertRegex ?? '.*';

  const { transcript, segmentId, channel, targetLanguage, translateOn, tokens } = segment;

  // ✅ Word-by-word rendering for live transcripts (like Soniox examples)
  if (tokens && tokens.length > 0) {
    return (
      <div style={{ display: 'inline' }}>
        {tokens.map((token) => (
          <span
            key={`${segmentId}-token-${token.start_ms}-${token.end_ms}`}
            style={{
              color: token.is_final ? '#000000' : '#888888', // Dark for final, gray for non-final
              fontWeight: token.is_final ? 'normal' : '300',
            }}
          >
            {token.text}
          </span>
        ))}
      </div>
    );
  }

  // ✅ Original rendering for database transcripts
  const k = segmentId.concat('-', targetLanguage);

  // prettier-ignore
  const currTranslated = translateOn
    && targetLanguage !== ''
    && translateCache[k] !== undefined
    && translateCache[k].translated !== undefined
    ? translateCache[k].translated
    : '';

  const result = currTranslated !== undefined ? currTranslated : '';

  const transcriptPiiSplit = transcript.split(piiTypesSplitRegEx);

  const transcriptComponents = transcriptPiiSplit.map((t, i) => {
    if (COMPREHEND_PII_TYPES.includes(t)) {
      // eslint-disable-next-line react/no-array-index-key
      return <Badge key={`${segmentId}-pii-${i}`} color="red">{`${t}`}</Badge>;
    }

    let className = '';
    let text = t;
    let translatedText = result;

    switch (channel) {
      case 'AGENT_ASSISTANT':
      case 'MEETING_ASSISTANT':
        className = 'transcript-segment-agent-assist';
        break;
      case 'AGENT':
      case 'CALLER':
        text = text.substring(text.indexOf(':') + 1).trim();
        translatedText = translatedText.substring(translatedText.indexOf(':') + 1).trim();
        break;
      case 'CATEGORY_MATCH':
        if (text.match(regex)) {
          className = 'transcript-segment-category-match-alert';
          text = `Alert: ${text}`;
        } else {
          className = 'transcript-segment-category-match';
          text = `Category: ${text}`;
        }
        break;
      default:
        break;
    }

    return (
      // prettier-ignore
      // eslint-disable-next-line react/no-array-index-key
      <TextContent key={`${segmentId}-text-${i}`} color="red" className={className}>
        <ReactMarkdown rehypePlugins={[rehypeRaw]} components={{ end: 'span' }}>
          {text.trim()}
        </ReactMarkdown>
        <ReactMarkdown className="translated-text" rehypePlugins={[rehypeRaw]} components={{ end: 'span' }}>
          {translatedText.trim()}
        </ReactMarkdown>
      </TextContent>
    );
  });

  return (
    <SpaceBetween direction="horizontal" size="xxs">
      {transcriptComponents}
    </SpaceBetween>
  );
};

const TranscriptSegment = ({ segment, translateCache, enableSentimentAnalysis, onSpeakerClick, speakerIdentities }) => {
  const { channel } = segment;

  if (channel === 'CATEGORY_MATCH') {
    const categoryText = `${segment.transcript}`;
    const newSegment = segment;
    newSegment.transcript = categoryText;
    return (
      <Grid className="transcript-segment" disableGutters gridDefinition={[{ colspan: 1 }, { colspan: 10 }]}>
        {getSentimentImage(segment, enableSentimentAnalysis)}
        <SpaceBetween direction="vertical" size="xxs">
          <TranscriptContent segment={newSegment} translateCache={translateCache} />
        </SpaceBetween>
      </Grid>
    );
  }

  let displayChannel = `${segment.channel}`;
  let channelClass = '';

  if (channel === 'AGENT' || channel === 'CALLER') {
    const speakerNumber = segment.speaker_number || segment.speaker;
    const cleanSpeakerNumber = typeof speakerNumber === 'string' ? speakerNumber.replace(/^spk_/, '') : speakerNumber;
    const speakerIdentity = speakerIdentities?.[speakerNumber];

    if (speakerIdentity?.name) {
      displayChannel = `${speakerIdentity.name} (Speaker ${cleanSpeakerNumber})`;
    } else if (segment.speaker_number) {
      displayChannel = `Speaker ${cleanSpeakerNumber}`;
    } else {
      displayChannel = `${segment.speaker}`.trim();
    }
  } else if (channel === 'AGENT_ASSISTANT' || channel === 'MEETING_ASSISTANT') {
    displayChannel = 'MEETING_ASSISTANT';
    channelClass = 'transcript-segment-agent-assist';
  }

  const handleSpeakerClick = () => {
    if ((channel === 'AGENT' || channel === 'CALLER') && segment.speaker_number) {
      onSpeakerClick(segment.speaker_number, speakerIdentities?.[segment.speaker_number]?.name);
    }
  };

  const isSpeakerClickable = (channel === 'AGENT' || channel === 'CALLER') && segment.speaker_number;

  return (
    <Grid className="transcript-segment" disableGutters gridDefinition={[{ colspan: 1 }, { colspan: 10 }]}>
      {getSentimentImage(segment, enableSentimentAnalysis)}
      <SpaceBetween direction="vertical" size="xxs" className={channelClass}>
        <SpaceBetween direction="horizontal" size="xs">
          <TextContent>
            {isSpeakerClickable ? (
              <button
                type="button"
                style={{
                  cursor: 'pointer',
                  color: '#0972D3',
                  textDecoration: 'underline',
                  fontWeight: 'bold',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                }}
                onClick={handleSpeakerClick}
                title="Click to identify this speaker"
              >
                {displayChannel}
              </button>
            ) : (
              <strong>{displayChannel}</strong>
            )}
          </TextContent>
          <TextContent>
            {`${getTimestampFromSeconds(segment.startTime)} -
              ${getTimestampFromSeconds(segment.endTime)}`}
          </TextContent>
        </SpaceBetween>
        <TranscriptContent segment={segment} translateCache={translateCache} />
      </SpaceBetween>
    </Grid>
  );
};

/**
 * ✅ SONIOX PATTERN: Group tokens into blocks by speaker (simplified)
 * This follows the exact pattern from Soniox React Native example
 */
/**
 * ✅ SONIOX PATTERN: Group tokens into blocks by speaker (simplified)
 * This follows the exact pattern from Soniox React Native example (renderer.tsx:18-43)
 */
const groupTokensIntoBlocks = (tokens, speakerIdentities) => {
  if (!tokens.length) return [];

  const blocks = [];
  let currentBlock = null;

  tokens.forEach((token, idx) => {
    const speaker = token.speaker || '1';
    const speakerNumber = token.speaker_number || speaker;

    // Create new block when speaker changes (like Soniox: line 28)
    if (!currentBlock || currentBlock.speaker_number !== speakerNumber) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      currentBlock = {
        id: `block-${idx}-${speakerNumber}`,
        speaker_number: speakerNumber,
        speaker_name: speakerIdentities?.[speakerNumber]?.name,
        tokens: [token],
        startTime: token.start_ms / 1000,
        endTime: token.end_ms && token.end_ms > token.start_ms ? token.end_ms / 1000 : token.start_ms / 1000 + 0.5,
        channel: token.channel || (speakerNumber === '1' ? 'AGENT' : 'CALLER'),
      };
    } else {
      // Same speaker - append token to current block (like Soniox: line 37)
      currentBlock.tokens.push(token);
      // Update endTime to latest token's end
      if (token.end_ms && token.end_ms > token.start_ms) {
        currentBlock.endTime = Math.max(currentBlock.endTime, token.end_ms / 1000);
      } else {
        currentBlock.endTime = Math.max(currentBlock.endTime, token.start_ms / 1000 + 0.5);
      }
    }
  });

  // Don't forget last block
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
};

/**
 * ✅ SONIOX PATTERN: Render a token block (replaces complex TranscriptSegment)
 * Simple component that shows speaker + time + tokens
 */
const TokenBlock = ({ block, onSpeakerClick, enableSentimentAnalysis }) => {
  const cleanSpeakerNumber =
    typeof block.speaker_number === 'string' ? block.speaker_number.replace(/^spk_/, '') : block.speaker_number;

  const displayName = block.speaker_name
    ? `${block.speaker_name} (Speaker ${cleanSpeakerNumber})`
    : `Speaker ${cleanSpeakerNumber}`;

  const isSpeakerClickable = block.speaker_number != null;

  return (
    <Grid className="transcript-segment" disableGutters gridDefinition={[{ colspan: 1 }, { colspan: 10 }]}>
      <div className="sentiment-image" />
      <SpaceBetween direction="vertical" size="xxs">
        <SpaceBetween direction="horizontal" size="xs">
          <TextContent>
            {isSpeakerClickable ? (
              <button
                type="button"
                style={{
                  cursor: 'pointer',
                  color: '#0972D3',
                  textDecoration: 'underline',
                  fontWeight: 'bold',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                }}
                onClick={() => onSpeakerClick(block.speaker_number, block.speaker_name)}
                title="Click to identify this speaker"
              >
                {displayName}
              </button>
            ) : (
              <strong>{displayName}</strong>
            )}
          </TextContent>
          <TextContent>
            {`${getTimestampFromSeconds(block.startTime)} - ${getTimestampFromSeconds(block.endTime)}`}
          </TextContent>
        </SpaceBetween>
        {/* Render all tokens in this block */}
        <div style={{ display: 'inline' }}>
          {block.tokens.map((token, tokenIdx) => (
            <span
              key={`${block.id}-token-${tokenIdx}`}
              style={{
                color: token.is_final ? '#000000' : '#888888',
                fontWeight: token.is_final ? 'normal' : '300',
              }}
            >
              {token.text}
            </span>
          ))}
        </div>
      </SpaceBetween>
    </Grid>
  );
};

const CallInProgressTranscript = ({
  item,
  callTranscriptPerCallId,
  autoScroll,
  translateClient,
  targetLanguage,
  agentTranscript,
  translateOn,
  collapseSentiment,
  enableSentimentAnalysis,
  speakerIdentities,
  onSpeakerClick,
}) => {
  const { settings } = useSettingsContext();
  const { user } = useAppContext();
  const bottomRef = useRef();
  const containerRef = useRef();
  const [turnByTurnSegments, setTurnByTurnSegments] = useState([]);
  const [translateCache, setTranslateCache] = useState({});
  const [cacheSeen, setCacheSeen] = useState({});
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [updateFlag, setUpdateFlag] = useState(false);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  // ✅ Store tokens exactly like Soniox examples: accumulate final, replace non-final
  const [finalTokens, setFinalTokens] = useState([]);
  const [nonFinalTokens, setNonFinalTokens] = useState([]);
  const [tokenUpdateCounter, setTokenUpdateCounter] = useState(0); // Force re-render trigger
  const scrollTimeoutRef = useRef(null); // For debouncing scroll

  // channels: AGENT, AGENT_ASSIST, CALLER, CATEGORY_MATCH,
  // AGENT_VOICETONE, CALLER_VOICETONE
  const maxChannels = 6;
  const { callId } = item;
  const transcriptsForThisCallId = callTranscriptPerCallId[callId] || {};
  const transcriptChannels = Object.keys(transcriptsForThisCallId).slice(0, maxChannels);

  // WebSocket connection for real-time word-by-word transcripts (only for in-progress calls)
  const JWT_TOKEN =
    user?.signInUserSession?.accessToken?.jwtToken || localStorage.getItem('supabase-client-accesstokenjwt') || '';
  const ID_TOKEN =
    user?.signInUserSession?.idToken?.jwtToken || localStorage.getItem('supabase-client-idtokenjwt') || '';
  const REFRESH_TOKEN =
    user?.signInUserSession?.refreshToken?.jwtToken || localStorage.getItem('supabase-client-refreshtoken') || '';

  // Accept both display label ('In Progress') AND database status ('started')
  const isLiveCall = item.recordingStatusLabel === IN_PROGRESS_STATUS || item.status?.toLowerCase?.() === 'started';

  console.log('🔌 [WEBSOCKET DEBUG]');
  console.log('  Database status:', item.status);
  console.log('  Display label:', item.recordingStatusLabel);
  console.log('  Expected:', IN_PROGRESS_STATUS, 'OR', 'started');
  console.log('  isLiveCall:', isLiveCall);
  console.log('  WSEndpoint:', settings.WSEndpoint);
  console.log('  Has JWT_TOKEN:', !!JWT_TOKEN);
  console.log('  Will skip WebSocket?', !isLiveCall || !settings.WSEndpoint || !JWT_TOKEN);

  const { lastMessage, sendMessage } = useWebSocket(settings.WSEndpoint, {
    queryParams: {
      authorization: `Bearer ${JWT_TOKEN}`,
      id_token: ID_TOKEN,
      refresh_token: REFRESH_TOKEN,
    },
    shouldReconnect: () => isLiveCall,
    skip: !isLiveCall || !settings.WSEndpoint || !JWT_TOKEN,
    share: true, // Share connection across components
    onOpen: () => {
      // Send SUBSCRIBE event to register this viewing connection
      const subscribeEvent = {
        callEvent: 'SUBSCRIBE',
        callId,
      };
      console.log('🔗 [WEBSOCKET] Connected! Sending SUBSCRIBE event:', subscribeEvent);
      sendMessage(JSON.stringify(subscribeEvent));
    },
  });

  // Handle real-time WebSocket messages for word-by-word display (like Soniox examples)
  useEffect(() => {
    if (!lastMessage) {
      console.log('⚠️ [WEBSOCKET] No lastMessage');
      return;
    }
    if (!isLiveCall) {
      console.log('⚠️ [WEBSOCKET] Not a live call, skipping message');
      return;
    }

    console.log('📨 [WEBSOCKET] Received message:', lastMessage.data.substring(0, 100));

    try {
      const message = JSON.parse(lastMessage.data);

      // Handle TOKENS event (word-by-word updates)
      // ✅ Follow Soniox pattern: accumulate final, replace non-final
      if (message.event === 'TOKENS' && message.callId === callId) {
        const tokenTexts = message.tokens.map((t) => `${t.text}${t.is_final ? '✓' : '?'}`).join(' ');
        console.log(`📝 [TOKENS] Received ${message.tokens.length} tokens:`, tokenTexts);

        const newFinalTokens = [];
        const newNonFinalTokens = [];

        // Sort tokens by start_ms to ensure correct order
        message.tokens.sort((a, b) => a.start_ms - b.start_ms);

        message.tokens.forEach((token) => {
          if (token.is_final) {
            newFinalTokens.push(token);
          } else {
            newNonFinalTokens.push(token);
          }
        });

        // ✅ ACCUMULATE final tokens (like Soniox - no deduplication, server guarantees uniqueness)
        if (newFinalTokens.length > 0) {
          setFinalTokens((prev) => {
            console.log(
              `  ✅ Adding ${newFinalTokens.length} final tokens (${prev.length} → ${
                prev.length + newFinalTokens.length
              })`,
            );
            return [...prev, ...newFinalTokens];
          });
        }

        // ✅ REPLACE non-final tokens completely (like Soniox)
        setNonFinalTokens(newNonFinalTokens);
        console.log(`  ⏳ Replaced non-final tokens: ${newNonFinalTokens.length} tokens`);

        // Force re-render
        setTokenUpdateCounter((prev) => prev + 1);
      }

      // Handle TRANSCRIPT event (final complete transcript from database)
      if (message.event === 'TRANSCRIPT' && message.callId === callId) {
        console.log('✅ [TRANSCRIPT] Received final from DB:', message.transcript);
        // ✅ Clear live tokens that overlap with this database transcript
        // Extract time range from message
        const dbStartTime = message.start_time || 0;
        const dbEndTime = message.end_time || 999999;
        const dbSpeaker = message.speaker_number;

        setFinalTokens((prev) =>
          prev.filter((t) => {
            const tokenTime = t.start_ms / 1000;
            const isOverlap = t.speaker === dbSpeaker && tokenTime >= dbStartTime && tokenTime <= dbEndTime;
            if (isOverlap) {
              console.log(`  🧹 Removing token at ${tokenTime}s (covered by DB transcript)`);
            }
            return !isOverlap;
          }),
        );

        setNonFinalTokens((prev) =>
          prev.filter((t) => {
            const tokenTime = t.start_ms / 1000;
            return !(t.speaker === dbSpeaker && tokenTime >= dbStartTime && tokenTime <= dbEndTime);
          }),
        );
      }
    } catch (error) {
      // Not a JSON message or parsing error
    }
  }, [lastMessage, isLiveCall, callId]);

  const getSegments = () => {
    const currentTurnByTurnSegments = transcriptChannels
      .map((c) => {
        const { segments } = transcriptsForThisCallId[c];
        return segments;
      })
      // sort entries by end time
      .reduce((p, c) => [...p, ...c].sort((a, b) => a.endTime - b.endTime), [])
      .map((c) => {
        const t = c;
        return t;
      });

    return currentTurnByTurnSegments;
  };

  const updateTranslateCache = (seg) => {
    const promises = [];
    // prettier-ignore
    for (let i = 0; i < seg.length; i += 1) {
      const k = seg[i].segmentId.concat('-', targetLanguage);

      // prettier-ignore
      if (translateCache[k] === undefined) {
        // Now call translate API
        const params = {
          Text: seg[i].transcript,
          SourceLanguageCode: 'auto',
          TargetLanguageCode: targetLanguage,
        };
        const command = new TranslateTextCommand(params);

        logger.debug('Translate API being invoked for:', seg[i].transcript, targetLanguage);

        promises.push(
          translateClient.send(command).then(
            (data) => {
              const n = {};
              logger.debug('Translate API response:', seg[i].transcript, targetLanguage, data.TranslatedText);
              n[k] = { cacheId: k, transcript: seg[i].transcript, translated: data.TranslatedText };
              return n;
            },
            (error) => {
              logger.debug('Error from translate:', error);
            },
          ),
        );
      }
    }
    return promises;
  };

  // Translate all segments when the call is completed.
  useEffect(() => {
    if (translateOn && targetLanguage !== '' && item.recordingStatusLabel !== IN_PROGRESS_STATUS) {
      const promises = updateTranslateCache(getSegments());
      Promise.all(promises).then((results) => {
        // prettier-ignore
        if (results.length > 0) {
          setTranslateCache((state) => ({
            ...state,
            ...results.reduce((a, b) => ({ ...a, ...b })),
          }));
          setUpdateFlag((state) => !state);
        }
      });
    }
  }, [targetLanguage, agentTranscript, translateOn, item.recordingStatusLabel]);

  // Translate real-time segments when the call is in progress.
  useEffect(async () => {
    const c = getSegments();
    // prettier-ignore
    if (
      translateOn
      && targetLanguage !== ''
      && c.length > 0
      && item.recordingStatusLabel === IN_PROGRESS_STATUS
    ) {
      const k = c[c.length - 1].segmentId.concat('-', targetLanguage);
      const n = {};
      if (c[c.length - 1].isPartial === false && cacheSeen[k] === undefined) {
        n[k] = { seen: true };
        setCacheSeen((state) => ({
          ...state,
          ...n,
        }));

        // prettier-ignore
        if (translateCache[k] === undefined) {
          // Now call translate API
          const params = {
            Text: c[c.length - 1].transcript,
            SourceLanguageCode: 'auto',
            TargetLanguageCode: targetLanguage,
          };
          const command = new TranslateTextCommand(params);

          logger.debug('Translate API being invoked for:', c[c.length - 1].transcript, targetLanguage);

          try {
            const data = await translateClient.send(command);
            const o = {};
            logger.debug('Translate API response:', c[c.length - 1].transcript, data.TranslatedText);
            o[k] = {
              cacheId: k,
              transcript: c[c.length - 1].transcript,
              translated: data.TranslatedText,
            };
            setTranslateCache((state) => ({
              ...state,
              ...o,
            }));
          } catch (error) {
            logger.debug('Error from translate:', error);
          }
        }
      }
      if (Date.now() - lastUpdated > 500) {
        setUpdateFlag((state) => !state);
        logger.debug('Updating turn by turn with latest cache');
      }
    }
    setLastUpdated(Date.now());
  }, [callTranscriptPerCallId]);

  const getTurnByTurnSegments = () => {
    console.log('🔍 [RENDER] getTurnByTurnSegments called');
    console.log('  Final tokens:', finalTokens.length);
    console.log('  Non-final tokens:', nonFinalTokens.length);

    // ✅ Combine all tokens with deduplication (prefer final over non-final)
    // Create a Map with unique key: speaker + start_ms + text (first 20 chars)
    const tokenMap = new Map();

    // Add non-final tokens first
    nonFinalTokens.forEach((token) => {
      if (token.text && token.start_ms != null) {
        const textPrefix = token.text.trim().substring(0, 20);
        const key = `${token.speaker || '1'}-${token.start_ms}-${textPrefix}`;
        tokenMap.set(key, token);
      }
    });

    // Add final tokens (will overwrite non-final if duplicate)
    finalTokens.forEach((token) => {
      if (token.text && token.start_ms != null) {
        const textPrefix = token.text.trim().substring(0, 20);
        const key = `${token.speaker || '1'}-${token.start_ms}-${textPrefix}`;
        tokenMap.set(key, token);
      }
    });

    const allLiveTokens = Array.from(tokenMap.values());

    // Sort by start_ms to ensure correct order
    allLiveTokens.sort((a, b) => a.start_ms - b.start_ms);

    console.log(
      `  📦 Combined to ${allLiveTokens.length} unique tokens (deduped from ${
        finalTokens.length + nonFinalTokens.length
      })`,
    );

    // 🐛 Debug: Log tokens with end_ms issues
    allLiveTokens.forEach((token, idx) => {
      if (token.end_ms == null || token.end_ms === 0 || token.end_ms <= token.start_ms) {
        console.warn(
          `  ⚠️ Token[${idx}] has invalid end_ms: start=${token.start_ms}, end=${
            token.end_ms
          }, text="${token.text.substring(0, 30)}..."`,
        );
      }
    });

    // Convert tokens to segments
    const liveTokenSegments = [];
    let currentSegment = null;

    // ✅ Group tokens into segments by speaker (like Soniox: only when speaker/language changes)
    allLiveTokens.forEach((token) => {
      // Skip tokens without text or invalid timestamps
      if (!token.text || typeof token.start_ms !== 'number' || token.start_ms < 0) {
        return;
      }

      const speaker = token.speaker || '1';
      // ✅ Like Soniox: only create new segment when speaker changes (no time gap check)
      const shouldStartNewSegment = !currentSegment || currentSegment.speaker_number !== speaker;

      if (shouldStartNewSegment) {
        // Save previous segment
        if (currentSegment) {
          liveTokenSegments.push(currentSegment);
        }
        // Start new segment
        const channel = speaker === '1' ? 'AGENT' : 'CALLER';
        const startTime = token.start_ms / 1000;
        // ✅ Ensure endTime > startTime ALWAYS: use end_ms ONLY if > start_ms
        let endTime;
        if (token.end_ms != null && typeof token.end_ms === 'number' && token.end_ms > token.start_ms) {
          endTime = token.end_ms / 1000;
        } else {
          // Estimate: final tokens ~0.5s, non-final ~1s (NEVER use 0)
          const duration = token.is_final ? 0.5 : 1.0;
          endTime = startTime + duration;
        }

        currentSegment = {
          transcript: token.text,
          tokens: [token],
          speaker_number: speaker,
          speaker: channel,
          channel,
          startTime,
          endTime,
          isPartial: !token.is_final,
          segmentId: `live-${speaker}-${token.start_ms}`,
          createdAt: new Date().toISOString(),
          isLiveToken: true, // ✅ Flag to identify live tokens
        };
      } else {
        // Append to current segment
        currentSegment.transcript += token.text;
        currentSegment.tokens.push(token);
        // ✅ Update endTime: always ensure it moves forward AND never becomes 0
        if (token.end_ms != null && typeof token.end_ms === 'number' && token.end_ms > token.start_ms) {
          currentSegment.endTime = Math.max(currentSegment.endTime, token.end_ms / 1000);
        } else {
          // Estimate based on token duration (NEVER allow 0)
          const duration = token.is_final ? 0.5 : 1.0;
          const estimatedEnd = token.start_ms / 1000 + duration;
          currentSegment.endTime = Math.max(currentSegment.endTime, estimatedEnd);
        }
        currentSegment.isPartial = currentSegment.isPartial || !token.is_final;
      }
    });

    // Save the last segment
    if (currentSegment) {
      liveTokenSegments.push(currentSegment);
    }

    console.log(`📊 Created ${liveTokenSegments.length} segments from ${allLiveTokens.length} tokens`);

    // Get database segments
    const databaseSegments = transcriptChannels
      .map((c) => {
        const { segments } = transcriptsForThisCallId[c];
        return segments;
      })
      .reduce((p, c) => [...p, ...c], [])
      .sort((a, b) => a.startTime - b.startTime);

    const hasLiveTokens = liveTokenSegments.length > 0;
    const hasDatabaseSegments = databaseSegments.length > 0;

    console.log('🔍 [DEBUG SEGMENTS]');
    console.log('  Live token segments:', liveTokenSegments.length);
    console.log('  Database segments:', databaseSegments.length);

    // ✅ For in-progress calls: Show BOTH database + live tokens (merged by time)
    // ✅ For completed calls: Show database only
    let allSegments = [];
    if (hasLiveTokens && hasDatabaseSegments) {
      // Merge database + live, but DEDUPLICATE to avoid showing same content twice
      console.log('  Using: DATABASE + LIVE TOKENS (MERGED WITH DEDUPLICATION)');

      // ✅ Create a Set of database time ranges for fast lookup (overlap detection)
      const databaseTimeRanges = databaseSegments.map((seg) => ({
        speaker: seg.speaker_number,
        start: seg.startTime,
        end: seg.endTime,
      }));

      // Only add live tokens that don't overlap with database segments
      const uniqueLiveTokens = liveTokenSegments.filter((liveSeg) => {
        // Check if this live segment overlaps with any database segment (same speaker + time overlap)
        const hasOverlap = databaseTimeRanges.some((dbRange) => {
          if (dbRange.speaker !== liveSeg.speaker_number) return false;
          // Check time overlap: segments overlap if one starts before the other ends
          const overlaps = liveSeg.startTime < dbRange.end && liveSeg.endTime > dbRange.start;
          return overlaps;
        });

        if (hasOverlap) {
          console.log(
            `  🚫 Skipping overlapping live token: Speaker ${liveSeg.speaker_number} [${liveSeg.startTime.toFixed(
              1,
            )}s-${liveSeg.endTime.toFixed(1)}s] "${liveSeg.transcript.substring(0, 30)}..."`,
          );
        }
        return !hasOverlap;
      });

      console.log(`  Kept ${uniqueLiveTokens.length}/${liveTokenSegments.length} unique live tokens`);
      allSegments = [...databaseSegments, ...uniqueLiveTokens].sort((a, b) => a.startTime - b.startTime);
    } else if (hasLiveTokens) {
      console.log('  Using: LIVE TOKENS ONLY');
      allSegments = liveTokenSegments;
    } else {
      console.log('  Using: DATABASE ONLY');
      allSegments = databaseSegments;
    }

    console.log('  Total segments to render:', allSegments.length);

    const currentTurnByTurnSegments = allSegments
      .reduce((accumulator, current) => {
        // ✅ Only merge LIVE tokens (database segments are already properly separated)
        const previous = accumulator.length > 0 ? accumulator[accumulator.length - 1] : null;

        // prettier-ignore
        // ✅ Merge consecutive segments from same speaker
        // For live tokens: merge all from same speaker (Soniox pattern)
        // For database: merge only if both are database (already properly grouped)
        const bothAreLive = previous.isLiveToken && current.isLiveToken;
        const bothAreDatabase = !previous.isLiveToken && !current.isLiveToken;
        
        const shouldMerge =
          previous &&
          shouldAppendToPreviousSegment({ previous, current }) &&
          !translateOn &&
          (bothAreLive || bothAreDatabase); // Merge if both are same type

        if (!shouldMerge) {
          accumulator.push({ ...current });
        } else {
          appendToPreviousSegment({ previous: accumulator[accumulator.length - 1], current });
        }
        return accumulator;
      }, [])
      .map((c) => {
        const t = c;
        t.agentTranscript = agentTranscript;
        t.targetLanguage = targetLanguage;
        t.translateOn = translateOn;
        // In streaming audio the speaker will just be "Other participant", override this with the
        // name the user chose if needed
        if (t.speaker === DEFAULT_OTHER_SPEAKER_NAME || t.speaker === '') {
          t.speaker = item.callerPhoneNumber || DEFAULT_OTHER_SPEAKER_NAME;
        }
        // ✅ Clean up internal flag
        delete t.isLiveToken;

        return t;
      })
      .map(
        // prettier-ignore
        (s) => {
          return (
            s?.segmentId
            && s?.createdAt
            && (s.agentTranscript === undefined
              || s.agentTranscript || s.channel !== 'AGENT')
            && (s.channel !== 'AGENT_VOICETONE')
            && (s.channel !== 'CALLER_VOICETONE')
            && (s.channel !== 'CHAT_ASSISTANT')
            && <TranscriptSegment
              key={`${s.segmentId}-${s.createdAt}`}
              segment={s}
              translateCache={translateCache}
              enableSentimentAnalysis={enableSentimentAnalysis}
              participantName={item.callerPhoneNumber}
              onSpeakerClick={onSpeakerClick}
              speakerIdentities={speakerIdentities}
            />
          );
        },
      );

    // this element is used for scrolling to bottom and to provide padding
    currentTurnByTurnSegments.push(<div key="bottom" ref={bottomRef} />);
    return currentTurnByTurnSegments;
  };

  // Smooth scroll to bottom function
  const scrollToBottom = (behavior = 'smooth') => {
    if (containerRef.current) {
      // Use requestAnimationFrame for smoother rendering
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight,
            behavior,
          });
        }
      });
    }
  };

  // Detect when user manually scrolls
  const handleScroll = (e) => {
    const container = e.target;
    const threshold = 50; // pixels from bottom
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (!isAtBottom && autoScroll) {
      setUserHasScrolled(true);
    } else if (isAtBottom) {
      setUserHasScrolled(false);
    }
  };

  useEffect(() => {
    setTurnByTurnSegments(getTurnByTurnSegments);
  }, [
    callTranscriptPerCallId,
    item.recordingStatusLabel,
    targetLanguage,
    agentTranscript,
    translateOn,
    updateFlag,
    speakerIdentities,
    finalTokens,
    nonFinalTokens,
    tokenUpdateCounter, // Trigger re-render when tokens update
  ]);

  // Auto-scroll effect with debouncing for smooth experience
  useEffect(() => {
    // Clear any pending scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Only auto-scroll if conditions are met
    // prettier-ignore
    if (item.recordingStatusLabel === IN_PROGRESS_STATUS && autoScroll && !userHasScrolled) {
      // Debounce scroll to prevent thrashing (smooth out rapid updates)
      scrollTimeoutRef.current = setTimeout(() => {
        scrollToBottom('smooth');
      }, 50); // Small delay to batch rapid updates
    }

    // Cleanup timeout on unmount
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
    // prettier-ignore
  }, [turnByTurnSegments, autoScroll, userHasScrolled, item.recordingStatusLabel]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        overflowY: 'auto',
        maxHeight: collapseSentiment ? '34vh' : '68vh',
        paddingLeft: '10px',
        paddingTop: '5px',
        paddingRight: '10px',
        scrollBehavior: 'smooth',
        willChange: 'scroll-position',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Visual indicator when auto-scroll is paused */}
      {userHasScrolled && autoScroll && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: '#ffeaa7',
            padding: '5px 10px',
            textAlign: 'center',
            fontSize: '12px',
            zIndex: 1000,
            borderRadius: '4px',
            margin: '0 0 10px 0',
            border: '1px solid #fdcb6e',
          }}
        >
          ⚠️ Auto-scroll paused - scroll to bottom to resume
          <span style={{ marginLeft: '10px' }}>
            <Button
              onClick={() => {
                setUserHasScrolled(false);
                scrollToBottom('smooth');
              }}
              variant="inline-link"
              iconName="angle-down"
            >
              Resume
            </Button>
          </span>
        </div>
      )}
      <ColumnLayout borders="horizontal" columns={1}>
        {turnByTurnSegments}
      </ColumnLayout>
    </div>
  );
};

const getAgentAssistPanel = (item, collapseSentiment) => {
  if (process.env.REACT_APP_ENABLE_AGENT_ASSIST === 'true') {
    // Use STRANDS UI for Lambda mode, Lex UI for Lex mode
    const iframeSrc =
      process.env.REACT_APP_AGENT_ASSIST_MODE === 'LAMBDA'
        ? `/strands-chat.html?callId=${item.callId}`
        : `/index-lexwebui.html?callId=${item.callId}`;

    console.log(`DEBUG: Agent Assist Mode: ${process.env.REACT_APP_AGENT_ASSIST_MODE}, Using iframe: ${iframeSrc}`);

    return (
      <Container
        disableContentPaddings
        header={
          <Header
            variant="h4"
            info={
              <Link variant="info" target="_blank" href="https://amazon.com/live-meeting-assistant">
                Info
              </Link>
            }
          >
            Meeting Assist Bot
          </Header>
        }
      >
        <Box style={{ height: collapseSentiment ? '34vh' : '68vh' }}>
          <iframe
            style={{ border: '0px', height: collapseSentiment ? '34vh' : '68vh', margin: '0' }}
            title="Meeting Assist"
            src={iframeSrc}
            width="100%"
          />
        </Box>
      </Container>
    );
  }
  return null;
};
const getTranscriptContent = ({
  item,
  callTranscriptPerCallId,
  autoScroll,
  translateClient,
  targetLanguage,
  agentTranscript,
  translateOn,
  collapseSentiment,
  enableSentimentAnalysis,
  speakerIdentities,
  onSpeakerClick,
}) => {
  switch (item.recordingStatusLabel) {
    case DONE_STATUS:
    case IN_PROGRESS_STATUS:
    default:
      return (
        <CallInProgressTranscript
          item={item}
          callTranscriptPerCallId={callTranscriptPerCallId}
          autoScroll={autoScroll}
          translateClient={translateClient}
          targetLanguage={targetLanguage}
          agentTranscript={agentTranscript}
          translateOn={translateOn}
          collapseSentiment={collapseSentiment}
          enableSentimentAnalysis={enableSentimentAnalysis}
          speakerIdentities={speakerIdentities}
          onSpeakerClick={onSpeakerClick}
        />
      );
  }
};

const CallTranscriptContainer = ({
  setToolsOpen,
  item,
  callTranscriptPerCallId,
  translateClient,
  collapseSentiment,
  enableSentimentAnalysis,
  speakerIdentities,
  onSpeakerClick,
}) => {
  const [autoScroll, setAutoScroll] = useState(item.recordingStatusLabel === IN_PROGRESS_STATUS);
  const [autoScrollDisabled, setAutoScrollDisabled] = useState(item.recordingStatusLabel !== IN_PROGRESS_STATUS);
  const [showDownloadTranscript, setShowDownloadTranscripts] = useState(item.recordingStatusLabel === DONE_STATUS);

  const [translateOn, setTranslateOn] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState(localStorage.getItem('targetLanguage') || '');
  const [agentTranscript] = useState(true);

  const handleLanguageSelect = (event) => {
    setTargetLanguage(event.target.value);
    localStorage.setItem('targetLanguage', event.target.value);
  };

  useEffect(() => {
    setAutoScrollDisabled(item.recordingStatusLabel !== IN_PROGRESS_STATUS);
    setAutoScroll(item.recordingStatusLabel === IN_PROGRESS_STATUS);
    setShowDownloadTranscripts(item.recordingStatusLabel === DONE_STATUS);
  }, [item.recordingStatusLabel]);

  const languageChoices = () => {
    if (translateOn) {
      return (
        // prettier-ignore
        // eslint-disable-jsx-a11y/control-has-associated-label
        <div>
          <select value={targetLanguage} onChange={handleLanguageSelect}>
            {LANGUAGE_CODES.map(({ value, label }) => <option value={value}>{label}</option>)}
          </select>
        </div>
      );
    }
    return translateOn;
  };

  const downloadTranscript = (option) => {
    console.log('option', option);
    if (option.detail.id === 'text') {
      downloadTranscriptAsText(callTranscriptPerCallId, item);
    } else if (option.detail.id === 'excel') {
      downloadTranscriptAsExcel(callTranscriptPerCallId, item);
    } else if (option.detail.id === 'docx') {
      downloadTranscriptAsDocx(callTranscriptPerCallId, item);
    }
  };

  return (
    <Grid
      gridDefinition={[
        {
          colspan: {
            default: 12,
            xs: process.env.REACT_APP_ENABLE_AGENT_ASSIST === 'true' ? 8 : 12,
          },
        },
        {
          colspan: {
            default: 12,
            xs: process.env.REACT_APP_ENABLE_AGENT_ASSIST === 'true' ? 4 : 0,
          },
        },
      ]}
    >
      <Container
        fitHeight="true"
        disableContentPaddings
        header={
          <Header
            variant="h4"
            info={<InfoLink onFollow={() => setToolsOpen(true)} />}
            actions={
              <SpaceBetween direction="vertical" size="xs">
                <SpaceBetween direction="horizontal" size="xs">
                  <Toggle
                    onChange={({ detail }) => setAutoScroll(detail.checked)}
                    checked={autoScroll}
                    disabled={autoScrollDisabled}
                  />
                  <span>Auto Scroll</span>
                  <Toggle onChange={({ detail }) => setTranslateOn(detail.checked)} checked={translateOn} />
                  <span>Enable Translation</span>
                  {languageChoices()}
                  {showDownloadTranscript && (
                    <SpaceBetween direction="horizontal" size="xs">
                      <ButtonDropdown
                        items={[
                          {
                            text: 'Download as',
                            iconName: 'download',
                            items: [
                              { text: 'Excel', id: 'excel', disabled: false },
                              { text: 'Text', id: 'text' },
                              { text: 'Word', id: 'docx' },
                            ],
                          },
                        ]}
                        variant="normal"
                        onItemClick={(option) => downloadTranscript(option)}
                      >
                        <Icon name="download" variant="primary" />
                      </ButtonDropdown>
                    </SpaceBetween>
                  )}
                </SpaceBetween>
              </SpaceBetween>
            }
          >
            Meeting Transcript
          </Header>
        }
      >
        {getTranscriptContent({
          item,
          callTranscriptPerCallId,
          autoScroll,
          translateClient,
          targetLanguage,
          agentTranscript,
          translateOn,
          collapseSentiment,
          enableSentimentAnalysis,
          speakerIdentities,
          onSpeakerClick,
        })}
      </Container>
      {getAgentAssistPanel(item, collapseSentiment)}
    </Grid>
  );
};

const VoiceToneContainer = ({ item, callTranscriptPerCallId, collapseSentiment, setCollapseSentiment }) => (
  <Container
    fitHeight="true"
    disableContentPaddings={collapseSentiment ? '' : 'true'}
    header={
      <Header
        variant="h4"
        info={
          <Link
            variant="info"
            target="_blank"
            href="https://docs.aws.amazon.com/chime-sdk/latest/dg/call-analytics.html"
          >
            Info
          </Link>
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="inline-icon"
              iconName={collapseSentiment ? 'angle-up' : 'angle-down'}
              onClick={() => setCollapseSentiment(!collapseSentiment)}
            />
          </SpaceBetween>
        }
      >
        Voice Tone Analysis (30sec rolling window)
      </Header>
    }
  >
    {collapseSentiment ? (
      <VoiceToneFluctuationChart item={item} callTranscriptPerCallId={callTranscriptPerCallId} />
    ) : null}
  </Container>
);

const CallStatsContainer = ({ item, callTranscriptPerCallId, collapseSentiment, setCollapseSentiment }) => (
  <>
    <Container
      disableContentPaddings={collapseSentiment ? '' : 'true'}
      header={
        <Header
          variant="h4"
          info={
            <Link
              variant="info"
              target="_blank"
              href="https://docs.aws.amazon.com/transcribe/latest/dg/call-analytics-insights.html#call-analytics-insights-sentiment"
            >
              Info
            </Link>
          }
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="inline-icon"
                iconName={collapseSentiment ? 'angle-up' : 'angle-down'}
                onClick={() => setCollapseSentiment(!collapseSentiment)}
              />
            </SpaceBetween>
          }
        >
          Meeting Sentiment Analysis
        </Header>
      }
    >
      {collapseSentiment ? (
        <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
          <SentimentFluctuationChart item={item} callTranscriptPerCallId={callTranscriptPerCallId} />
          <SentimentPerQuarterChart item={item} callTranscriptPerCallId={callTranscriptPerCallId} />
        </Grid>
      ) : null}
    </Container>
    {collapseSentiment ? (
      <Container>
        <ColumnLayout columns={4} variant="text-grid">
          <SpaceBetween size="xs">
            <div>
              <Box margin={{ bottom: 'xxxs' }} color="text-label">
                <strong>Caller Avg Sentiment:</strong>
              </Box>
              <div>
                <SentimentIcon sentiment={item.callerSentimentLabel} />
                &nbsp;
                {item.callerAverageSentiment.toFixed(3)}
                <br />
                (min: -5, max: +5)
              </div>
            </div>
          </SpaceBetween>
          <SpaceBetween size="xs">
            <div>
              <Box margin={{ bottom: 'xxxs' }} color="text-label">
                <strong>Caller Sentiment Trend:</strong>
              </Box>
              <div>
                <SentimentTrendIcon trend={item.callerSentimentTrendLabel} />
              </div>
            </div>
          </SpaceBetween>
          <SpaceBetween size="xs">
            <div>
              <Box margin={{ bottom: 'xxxs' }} color="text-label">
                <strong>Agent Avg Sentiment:</strong>
              </Box>
              <div>
                <SentimentIcon sentiment={item.agentSentimentLabel} />
                &nbsp;
                {item.agentAverageSentiment.toFixed(3)}
                <br />
                (min: -5, max: +5)
              </div>
            </div>
          </SpaceBetween>
          <SpaceBetween size="xs">
            <div>
              <Box margin={{ bottom: 'xxxs' }} color="text-label">
                <strong>Agent Sentiment Trend:</strong>
              </Box>
              <div>
                <SentimentTrendIcon trend={item.agentSentimentTrendLabel} />
              </div>
            </div>
          </SpaceBetween>
        </ColumnLayout>
      </Container>
    ) : null}
  </>
);

export const CallPanel = ({ item, callTranscriptPerCallId, setToolsOpen, getCallDetailsFromCallIds }) => {
  const { currentCredentials } = useAppContext();

  const { settings } = useSettingsContext();
  const [collapseSentiment, setCollapseSentiment] = useState(false);
  const [speakerIdentities, setSpeakerIdentities] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSpeaker, setSelectedSpeaker] = useState({ number: null, name: null });

  const enableVoiceTone = settings?.EnableVoiceToneAnalysis === 'true';
  const enableSentimentAnalysis = settings?.IsSentimentAnalysisEnabled === 'true';

  useEffect(() => {
    const loadSpeakerIdentities = async () => {
      try {
        const identities = await getSpeakerIdentities(item.callId);
        setSpeakerIdentities(identities);
      } catch (error) {
        logger.error('Failed to load speaker identities:', error);
      }
    };

    if (item.callId) {
      loadSpeakerIdentities();
    }
  }, [item.callId]);

  const handleSpeakerClick = (speakerNumber, currentName) => {
    setSelectedSpeaker({ number: speakerNumber, name: currentName });
    setModalVisible(true);
  };

  const handleSaveSpeakerName = async (speakerNumber, speakerName) => {
    try {
      await setSpeakerName(item.callId, speakerNumber, speakerName);
      setSpeakerIdentities((prev) => ({
        ...prev,
        [speakerNumber]: { name: speakerName },
      }));
    } catch (error) {
      logger.error('Failed to save speaker name:', error);
      throw error;
    }
  };

  // ✅ Using Gemini for translation instead of AWS Translate
  let translateClient = new GeminiTranslateClient({
    maxAttempts: MAXIMUM_ATTEMPTS,
  });

  /* Get a client with refreshed credentials. Credentials can go stale when user is logged in
     for an extended period.
   */
  useEffect(() => {
    logger.debug('Translate client initialized with Gemini');
    translateClient = new GeminiTranslateClient({
      maxAttempts: MAXIMUM_ATTEMPTS,
    });
  }, [currentCredentials]);

  // Add message handler for STRANDS iframe requests
  useEffect(() => {
    const handleMessage = async (event) => {
      // Handle chat message requests
      if (event.data && event.data.type === 'STRANDS_CHAT_REQUEST') {
        try {
          const mutation = `
            mutation SendChatMessage($input: SendChatMessageInput!) {
              sendChatMessage(input: $input) {
                MessageId
                Status
                CallId
                Response
              }
            }
          `;

          const variables = {
            input: {
              CallId: event.data.callId,
              Message: event.data.message,
            },
          };

          const result = await API.graphql(graphqlOperation(mutation, variables));

          // Send success response back to iframe
          const iframe = document.querySelector(`iframe[src*="strands-chat.html"]`);
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(
              {
                type: 'STRANDS_CHAT_RESPONSE',
                messageId: event.data.messageId,
                success: true,
                result,
              },
              '*',
            );
          }
        } catch (error) {
          logger.error('sendChatMessage call failed', error);

          // Send error response back to iframe
          const iframe = document.querySelector(`iframe[src*="strands-chat.html"]`);
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(
              {
                type: 'STRANDS_CHAT_RESPONSE',
                messageId: event.data.messageId,
                success: false,
                error: error.message || error.errors?.[0]?.message || 'sendChatMessage call failed',
              },
              '*',
            );
          }
        }
      }

      // Handle token stream subscription setup
      else if (event.data && event.data.type === 'STRANDS_SETUP_TOKEN_SUBSCRIPTION') {
        try {
          const subscription = `
            subscription OnAddChatToken($callId: ID!, $messageId: ID!) {
              onAddChatToken(CallId: $callId, MessageId: $messageId) {
                CallId
                MessageId
                Token
                IsComplete
                Sequence
                Timestamp
              }
            }
          `;

          // Set up token subscription
          API.graphql(
            graphqlOperation(subscription, {
              callId: event.data.callId,
              messageId: event.data.messageId,
            }),
          ).subscribe({
            next: ({ value }) => {
              const token = value?.data?.onAddChatToken;
              if (token) {
                // Send token to the chat iframe
                event.source.postMessage(
                  {
                    type: 'STRANDS_TOKEN_MESSAGE',
                    token,
                  },
                  '*',
                );
              }
            },
            error: (error) => {
              logger.error('Token subscription error', error);
            },
          });
        } catch (error) {
          logger.error('Failed to set up token subscription', error);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <>
      <SpeakerIdentificationModal
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        speakerNumber={selectedSpeaker.number}
        currentName={selectedSpeaker.name}
        onSave={handleSaveSpeakerName}
      />
      <SpaceBetween size="s">
        <CallAttributes item={item} setToolsOpen={setToolsOpen} getCallDetailsFromCallIds={getCallDetailsFromCallIds} />
        <CallSummary item={item} />
        {(enableSentimentAnalysis || enableVoiceTone) && (
          <Grid
            gridDefinition={[
              { colspan: { default: 12, xs: enableVoiceTone && enableSentimentAnalysis ? 8 : 12 } },
              { colspan: { default: 12, xs: enableVoiceTone && enableSentimentAnalysis ? 4 : 0 } },
            ]}
          >
            {enableSentimentAnalysis && (
              <CallStatsContainer
                item={item}
                callTranscriptPerCallId={callTranscriptPerCallId}
                collapseSentiment={collapseSentiment}
                setCollapseSentiment={setCollapseSentiment}
              />
            )}
            {enableVoiceTone && (
              <VoiceToneContainer
                item={item}
                callTranscriptPerCallId={callTranscriptPerCallId}
                collapseSentiment={collapseSentiment}
                setCollapseSentiment={setCollapseSentiment}
              />
            )}
          </Grid>
        )}
        <CallTranscriptContainer
          item={item}
          setToolsOpen={setToolsOpen}
          callTranscriptPerCallId={callTranscriptPerCallId}
          translateClient={translateClient}
          collapseSentiment={collapseSentiment}
          enableSentimentAnalysis={enableSentimentAnalysis}
          speakerIdentities={speakerIdentities}
          onSpeakerClick={handleSpeakerClick}
        />
      </SpaceBetween>
    </>
  );
};

export default CallPanel;
