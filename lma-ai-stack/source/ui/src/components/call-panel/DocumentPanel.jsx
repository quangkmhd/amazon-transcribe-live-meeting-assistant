/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */
import React, { useState } from 'react';
import { Box, Button, Container, Header, SpaceBetween, Alert, StatusIndicator, Icon } from '@awsui/components-react';
import { uploadKnowledgeDocument, listKnowledgeDocuments } from '../../utils/rag-client';

/**
 * Compact Document Panel for Call Streaming Page
 * Shows document count and provides quick upload functionality
 */
const DocumentPanel = () => {
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const loadDocuments = async () => {
    try {
      const docs = await listKnowledgeDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
    }
  };

  // Load documents on mount
  React.useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md'];
    const ext = `.${file.name.split('.').pop().toLowerCase()}`;

    if (!validTypes.includes(ext)) {
      setError(`Unsupported file type: ${ext}`);
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      setError('File too large (max 50MB)');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await uploadKnowledgeDocument(file);
      setShowSuccess(true);
      await loadDocuments();

      // Reset success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const getDocumentStats = () => {
    const total = documents.length;
    const processing = documents.filter((d) => d.processingStatus === 'processing').length;
    const completed = documents.filter((d) => d.processingStatus === 'completed').length;
    const failed = documents.filter((d) => d.processingStatus === 'failed').length;

    return { total, processing, completed, failed };
  };

  const stats = getDocumentStats();

  return (
    <Container
      header={
        <Header variant="h4" info={<Box variant="small">Knowledge base for context-aware responses</Box>}>
          Knowledge Documents
        </Header>
      }
    >
      <SpaceBetween size="s">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {showSuccess && <Alert type="success">Document uploaded successfully!</Alert>}

        {/* Document Stats */}
        <Box>
          <SpaceBetween direction="horizontal" size="xs">
            <Box>
              <Icon name="file" /> {stats.total} document{stats.total !== 1 ? 's' : ''}
            </Box>
            {stats.processing > 0 && (
              <StatusIndicator type="in-progress">{stats.processing} processing</StatusIndicator>
            )}
            {stats.completed > 0 && <StatusIndicator type="success">{stats.completed} ready</StatusIndicator>}
            {stats.failed > 0 && <StatusIndicator type="error">{stats.failed} failed</StatusIndicator>}
          </SpaceBetween>
        </Box>

        {/* Quick Upload Button */}
        <Box>
          <label htmlFor="document-quick-upload">
            <Button iconName="upload" loading={isUploading} disabled={isUploading} fullWidth>
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </Button>
            <input
              id="document-quick-upload"
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.txt,.md"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </Box>

        <Box variant="small" color="text-body-secondary">
          Supported: PDF, DOCX, PPTX, XLSX, TXT, MD
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default DocumentPanel;
