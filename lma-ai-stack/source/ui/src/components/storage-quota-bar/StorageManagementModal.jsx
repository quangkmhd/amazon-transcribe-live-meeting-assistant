/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Modal,
  Box,
  SpaceBetween,
  Table,
  Button,
  Header,
  Pagination,
  TextFilter,
  Select,
  Alert,
  StatusIndicator,
} from '@awsui/components-react';
import { getUserFiles, deleteFile, deleteMultipleFiles } from '../../utils/storage-quota';

const ITEMS_PER_PAGE = 10;

const StorageManagementModal = ({ visible, onDismiss, userEmail, onFilesDeleted }) => {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState({ value: 'all' });
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteSuccess, setDeleteSuccess] = useState(null);

  // Load files
  const loadFiles = async () => {
    console.log('[loadFiles] Starting...', { userEmail, categoryFilter: categoryFilter.value });
    setIsLoading(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const bucket = categoryFilter.value === 'all' ? null : categoryFilter.value;
      console.log('[loadFiles] Calling getUserFiles with bucket:', bucket);
      const fetchedFiles = await getUserFiles(userEmail, bucket);
      console.log('[loadFiles] Got files:', { count: fetchedFiles.length, files: fetchedFiles });
      setFiles(fetchedFiles);
    } catch (error) {
      console.error('[loadFiles] Error loading files:', error);
      setDeleteError('Failed to load files. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible && userEmail) {
      loadFiles();
    }
  }, [visible, userEmail, categoryFilter.value]); // Add dependencies

  // Filter files
  const filteredFiles = files.filter((file) => {
    const matchesText = file.name.toLowerCase().includes(filterText.toLowerCase());
    const matchesCategory = categoryFilter.value === 'all' || file.bucket === categoryFilter.value;
    return matchesText && matchesCategory;
  });

  // Paginate files
  const paginatedFiles = filteredFiles.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Delete selected files
  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedItems.length} file(s)? This action cannot be undone.`;
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const filesToDelete = selectedItems.map((item) => ({
        bucket: item.bucket,
        path: item.fullPath,
        meeting_id: item.meeting_id,
      }));
      const results = await deleteMultipleFiles(filesToDelete);

      if (results.failed.length > 0) {
        setDeleteError(
          `Failed to delete ${results.failed.length} file(s). Successfully deleted ${results.successful.length} file(s).`,
        );
      } else {
        setDeleteSuccess(`Successfully deleted ${results.successful.length} file(s).`);
      }

      // Refresh file list
      await loadFiles();
      setSelectedItems([]);

      // Notify parent to refresh quota
      if (onFilesDeleted) {
        onFilesDeleted();
      }
    } catch (error) {
      console.error('Error deleting files:', error);
      setDeleteError('Failed to delete files. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete single file
  const handleDeleteFile = async (file) => {
    const confirmMessage = `Are you sure you want to delete "${file.name}"? This action cannot be undone.`;
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      await deleteFile(file.bucket, file.fullPath, file.meeting_id);
      setDeleteSuccess(`Successfully deleted "${file.name}".`);

      // Refresh file list
      await loadFiles();

      // Notify parent to refresh quota
      if (onFilesDeleted) {
        onFilesDeleted();
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      setDeleteError(`Failed to delete "${file.name}". Please try again.`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getCategoryName = (bucket) => {
    if (bucket === 'meeting-recordings') return 'Meeting Recording';
    if (bucket === 'knowledge-documents') return 'Knowledge Document';
    return bucket;
  };

  const formatCreatedDate = (dateStr) => new Date(dateStr).toLocaleDateString();

  const renderCategoryCell = (item) => <Box>{getCategoryName(item.bucket)}</Box>;

  const renderDeleteButton = (item) => (
    <Button variant="link" iconName="remove" loading={isDeleting} onClick={() => handleDeleteFile(item)}>
      Delete
    </Button>
  );

  const columnDefinitions = [
    {
      id: 'name',
      header: 'File Name',
      cell: (item) => item.name,
      sortingField: 'name',
      width: 300,
    },
    {
      id: 'category',
      header: 'Category',
      cell: renderCategoryCell,
      sortingField: 'bucket',
    },
    {
      id: 'size',
      header: 'Size',
      cell: (item) => item.sizeFormatted,
      sortingField: 'metadata.size',
    },
    {
      id: 'created',
      header: 'Created',
      cell: (item) => formatCreatedDate(item.created_at),
      sortingField: 'created_at',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: renderDeleteButton,
      width: 100,
    },
  ];

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      size="large"
      header={<Header variant="h2">Manage Storage</Header>}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Close
            </Button>
            <Button
              variant="primary"
              iconName="remove"
              disabled={selectedItems.length === 0}
              loading={isDeleting}
              onClick={handleDeleteSelected}
            >
              Delete Selected ({selectedItems.length})
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        {/* Error/Success Messages */}
        {deleteError && (
          <Alert type="error" dismissible onDismiss={() => setDeleteError(null)}>
            {deleteError}
          </Alert>
        )}
        {deleteSuccess && (
          <Alert type="success" dismissible onDismiss={() => setDeleteSuccess(null)}>
            {deleteSuccess}
          </Alert>
        )}

        {/* Filters */}
        <SpaceBetween direction="horizontal" size="xs">
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder="Search files..."
            onChange={({ detail }) => {
              setFilterText(detail.filteringText);
              setCurrentPage(1);
            }}
          />
          <Select
            selectedOption={categoryFilter}
            onChange={({ detail }) => {
              setCategoryFilter(detail.selectedOption);
              setCurrentPage(1);
              loadFiles();
            }}
            options={[
              { value: 'all', label: 'All Categories' },
              { value: 'meeting-recordings', label: 'Meeting Recordings' },
              { value: 'knowledge-documents', label: 'Knowledge Documents' },
            ]}
            selectedAriaLabel="Selected category"
          />
          <Button iconName="refresh" loading={isLoading} onClick={loadFiles}>
            Refresh
          </Button>
        </SpaceBetween>

        {/* Files Table */}
        <Table
          columnDefinitions={columnDefinitions}
          items={paginatedFiles}
          loading={isLoading}
          loadingText="Loading files..."
          selectionType="multi"
          selectedItems={selectedItems}
          onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
          empty={
            <Box textAlign="center" color="inherit">
              <Box variant="p" color="inherit">
                <StatusIndicator type="success">No files found</StatusIndicator>
              </Box>
              <Box variant="p" color="text-body-secondary">
                You don&apos;t have any files in this category.
              </Box>
            </Box>
          }
          header={
            <Header
              counter={`(${filteredFiles.length})`}
              description="Select files to delete and free up storage space"
            >
              Files
            </Header>
          }
          pagination={
            <Pagination
              currentPageIndex={currentPage}
              pagesCount={Math.ceil(filteredFiles.length / ITEMS_PER_PAGE)}
              onChange={({ detail }) => setCurrentPage(detail.currentPageIndex)}
            />
          }
        />
      </SpaceBetween>
    </Modal>
  );
};

StorageManagementModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func.isRequired,
  userEmail: PropTypes.string.isRequired,
  onFilesDeleted: PropTypes.func.isRequired,
};

export default StorageManagementModal;
