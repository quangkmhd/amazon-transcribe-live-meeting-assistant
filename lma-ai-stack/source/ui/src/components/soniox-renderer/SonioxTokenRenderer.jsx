/**
 * Soniox Token Renderer Component
 * Displays real-time transcription tokens with speaker labels, language badges, and timestamps
 * Reference: /soniox_examples/speech_to_text/apps/soniox-live-demo/react/src/renderers/renderer.tsx
 */
import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Box } from '@awsui/components-react';
import { getSpeakerColor } from '../../utils/speaker-colors';

/**
 * Format milliseconds to mm:ss
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time string
 */
function formatTime(ms) {
  if (!ms) return '00:00';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Group tokens by speaker - merging consecutive same-speaker segments
 * Reference: soniox_examples/speech_to_text/nodejs/soniox_realtime.js lines 109-142
 * @param {Array} tokens - Array of Soniox tokens
 * @returns {Array} Array of speaker blocks
 */
function groupBySpeaker(tokens) {
  const blocks = [];
  let currentSpeaker = null;
  let currentBlock = null;

  tokens.forEach((token) => {
    const speaker = token.speaker || '1';

    // Only create new block when speaker CHANGES (not just different timestamps)
    if (speaker !== currentSpeaker) {
      // Speaker changed, create new block
      currentSpeaker = speaker;
      currentBlock = {
        speaker,
        tokens: [token],
        startTime: token.start_ms,
        endTime: token.end_ms,
      };
      blocks.push(currentBlock);
    } else {
      // Same speaker, append to current block
      currentBlock.tokens.push(token);
      if (token.end_ms) {
        currentBlock.endTime = token.end_ms;
      }
    }
  });

  return blocks;
}

/**
 * Render inline text - supports both one_way and two_way translation modes
 * Reference: soniox_examples/speech_to_text/apps/soniox-live-demo/react/src/renderers/
 */
function renderInlineText(tokens, translationMode) {
  if (!tokens || tokens.length === 0) return null;

  const parts = [];

  // TWO-WAY TRANSLATION MODE: Group by language and display with language codes
  // Example: vi Hello, tôi tên là quang
  //          en Hello, my name is Quang
  if (translationMode && translationMode.type === 'two_way') {
    // Group tokens by language
    const languageGroups = new Map();

    tokens.forEach((token) => {
      const { text, language } = token;

      // Skip empty tokens and special markers like <end>
      if (!text || text === '<end>') return;

      if (!languageGroups.has(language)) {
        languageGroups.set(language, []);
      }
      languageGroups.get(language).push(token);
    });

    // Render each language group on separate line
    let isFirstLanguage = true;
    languageGroups.forEach((langTokens, language) => {
      // Add line break between languages (except for first)
      if (!isFirstLanguage) {
        parts.push(<br key={`break-${language}`} />);
      }
      isFirstLanguage = false;

      // Language code label (bold)
      parts.push(
        <Box key={`lang-${language}`} display="inline" style={{ fontWeight: 'bold', marginRight: '4px' }}>
          {language}
        </Box>,
      );

      // Render tokens for this language
      langTokens.forEach((token) => {
        const textColor = token.is_final ? '#111827' : '#6B7280';
        const tokenKey = `${language}-${token.start_ms || 0}-${token.text?.substring(0, 10) || ''}`;
        parts.push(
          <span key={tokenKey} style={{ color: textColor }}>
            {token.text}
          </span>,
        );
      });
    });
  }
  // ONE-WAY TRANSLATION MODE: Group by translation_status (original vs translation)
  else {
    const originalTokens = [];
    const translationTokens = [];

    tokens.forEach((token) => {
      const { text, translation_status: translationStatus } = token;

      // Skip empty tokens and special markers like <end>
      if (!text || text === '<end>') return;

      if (translationStatus === 'translation') {
        translationTokens.push(token);
      } else {
        // 'original' or 'none' - always treat as original
        originalTokens.push(token);
      }
    });

    // Render original tokens with label
    if (originalTokens.length > 0) {
      parts.push(
        <Box key="original-label" display="inline" style={{ fontWeight: 'bold', marginRight: '8px' }}>
          original
        </Box>,
      );

      originalTokens.forEach((token) => {
        const textColor = token.is_final ? '#111827' : '#6B7280';
        const tokenKey = `original-${token.start_ms || 0}-${token.text?.substring(0, 10) || ''}`;
        parts.push(
          <span key={tokenKey} style={{ color: textColor }}>
            {token.text}
          </span>,
        );
      });
    }

    // Render translation tokens with label on new line
    if (translationTokens.length > 0) {
      parts.push(<br key="translation-break" />);
      parts.push(
        <Box key="translation-label" display="inline" style={{ fontWeight: 'bold', marginRight: '8px' }}>
          Translation
        </Box>,
      );

      translationTokens.forEach((token) => {
        const textColor = token.is_final ? '#111827' : '#6B7280';
        const tokenKey = `translation-${token.start_ms || 0}-${token.text?.substring(0, 10) || ''}`;
        parts.push(
          <span key={tokenKey} style={{ color: textColor }}>
            {token.text}
          </span>,
        );
      });
    }
  }

  return <Box style={{ lineHeight: '1.6' }}>{parts}</Box>;
}

/**
 * Main Soniox Token Renderer Component
 */
// eslint-disable-next-line no-unused-vars
const SonioxTokenRenderer = ({ tokens, translationMode, autoScroll = false }) => {
  const containerRef = useRef(null);

  // Auto-scroll to bottom when new tokens arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [tokens, autoScroll]);

  // Group tokens by speaker
  const speakerBlocks = groupBySpeaker(tokens);

  // Filter out blocks that have no displayable content
  // (all tokens are special markers like <end> or empty strings)
  const displayableBlocks = speakerBlocks.filter((block) => {
    return block.tokens.some((token) => {
      const { text } = token;
      // Keep block if it has at least one token with real text
      return text && text !== '<end>';
    });
  });

  return (
    <div
      ref={containerRef}
      style={{
        maxHeight: '500px',
        overflowY: 'auto',
        padding: '16px',
        backgroundColor: '#fafafa',
        borderRadius: '8px',
      }}
    >
      {displayableBlocks.length === 0 ? (
        <Box textAlign="center" color="text-body-secondary" padding="xl">
          Waiting for transcription...
        </Box>
      ) : (
        displayableBlocks.map((block) => {
          const speakerColor = getSpeakerColor(block.speaker);
          const blockKey = `${block.speaker}-${block.endTime}-${block.tokens.length}`;

          return (
            <Box key={blockKey} margin={{ bottom: 'm' }}>
              {/* Speaker Header with Timestamp */}
              <Box margin={{ bottom: 'xs' }}>
                <strong style={{ color: speakerColor, fontSize: '14px' }}>
                  Speaker {block.speaker} ({formatTime(block.endTime)}):
                </strong>
              </Box>

              {/* Inline Text with Language Tags */}
              {renderInlineText(block.tokens, translationMode)}
            </Box>
          );
        })
      )}
    </div>
  );
};

SonioxTokenRenderer.propTypes = {
  tokens: PropTypes.arrayOf(
    PropTypes.shape({
      speaker: PropTypes.string,
      text: PropTypes.string,
      language: PropTypes.string,
      is_final: PropTypes.bool,
      end_ms: PropTypes.number,
      translation_status: PropTypes.string,
    }),
  ).isRequired,
  translationMode: PropTypes.shape({
    type: PropTypes.oneOf(['none', 'one_way', 'two_way']),
    language_a: PropTypes.string,
    language_b: PropTypes.string,
    target_language: PropTypes.string,
  }),
  autoScroll: PropTypes.bool,
};

SonioxTokenRenderer.defaultProps = {
  translationMode: { type: 'none' },
  autoScroll: false,
};

export default SonioxTokenRenderer;
