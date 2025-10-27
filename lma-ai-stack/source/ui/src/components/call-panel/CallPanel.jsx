/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonDropdown,
  ColumnLayout,
  Container,
  Grid,
  Header,
  Icon,
  Link,
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
// Translation temporarily disabled in Soniox pattern
// import { GeminiTranslateClient, TranslateTextCommand } from '../../utils/gemini-translate';
import { getEmailFormattedSummary, getMarkdownSummary, getTextFileFormattedMeetingDetails } from '../common/summary';

import RecordingPlayer from '../recording-player';
import useSettingsContext from '../../contexts/settings';

import { DONE_STATUS, IN_PROGRESS_STATUS } from '../common/get-recording-status';
import { InfoLink } from '../common/info-link';

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

// Translation disabled
// const MAXIMUM_ATTEMPTS = 100;

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

const getTimestampFromSeconds = (secs) => {
  if (secs === null || secs === undefined || Number.isNaN(secs)) {
    return '00:00.0';
  }
  return new Date(secs * 1000).toISOString().substr(14, 7);
};

/* ✅ REPLACED BY TokenBlock - using Soniox pattern instead
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
*/

// ✅ End of commented out TranscriptSegment - replaced by TokenBlock
/**
 * ✅ SONIOX PATTERN: Group tokens into blocks by speaker ONLY
 * For inline translation (original + translated in same block), we DON'T group by language
 * We'll separate original vs translated INSIDE TokenBlock render
 * 
 * IMPORTANT: Translated tokens don't have start_ms/end_ms, so we only use ORIGINAL tokens for timestamps!
 */
const groupTokensIntoBlocks = (tokens, speakerIdentities) => {
  if (!tokens.length) return [];

  const blocks = [];
  let currentBlock = null;

  tokens.forEach((token, idx) => {
    const speaker = token.speaker || '1';
    const speakerNumber = token.speaker_number || speaker;
    const isTranslation = token.translation_status === 'translation';

    // Create new block when speaker changes (like Soniox: line 28)
    if (!currentBlock || currentBlock.speaker_number !== speakerNumber) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      // ✅ Only use ORIGINAL tokens for timestamps (translated tokens have no start_ms/end_ms)
      const hasTimestamp = token.start_ms != null && !isTranslation;

      currentBlock = {
        id: `block-${idx}-${speakerNumber}`,
        speaker_number: speakerNumber,
        speaker_name: speakerIdentities?.[speakerNumber]?.name,
        tokens: [token],
        // Only set timestamps from original tokens; initialize as null to avoid sticky 0.0s
        startTime: hasTimestamp ? token.start_ms / 1000 : null,
        endTime: hasTimestamp && token.end_ms && token.end_ms > token.start_ms
          ? token.end_ms / 1000
          : hasTimestamp
            ? token.start_ms / 1000 + 0.5
            : null,
        channel: token.channel || (speakerNumber === '1' ? 'AGENT' : 'CALLER'),
      };
    } else {
      // Same speaker - append token to current block (like Soniox: line 37)
      currentBlock.tokens.push(token);
      
      // ✅ Only update endTime from ORIGINAL tokens (skip translated tokens)
      if (!isTranslation && token.start_ms != null) {
        const tokenStart = token.start_ms / 1000;
        const tokenEnd = token.end_ms && token.end_ms > token.start_ms
          ? token.end_ms / 1000
          : token.start_ms / 1000 + 0.5;

        // Initialize or update start time
        if (currentBlock.startTime == null || tokenStart < currentBlock.startTime) {
          currentBlock.startTime = tokenStart;
        }

        // Initialize or update end time
        if (currentBlock.endTime == null || tokenEnd > currentBlock.endTime) {
          currentBlock.endTime = tokenEnd;
        }
      }
    }
  });

  // Don't forget last block
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  console.log('🔍 [groupTokensIntoBlocks] Created', blocks.length, 'blocks from', tokens.length, 'tokens');

  return blocks;
};

/**
 * ✅ SONIOX PATTERN WITH TRANSLATION: Render a token block with inline translation
 * Shows: Speaker + Time + Original Text + Translated Text (Style 2 - Labeled)
 */
const TokenBlock = ({ block, onSpeakerClick }) => {
  const cleanSpeakerNumber =
    typeof block.speaker_number === 'string' ? block.speaker_number.replace(/^spk_/, '') : block.speaker_number;

  const displayName = block.speaker_name
    ? `${block.speaker_name} (Speaker ${cleanSpeakerNumber})`
    : `Speaker ${cleanSpeakerNumber}`;

  const isSpeakerClickable = block.speaker_number != null;

  // ✅ DEBUG: Log ALL tokens in this block
  console.log('🔍 [TokenBlock DEBUG] Block ID:', block.id);
  console.log('  Total tokens:', block.tokens.length);
  console.log(
    '  First 3 tokens:',
    block.tokens.slice(0, 3).map((t) => ({
      text: t.text?.substring(0, 10),
      translation_status: t.translation_status,
      language: t.language,
      is_final: t.is_final,
    })),
  );

  // ✅ NEW: Separate tokens into original and translated
  const originalTokens = block.tokens.filter((t) => t.translation_status !== 'translation');
  const translatedTokens = block.tokens.filter((t) => t.translation_status === 'translation');

  // ✅ DEBUG: Log filtering results
  console.log('🎨 [RENDER TokenBlock] Block:', block.id);
  console.log('  → Total tokens:', block.tokens.length);
  console.log('  → Original tokens:', originalTokens.length);
  console.log('  → Translated tokens:', translatedTokens.length);
  if (translatedTokens.length > 0) {
    console.log('  ✨ TRANSLATION WILL RENDER!', {
      targetLang: translatedTokens[0]?.language,
      sample: translatedTokens.slice(0, 2).map((t) => ({
        text: t.text?.substring(0, 15),
        status: t.translation_status,
      })),
    });
  }

  // ✅ Get stable language labels using majority vote to avoid flicker
  const getDominantLanguage = (tokens) => {
    const counts = {};
    tokens.forEach((t) => {
      const lang = t.language;
      if (!lang) return;
      counts[lang] = (counts[lang] || 0) + 1;
    });
    const langs = Object.keys(counts);
    if (langs.length === 0) return undefined;
    langs.sort((a, b) => counts[b] - counts[a]);
    return langs[0];
  };

  const originalLang = getDominantLanguage(originalTokens);
  const translatedLang = getDominantLanguage(translatedTokens);

  const detectedLang = (originalLang || 'AUTO').toUpperCase();
  const targetLang = translatedLang ? translatedLang.toUpperCase() : undefined;

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
            {block.startTime != null && block.endTime != null
              ? `${getTimestampFromSeconds(block.startTime)} - ${getTimestampFromSeconds(block.endTime)}`
              : ''}
          </TextContent>
        </SpaceBetween>

        {/* ✅ Style 2 - Labeled: Original Transcript */}
        {originalTokens.length > 0 && (
          <div style={{ background: '#f9f9f9', padding: '8px', borderRadius: '4px', marginBottom: '4px' }}>
            <span style={{ color: '#999', fontSize: '11px', fontWeight: '600', marginRight: '8px' }}>
              {detectedLang}:
            </span>
            <span style={{ display: 'inline' }}>
              {originalTokens.map((token, idx) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`orig-${block.id}-${idx}`}
                  style={{
                    color: token.is_final ? '#000000' : '#888888',
                    fontWeight: token.is_final ? 'normal' : '300',
                  }}
                >
                  {token.text}
                </span>
              ))}
            </span>
          </div>
        )}

        {/* ✅ Style 2 - Labeled: Translated Transcript */}
        {translatedTokens.length > 0 && (
          <div style={{ background: '#e6f7ff', padding: '8px', borderRadius: '4px', paddingLeft: '12px' }}>
            <span style={{ color: '#0066cc', fontSize: '11px', fontWeight: '600', marginRight: '8px' }}>
              {targetLang}:
            </span>
            <span style={{ display: 'inline' }}>
              {translatedTokens.map((token, idx) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`trans-${block.id}-${idx}`}
                  style={{
                    color: token.is_final ? '#003d99' : '#6699cc',
                    fontWeight: token.is_final ? 'normal' : '300',
                  }}
                >
                  {token.text}
                </span>
              ))}
            </span>
          </div>
        )}
      </SpaceBetween>
    </Grid>
  );
};

const CallInProgressTranscript = ({
  item,
  callTranscriptPerCallId,
  autoScroll,
  agentTranscript,
  collapseSentiment,
  speakerIdentities,
  onSpeakerClick,
}) => {
  const { settings } = useSettingsContext();
  const { user } = useAppContext();
  const bottomRef = useRef();
  const containerRef = useRef();
  const [turnByTurnSegments, setTurnByTurnSegments] = useState([]);
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

        // ✅ DEBUG: Check if tokens have translation fields
        const hasTranslation = message.tokens.some((t) => t.translation_status === 'translation');
        if (hasTranslation) {
          const originals = message.tokens.filter((t) => t.translation_status !== 'translation');
          const translations = message.tokens.filter((t) => t.translation_status === 'translation');
          console.log('🌐 [TRANSLATION DETECTED!]');
          console.log(
            `  → Original tokens: ${originals.length}`,
            originals.slice(0, 2).map((t) => ({ text: t.text, lang: t.language })),
          );
          console.log(
            `  → Translated tokens: ${translations.length}`,
            translations.slice(0, 2).map((t) => ({ text: t.text, lang: t.language })),
          );
        }

        console.log('🔍 [TOKENS DEBUG] First 3 tokens full structure:');
        message.tokens.slice(0, 3).forEach((t, i) => {
          console.log(`  Token ${i}:`, {
            text: t.text?.substring(0, 20),
            translation_status: t.translation_status,
            typeof_status: typeof t.translation_status,
            language: t.language,
            is_final: t.is_final,
            speaker: t.speaker,
          });
        });

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

  // ✅ SONIOX PATTERN: Translation removed for simplicity
  // Can be re-added later if needed using token-level translation

  const getTurnByTurnSegments = () => {
    console.log('🔍 [RENDER - SONIOX PATTERN] getTurnByTurnSegments called');
    console.log('  Final tokens:', finalTokens.length);
    console.log('  Non-final tokens:', nonFinalTokens.length);

    // ✅ STEP 1: Combine live tokens (keep Soniox order: original → translation)
    // DO NOT sort here to avoid breaking original→translation adjacency
    const allLiveTokens = [...finalTokens, ...nonFinalTokens];

    // ✅ STEP 2: Get database segments and convert to token format
    const databaseTokens = transcriptChannels
      .map((c) => {
        const { segments } = transcriptsForThisCallId[c];
        return segments || [];
      })
      .reduce((p, c) => [...p, ...c], [])
      .sort((a, b) => a.startTime - b.startTime)
      .map((seg) => ({
        // Convert database segment to token format
        text: seg.transcript,
        speaker: seg.speaker_number || '1',
        speaker_number: seg.speaker_number,
        start_ms: seg.startTime * 1000,
        end_ms: seg.endTime * 1000,
        is_final: !seg.isPartial,
        channel: seg.channel,
        language: seg.language || seg.detected_language || undefined,  // Don't default to 'en', let render handle it
        translation_status: undefined,  // ✅ FIX: Use undefined (not null) to match Soniox original tokens
        _isDbSegment: true, // Flag to identify database segments
        _originalSegment: seg, // Keep original for sentiment/metadata
      }));

    console.log('  Database tokens (converted from segments):', databaseTokens.length);

    // ✅ STEP 3: Stable-merge DB tokens by time into live tokens (preserve live adjacency)
    const allTokens = [];
    const seenKeys = new Set();
    let dbIdx = 0;
    const db = databaseTokens; // already sorted by startTime

    // Track last original token time so translations (no time) can anchor to it
    let lastOriginalStartMs = -Infinity;
    const getEffectiveTime = (t) => {
      if (t.start_ms != null) {
        lastOriginalStartMs = t.start_ms;
        return t.start_ms;
      }
      // For translated tokens (no timestamps), anchor to last original
      return lastOriginalStartMs;
    };

    const pushIfNew = (t) => {
      const key = `${t.speaker || '1'}-${t.start_ms}-${t.text}`;
      if (!seenKeys.has(key)) {
        allTokens.push(t);
        seenKeys.add(key);
      }
    };

    allLiveTokens.forEach((live) => {
      const liveTime = getEffectiveTime(live);
      while (dbIdx < db.length && db[dbIdx].start_ms <= liveTime) {
        pushIfNew(db[dbIdx]);
        dbIdx += 1;
      }
      pushIfNew(live);
    });

    // Append remaining DB tokens
    while (dbIdx < db.length) {
      pushIfNew(db[dbIdx]);
      dbIdx += 1;
    }

    console.log(
      `  Total tokens to render: ${allTokens.length} (${databaseTokens.length} DB + ${allLiveTokens.length} live)`,
    );

    // ✅ STEP 4: Group tokens into blocks by speaker (SONIOX PATTERN)
    const blocks = groupTokensIntoBlocks(allTokens, speakerIdentities);

    console.log(`  Grouped into ${blocks.length} speaker blocks`);

    // ✅ STEP 5: Render blocks as components
    const renderedBlocks = blocks
      .filter(
        (block) =>
          (agentTranscript === undefined || agentTranscript || block.channel !== 'AGENT') &&
          block.channel !== 'AGENT_VOICETONE' &&
          block.channel !== 'CALLER_VOICETONE' &&
          block.channel !== 'CHAT_ASSISTANT',
      )
      .map((block) => <TokenBlock key={block.id} block={block} onSpeakerClick={onSpeakerClick} />);

    // Add bottom padding element for auto-scroll
    renderedBlocks.push(<div key="bottom" ref={bottomRef} />);

    return renderedBlocks;
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
    agentTranscript,
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
  agentTranscript,
  collapseSentiment,
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
          agentTranscript={agentTranscript}
          collapseSentiment={collapseSentiment}
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
  collapseSentiment,
  speakerIdentities,
  onSpeakerClick,
}) => {
  const [autoScroll, setAutoScroll] = useState(item.recordingStatusLabel === IN_PROGRESS_STATUS);
  const [autoScrollDisabled, setAutoScrollDisabled] = useState(item.recordingStatusLabel !== IN_PROGRESS_STATUS);
  const [showDownloadTranscript, setShowDownloadTranscripts] = useState(item.recordingStatusLabel === DONE_STATUS);
  const [agentTranscript] = useState(true);

  useEffect(() => {
    setAutoScrollDisabled(item.recordingStatusLabel !== IN_PROGRESS_STATUS);
    setAutoScroll(item.recordingStatusLabel === IN_PROGRESS_STATUS);
    setShowDownloadTranscripts(item.recordingStatusLabel === DONE_STATUS);
  }, [item.recordingStatusLabel]);

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
                  {/* Translation temporarily disabled in Soniox pattern - can be re-added */}
                  {/* <Toggle onChange={({ detail }) => setTranslateOn(detail.checked)} checked={translateOn} /> */}
                  {/* <span>Enable Translation</span> */}
                  {/* {languageChoices()} */}
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
          agentTranscript,
          collapseSentiment,
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
  // const { currentCredentials } = useAppContext(); // Not needed without translation

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

  // Translation temporarily disabled in Soniox pattern
  // const translateClient = new GeminiTranslateClient({ maxAttempts: MAXIMUM_ATTEMPTS });

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
          collapseSentiment={collapseSentiment}
          speakerIdentities={speakerIdentities}
          onSpeakerClick={handleSpeakerClick}
        />
      </SpaceBetween>
    </>
  );
};

export default CallPanel;
