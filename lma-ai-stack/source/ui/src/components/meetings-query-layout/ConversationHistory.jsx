/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */
import React, { useState, useEffect } from 'react';
import { Box, Button, Container, Header, SpaceBetween, Alert, ColumnLayout } from '@awsui/components-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { getConversations, clearConversations } from '../../utils/conversation-history';
import { supabase } from '../../utils/supabase-client';

const ConversationHistory = () => {
  const [conversations, setConversations] = useState([]);
  const [userId, setUserId] = useState('');

  const loadHistory = async () => {
    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userEmail = user?.email || 'anonymous';

      setUserId(userEmail);

      // Load from localStorage
      const history = getConversations(userEmail);
      setConversations(history);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all conversation history?')) {
      clearConversations(userId);
      setConversations([]);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const copyMessage = (content) => {
    navigator.clipboard.writeText(content).then(() => {
      alert('Copied to clipboard!');
    });
  };

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Your recent conversations with the Meeting Assistant"
          actions={
            <SpaceBetween direction="horizontal" size="s">
              <Button iconName="refresh" onClick={loadHistory}>
                Refresh
              </Button>
              <Button iconName="remove" onClick={handleClearHistory}>
                Clear All
              </Button>
            </SpaceBetween>
          }
        >
          Conversation History
        </Header>
      }
    >
      {conversations.length === 0 ? (
        <Box textAlign="center" padding="xxl">
          <Box variant="h3" color="text-status-inactive">
            No conversation history
          </Box>
          <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>
            Your chat conversations will appear here (last 20 messages)
          </Box>
        </Box>
      ) : (
        <SpaceBetween size="m">
          <Alert type="info">
            Showing {conversations.length} of last 20 messages. Older messages are automatically removed.
          </Alert>
          {conversations.map((msg, idx) => (
            <Box
              key={msg.id || idx}
              padding="m"
              style={{
                background: msg.role === 'user' ? '#f0f8ff' : '#f5f5f5',
                borderRadius: '8px',
              }}
            >
              <ColumnLayout columns={1}>
                <Box>
                  <SpaceBetween direction="horizontal" size="xs">
                    <Box variant="strong">{msg.role === 'user' ? '👤 You' : '🤖 Assistant'}</Box>
                    <Box variant="small" color="text-status-inactive">
                      {formatTimestamp(msg.timestamp)}
                    </Box>
                  </SpaceBetween>
                </Box>
                <Box>
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.content}</ReactMarkdown>
                </Box>
                <Box>
                  <Button variant="inline-link" iconName="copy" onClick={() => copyMessage(msg.content)}>
                    Copy
                  </Button>
                </Box>
              </ColumnLayout>
            </Box>
          ))}
        </SpaceBetween>
      )}
    </Container>
  );
};

export default ConversationHistory;
