/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  Alert,
  ProgressBar,
  Table,
  Icon,
  StatusIndicator,
} from '@awsui/components-react';
import { uploadKnowledgeDocument, listKnowledgeDocuments, deleteKnowledgeDocument } from '../../utils/rag-client';

// Enhanced file type support - integrated from RAGFlow
const SUPPORTED_FILE_TYPES = [
  // Documents
  { ext: 'pdf', mime: 'application/pdf', label: 'PDF', category: 'Documents' },
  {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
    category: 'Documents',
  },
  {
    ext: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint',
    category: 'Documents',
  },
  {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
    category: 'Documents',
  },
  // Text formats
  { ext: 'txt', mime: 'text/plain', label: 'Text', category: 'Text' },
  { ext: 'md', mime: 'text/markdown', label: 'Markdown', category: 'Text' },
  { ext: 'markdown', mime: 'text/markdown', label: 'Markdown', category: 'Text' },
  // Structured data
  { ext: 'html', mime: 'text/html', label: 'HTML', category: 'Web' },
  { ext: 'htm', mime: 'text/html', label: 'HTML', category: 'Web' },
  { ext: 'json', mime: 'application/json', label: 'JSON', category: 'Data' },
  { ext: 'jsonl', mime: 'application/jsonlines', label: 'JSON Lines', category: 'Data' },
  { ext: 'csv', mime: 'text/csv', label: 'CSV', category: 'Data' },
  // Code files
  { ext: 'py', mime: 'text/x-python', label: 'Python', category: 'Code' },
  { ext: 'js', mime: 'text/javascript', label: 'JavaScript', category: 'Code' },
  { ext: 'ts', mime: 'text/typescript', label: 'TypeScript', category: 'Code' },
  { ext: 'java', mime: 'text/x-java', label: 'Java', category: 'Code' },
  { ext: 'cpp', mime: 'text/x-c++', label: 'C++', category: 'Code' },
  { ext: 'go', mime: 'text/x-go', label: 'Go', category: 'Code' },
  { ext: 'rs', mime: 'text/x-rust', label: 'Rust', category: 'Code' },
  { ext: 'php', mime: 'text/x-php', label: 'PHP', category: 'Code' },
  { ext: 'sh', mime: 'text/x-sh', label: 'Shell', category: 'Code' },
  { ext: 'sql', mime: 'text/x-sql', label: 'SQL', category: 'Code' },
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Get accept string for file input
const getAcceptString = () => {
  return SUPPORTED_FILE_TYPES.map((t) => `.${t.ext}`).join(',');
};

// Delete button cell renderer
const DeleteActionCell = ({ item, onDelete }) => (
  <Button variant="icon" iconName="remove" ariaLabel="Delete" onClick={() => onDelete(item.documentId)} />
);

DeleteActionCell.propTypes = {
  item: PropTypes.shape({
    documentId: PropTypes.string.isRequired,
  }).isRequired,
  onDelete: PropTypes.func.isRequired,
};

const DocumentUpload = () => {
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const loadDocuments = async () => {
    try {
      const docs = await listKnowledgeDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError('Failed to load documents');
    }
  };

  const handleFiles = (files) => {
    if (!files || files.length === 0) {
      return;
    }

    const fileArray = Array.from(files);

    // Validate files
    const validFiles = [];
    const errors = [];

    fileArray.forEach((file) => {
      // Safety check: file name exists
      if (!file.name) {
        errors.push('Invalid file: no filename');
        return;
      }

      const ext = file.name.split('.').pop().toLowerCase();
      const supportedType = SUPPORTED_FILE_TYPES.find((type) => type.ext === ext);

      if (!supportedType) {
        errors.push(`${file.name}: Unsupported file type`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 50MB)`);
        return;
      }

      // Safety check: file has content
      if (file.size === 0) {
        errors.push(`${file.name}: Empty file`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      setError(errors.join('; '));
    }

    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      setError(null);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleClickUploadArea = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Load documents on mount
  React.useEffect(() => {
    loadDocuments();
  }, []);

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    const results = [];
    const errors = [];

    try {
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < selectedFiles.length; i += 1) {
        const file = selectedFiles[i];
        const baseProgress = (i / selectedFiles.length) * 100;
        const fileProgress = (1 / selectedFiles.length) * 100;

        setUploadProgress(baseProgress);

        try {
          console.log(`Processing ${file.name}...`);

          // eslint-disable-next-line no-await-in-loop
          const result = await uploadKnowledgeDocument(file);

          results.push({
            fileName: file.name,
            success: true,
            chunks: result.chunks,
            processingTime: result.processing_time_ms,
          });

          setUploadProgress(baseProgress + fileProgress);
        } catch (fileError) {
          console.error(`Error processing ${file.name}:`, fileError);
          errors.push({
            fileName: file.name,
            error: fileError.message,
          });
        }
      }

      // Reload documents list
      await loadDocuments();

      // Show results
      if (results.length > 0) {
        console.log('Successfully processed:', results);
      }

      if (errors.length > 0) {
        const errorMsg = errors.map((e) => `${e.fileName}: ${e.error}`).join('\n');
        setError(`Some files failed to process:\n${errorMsg}`);
      }

      setSelectedFiles([]);
      setUploadProgress(100);

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        if (errors.length === 0) {
          setError(null);
        }
      }, 2000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(`Upload failed: ${err.message}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = useCallback(async (documentId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await deleteKnowledgeDocument(documentId);
      await loadDocuments();
    } catch (err) {
      console.error('Delete error:', err);
      setError(`Delete failed: ${err.message}`);
    }
  }, []);

  const getStatusIndicator = (status) => {
    switch (status) {
      case 'completed':
        return <StatusIndicator type="success">Processed</StatusIndicator>;
      case 'processing':
        return <StatusIndicator type="in-progress">Processing</StatusIndicator>;
      case 'failed':
        return <StatusIndicator type="error">Failed</StatusIndicator>;
      default:
        return <StatusIndicator type="pending">Pending</StatusIndicator>;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString();

  const columnDefinitions = useMemo(
    () => [
      {
        id: 'fileName',
        header: 'File Name',
        cell: (item) => item.fileName,
        sortingField: 'fileName',
      },
      {
        id: 'fileType',
        header: 'Type',
        cell: (item) => item.fileType.toUpperCase(),
        width: 80,
      },
      {
        id: 'fileSize',
        header: 'Size',
        cell: (item) => formatFileSize(item.fileSize),
        width: 100,
      },
      {
        id: 'chunkCount',
        header: 'Chunks',
        cell: (item) => item.chunkCount,
        width: 80,
      },
      {
        id: 'status',
        header: 'Status',
        cell: (item) => getStatusIndicator(item.processingStatus),
        width: 120,
      },
      {
        id: 'uploadDate',
        header: 'Uploaded',
        cell: (item) => formatDate(item.uploadDate),
        width: 180,
      },
      {
        id: 'actions',
        header: 'Actions',
        // eslint-disable-next-line react/no-unstable-nested-components
        cell: (item) => <DeleteActionCell item={item} onDelete={handleDelete} />,
        width: 80,
      },
    ],
    [handleDelete],
  );

  return (
    <Container
      header={
        <Header
          variant="h2"
          description={
            "Upload documents to enhance the chatbot's knowledge base. " +
            'Files are processed immediately and automatically deleted after chunking.'
          }
        >
          Knowledge Base Documents
        </Header>
      }
    >
      <SpaceBetween size="l">
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Upload Area */}
        <Box>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleClickUploadArea}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClickUploadArea();
              }
            }}
            style={{
              border: dragActive ? '2px dashed #0972d3' : '2px dashed #d1d5db',
              borderRadius: '8px',
              padding: '40px',
              textAlign: 'center',
              backgroundColor: dragActive ? '#f0f8ff' : '#fafafa',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            <Icon name="upload" size="big" />
            <Box variant="h3" padding={{ top: 's' }}>
              Drag and drop files here
            </Box>
            <input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              multiple
              accept={getAcceptString()}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <Box variant="small" color="text-body-secondary" padding={{ top: 's' }}>
              <strong>Supported formats (max 50MB each):</strong>
              <br />
              📄 Documents: PDF, DOCX, PPTX, XLSX
              <br />
              📝 Text: TXT, MD, HTML
              <br />
              📊 Data: JSON, JSONL, CSV
              <br />
              💻 Code: Python, JavaScript, TypeScript, Java, C++, Go, Rust, PHP, Shell, SQL
              <br />
              <em>✨ NEW: Automatically extracts embedded files from DOCX/XLSX!</em>
            </Box>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <Box padding={{ top: 'm' }}>
              <SpaceBetween size="s">
                <Box variant="h4">Selected Files ({selectedFiles.length})</Box>
                {selectedFiles.map((file) => (
                  <Box key={file.name}>
                    <Icon name="file" /> {file.name} ({formatFileSize(file.size)})
                  </Box>
                ))}
                <Button variant="primary" onClick={uploadFiles} disabled={isUploading} loading={isUploading}>
                  Upload {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
                </Button>
              </SpaceBetween>
            </Box>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <Box padding={{ top: 'm' }}>
              <ProgressBar
                value={uploadProgress}
                label="Processing documents..."
                description="Parsing → Chunking → Generating embeddings → Saving to database → Deleting files"
              />
            </Box>
          )}
        </Box>

        {/* Documents Table */}
        <Table
          columnDefinitions={columnDefinitions}
          items={documents}
          loadingText="Loading documents"
          empty={
            <Box textAlign="center" color="inherit">
              <Box variant="strong">No documents</Box>
              <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                Upload documents to get started
              </Box>
            </Box>
          }
          header={
            <Header
              counter={`(${documents.length})`}
              actions={
                <Button iconName="refresh" onClick={loadDocuments}>
                  Refresh
                </Button>
              }
            >
              Uploaded Documents
            </Header>
          }
        />
      </SpaceBetween>
    </Container>
  );
};

export default DocumentUpload;
