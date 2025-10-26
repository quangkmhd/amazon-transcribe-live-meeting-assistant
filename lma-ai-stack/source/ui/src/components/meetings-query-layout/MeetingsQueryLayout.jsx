/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Spinner, Header, Container, SpaceBetween, Link, Tabs } from '@awsui/components-react';
import PropTypes from 'prop-types';
import { Logger } from 'aws-amplify';
import { CALLS_PATH } from '../../routes/constants';
import useSettingsContext from '../../contexts/settings';
import DocumentUpload from './DocumentUpload';
import ConversationHistory from './ConversationHistory';
import { searchRAG, uploadKnowledgeDocument } from '../../utils/rag-client';

const logger = new Logger('queryKnowledgeBase');

const ChatBubbleUser = ({ text }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
    <div
      style={{
        maxWidth: '80%',
        background: '#E6F2FF',
        color: '#0F1B2A',
        border: '1px solid #C7E1FF',
        borderRadius: '16px',
        padding: '10px 14px',
        margin: '6px 0',
        boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
      }}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  </div>
);

const ChatBubbleAssistant = ({ children }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
    <div
      style={{
        maxWidth: '80%',
        background: '#FFFFFF',
        color: '#0F1B2A',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: '10px 14px',
        margin: '6px 0',
        boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
      }}
    >
      {children}
    </div>
  </div>
);

ChatBubbleUser.propTypes = {
  text: PropTypes.string.isRequired,
};

ChatBubbleAssistant.propTypes = {
  children: PropTypes.node.isRequired,
};

const CustomLink = ({ href, children }) => {
  const handleClick = (e) => {
    e.preventDefault();
    // Handle the link click here
    console.log('Link clicked:', href);
    // You can add your custom navigation logic here
  };

  return (
    <Link href={`#${CALLS_PATH}/${href}`} onClick={handleClick}>
      {children}
    </Link>
  );
};
CustomLink.propTypes = {
  href: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export const MeetingsQueryLayout = () => {
  const [inputQuery, setInputQuery] = useState('');
  const [meetingKbQueries, setMeetingKbQueries] = useState([]);
  const [meetingKbQueryStatus, setMeetingKbQueryStatus] = useState(false);
  const [kbSessionId, setKbSessionId] = useState('');
  const [activeTabId, setActiveTabId] = useState('query');
  const { settings } = useSettingsContext();
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const textAreaRef = useRef(null);

  const getElementByIdAsync = (id) =>
    // eslint-disable-next-line
    new Promise((resolve) => {
      const getElement = () => {
        const element = document.getElementById(id);
        if (element) {
          resolve(element);
        } else {
          requestAnimationFrame(getElement);
        }
      };
      getElement();
    });

  const scrollToBottomOfChat = async () => {
    const chatDiv = await getElementByIdAsync('chatDiv');
    requestAnimationFrame(() => {
      chatDiv.scrollTo({
        top: chatDiv.scrollHeight + 200,
        behavior: 'smooth',
      });
    });
  };

  const getMeetingsQueryResponseFromKB = async (input, sessionId) => {
    try {
      // Use our RAG system instead of AppSync GraphQL
      logger.debug('Querying RAG knowledge base:', input);

      const result = await searchRAG(
        input,
        null, // meetingId - can be null for general queries
        true, // include documents
        true, // include transcripts
      );

      // Format response to match expected structure
      let markdown = '';

      if (result.context && result.context.trim()) {
        markdown = result.context;
      } else {
        markdown =
          'No relevant information found in the knowledge base.' +
          ' Please try rephrasing your question or upload relevant documents.';
      }

      // Add sources if available
      if (result.sources && result.sources.length > 0) {
        markdown += '\n\n**Sources:**\n';
        result.sources.forEach((source, idx) => {
          if (source.type === 'document') {
            markdown += `\n${idx + 1}. Document: ${source.document_id}`;
          } else if (source.type === 'transcript') {
            markdown += `\n${idx + 1}. Transcript: ${source.meeting_id} (${source.speaker})`;
          }
        });
      }

      return {
        data: {
          queryKnowledgeBase: JSON.stringify({
            markdown,
            sessionId: sessionId || `session-${Date.now()}`,
            hasContext: result.has_context || false,
          }),
        },
      };
    } catch (error) {
      console.error('RAG query error:', error);
      // Return error message in format expected by UI
      return {
        data: {
          queryKnowledgeBase: JSON.stringify({
            markdown: `Error querying knowledge base: ${error.message}\n\nPlease ensure:\n1. You're logged in\n2. Documents are uploaded\n3. API keys are configured`,
            sessionId: sessionId || 'error-session',
            hasContext: false,
          }),
        },
      };
    }
  };

  const submitQuery = (query) => {
    if (meetingKbQueryStatus === true) {
      return;
    }

    setMeetingKbQueryStatus(true);

    const responseData = {
      label: query,
      value: '...',
    };
    const currentQueries = meetingKbQueries.concat(responseData);
    setMeetingKbQueries(currentQueries);
    scrollToBottomOfChat();

    logger.debug('Submitting GraphQL query:', query);
    const queryResponse = getMeetingsQueryResponseFromKB(query, kbSessionId);

    queryResponse.then((r) => {
      const kbResponse = JSON.parse(r.data.queryKnowledgeBase);
      const kbanswer = kbResponse.markdown;
      setKbSessionId(kbResponse.sessionId);
      const queries = currentQueries.map((q) => {
        if (q.value !== '...') {
          return q;
        }
        return {
          label: q.label,
          value: kbanswer,
        };
      });
      setMeetingKbQueries(queries);
      scrollToBottomOfChat();
    });
    setMeetingKbQueryStatus(false);
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    // Upload pending attachments first
    if (pendingFiles.length > 0) {
      setIsUploading(true);
      setUploadMessage('Uploading attachments...');
      try {
        // eslint-disable-next-line no-restricted-syntax
        for (const pf of pendingFiles) {
          // eslint-disable-next-line no-await-in-loop
          await uploadKnowledgeDocument(pf.file);
        }
        setUploadMessage('Attachments uploaded.');
        setPendingFiles([]);
      } catch (err) {
        setUploadMessage(`Upload failed: ${err.message}`);
      } finally {
        setIsUploading(false);
      }
    }

    // Send query if any text
    if (inputQuery && inputQuery.trim().length > 0) {
      submitQuery(inputQuery);
      setInputQuery('');
    }

    return true;
  };

  const onPlusClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const previews = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            if (file.type && file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = () => resolve({ file, previewUrl: reader.result });
              reader.readAsDataURL(file);
            } else {
              resolve({ file, previewUrl: null });
            }
          }),
      ),
    );
    setPendingFiles((prev) => [...prev, ...previews]);
    if (fileInputRef.current) {
      // eslint-disable-next-line no-param-reassign
      fileInputRef.current.value = '';
    }
  };

  const handleInputChange = (e) => {
    setInputQuery(e.target.value);
    if (textAreaRef.current) {
      const maxHeight = 120; // limit expansion
      // Reset height to compute scrollHeight accurately
      // eslint-disable-next-line no-param-reassign
      textAreaRef.current.style.height = 'auto';
      // eslint-disable-next-line no-param-reassign
      textAreaRef.current.style.height = `${Math.min(
        textAreaRef.current.scrollHeight,
        maxHeight,
      )}px`;
    }
  };

  // eslint-disable-next-line
  const placeholder =
    settings.ShouldUseTranscriptKnowledgeBase === 'true'
      ? 'Enter a question to query your meeting transcripts knowledge base.'
      : 'Transcript Knowledge Base is set to DISABLED for this LMA deployment.';
  // eslint-disable-next-line
  const initialMsg =
    settings.ShouldUseTranscriptKnowledgeBase === 'true'
      ? 'Ask a question below.'
      : 'Meeting queries are not enabled. Transcript Knowledge Base is set to DISABLED for this LMA deployment.';

  const queryTab = (
    <Container
      fitHeight={false}
      header={<Header variant="h2">Query Knowledge Base</Header>}
      footer={
        <div>
          <form onSubmit={onSubmit}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '100%',
                  maxWidth: '900px',
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '18px',
                  padding: '10px 14px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                {/* Attachments row (top) */}
                {pendingFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', overflowX: 'auto' }}>
                    {pendingFiles.map((pf, idx) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '12px',
                          padding: '6px 10px',
                          background: '#FFFFFF',
                        }}
                      >
                        {pf.previewUrl ? (
                          <img
                            src={pf.previewUrl}
                            alt={pf.file.name}
                            style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: '#FEE2E2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#EF4444"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <line x1="3" y1="9" x2="21" y2="9" />
                            </svg>
                          </div>
                        )}
                        <div style={{ maxWidth: '260px' }}>
                          <div
                            style={{
                              fontSize: '13px',
                              color: '#111827',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {pf.file.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>
                            {(pf.file.type || '').split('/')[0] || 'FILE'}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input row (bottom) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Plus icon */}
                  <button
                    type="button"
                    aria-label="Add"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#111827',
                    }}
                    onClick={onPlusClick}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>

                  {/* Multiline textarea */}
                  <textarea
                    ref={textAreaRef}
                    placeholder={
                      settings.ShouldUseTranscriptKnowledgeBase === 'true' ? 'Ask anything' : `${placeholder}`
                    }
                    value={inputQuery}
                    onChange={handleInputChange}
                    rows={1}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '14px',
                      color: '#0F1B2A',
                      lineHeight: '20px',
                      resize: 'none',
                      minHeight: '24px',
                    }}
                  />

                  {/* Hidden file input for quick upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={onFilesChosen}
                    accept={['.pdf,.docx,.pptx,.xlsx,.txt,.md', 'audio/*,video/*,image/*'].join(',')}
                    style={{ display: 'none' }}
                  />

                  {/* Mic icon */}
                  <button
                    type="button"
                    aria-label="Voice input"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#111827',
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>

                  {/* Send icon inside circle */}
                  <button
                    type="submit"
                    aria-label="Send"
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      border: '1px solid #E5E7EB',
                      background:
                        inputQuery.trim().length > 0 || pendingFiles.length > 0 ? '#111827' : '#F3F4F6',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={
                        inputQuery.trim().length > 0 || pendingFiles.length > 0 ? '#FFFFFF' : '#111827'
                      }
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </form>
          {uploadMessage && (
            <div
              style={{
                textAlign: 'center',
                color: isUploading ? '#374151' : '#059669',
                fontSize: '12px',
                marginTop: '6px',
              }}
            >
              {uploadMessage}
            </div>
          )}
          <div style={{ textAlign: 'center', color: '#6B7280', fontSize: '12px', marginTop: '4px' }}>
            ChatGPT can make mistakes. Check important info.
          </div>
        </div>
      }
    >
      <div
        id="chatDiv"
        style={{
          overflow: 'hidden',
          overflowY: 'auto',
          height: '30em',
          scrollBehavior: 'smooth',
          willChange: 'scroll-position',
          WebkitOverflowScrolling: 'touch',
          background: '#FFFFFF',
          padding: '12px',
        }}
      >
        <SpaceBetween size="xs">
          {meetingKbQueries.length > 0 ? (
            meetingKbQueries.map((entry, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i}>
                <ChatBubbleUser text={entry.label} />
                {entry.value === '...' ? (
                  <div style={{ height: '30px', display: 'flex', alignItems: 'center' }}>
                    <Spinner />
                  </div>
                ) : (
                  <ChatBubbleAssistant>
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        callid: CustomLink,
                      }}
                    >
                      {entry.value}
                    </ReactMarkdown>
                  </ChatBubbleAssistant>
                )}
              </div>
            ))
          ) : (
            <ChatBubbleAssistant>
              <ReactMarkdown>{`${initialMsg}`}</ReactMarkdown>
            </ChatBubbleAssistant>
          )}
        </SpaceBetween>
      </div>
    </Container>
  );

  return (
    <Tabs
      activeTabId={activeTabId}
      onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
      tabs={[
        {
          id: 'query',
          label: 'Query Knowledge Base',
          content: queryTab,
        },
        {
          id: 'documents',
          label: 'Manage Documents',
          content: <DocumentUpload />,
        },
        {
          id: 'history',
          label: 'Conversation History',
          content: <ConversationHistory />,
        },
      ]}
    />
  );
};

export default MeetingsQueryLayout;
