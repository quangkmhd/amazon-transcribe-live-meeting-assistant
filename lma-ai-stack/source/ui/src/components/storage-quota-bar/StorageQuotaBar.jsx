/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

import React, { useState } from 'react';
import { Box, Popover, StatusIndicator, Button, SpaceBetween } from '@awsui/components-react';
import useAppContext from '../../contexts/app';
import useStorageQuota from '../../hooks/use-storage-quota';
import { formatBytes, getStorageStatusColor } from '../../utils/storage-quota';
import StorageManagementModal from './StorageManagementModal';
import './styles.css';

const StorageQuotaBar = () => {
  const { user } = useAppContext();
  const userEmail = user?.attributes?.email || user?.email;

  const { usage, breakdown, isLoading, isRefreshing, refresh, isOverQuota, percentage } = useStorageQuota(userEmail);

  const [showManagementModal, setShowManagementModal] = useState(false);

  if (!userEmail || isLoading) {
    return null;
  }

  const statusColor = getStorageStatusColor(percentage);
  let barColorClass = 'sq-error';
  if (statusColor === 'success') {
    barColorClass = 'sq-safe';
  } else if (statusColor === 'warning') {
    barColorClass = 'sq-warn';
  }
  const usedFormatted = formatBytes(usage?.totalBytes || 0);
  const quotaFormatted = formatBytes(usage?.quotaBytes || 2147483648);
  const progressPct = Math.min(percentage, 100);

  const handleBarClick = () => {
    setShowManagementModal(true);
  };

  const handleRefresh = async (e) => {
    e.stopPropagation();
    await refresh();
  };

  return (
    <>
      <Box padding={{ top: 's', horizontal: 's', bottom: 's' }} className="storage-quota-container">
        <SpaceBetween size="xs">
          {/* Storage Label with Info */}
          <Box>
            <div className="sq-row">
              <Box fontSize="body-s" color="text-body-secondary">
                Storage
              </Box>
              <Popover
                dismissButton={false}
                position="top"
                size="medium"
                triggerType="custom"
                content={
                  <SpaceBetween size="xs">
                    <Box variant="p">
                      <strong>Storage Breakdown:</strong>
                    </Box>
                    {breakdown.map((item) => (
                      <Box key={item.category} fontSize="body-s">
                        <SpaceBetween direction="horizontal" size="xs">
                          <Box>
                            {item.category === 'meeting-recordings' && 'Meeting Recordings'}
                            {item.category === 'knowledge-documents' && 'Knowledge Documents'}
                            {item.category === 'database' && 'Database Records'}:
                          </Box>
                          <Box color="text-body-secondary">
                            {item.formatted} ({item.fileCount} items)
                          </Box>
                        </SpaceBetween>
                      </Box>
                    ))}
                    <Box fontSize="body-s" paddingTop="s">
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="link" iconName="refresh" loading={isRefreshing} onClick={handleRefresh}>
                          Refresh
                        </Button>
                      </SpaceBetween>
                    </Box>
                  </SpaceBetween>
                }
              >
                <Button variant="icon" iconName="status-info" />
              </Popover>
            </div>
          </Box>

          {/* Progress Bar */}
          <div
            onClick={handleBarClick}
            onKeyDown={(e) => e.key === 'Enter' && handleBarClick()}
            role="button"
            tabIndex={0}
            className="storage-quota-bar-clickable"
            aria-label={`Storage used ${usedFormatted} of ${quotaFormatted}`}
          >
            <div className="sq-bar" aria-hidden="true">
              <div className={`sq-bar-fill ${barColorClass}`} style={{ width: `${progressPct}%` }} />
            </div>
            <Box fontSize="body-s" color="text-body-secondary">
              {usedFormatted} of {quotaFormatted} used
            </Box>
            {isOverQuota && (
              <StatusIndicator type="error" className="storage-quota-pulse">
                Quota exceeded
              </StatusIndicator>
            )}
          </div>

          {/* Manage Storage Link */}
          <Box textAlign="center">
            <Button variant="link" fontSize="body-s" onClick={handleBarClick} iconName="external" iconAlign="right">
              Manage storage
            </Button>
          </Box>

          {/* Warning Message if Over Quota */}
          {isOverQuota && (
            <Box>
              <StatusIndicator type="error">
                <Box fontSize="body-s">Storage full. Delete files to continue.</Box>
              </StatusIndicator>
            </Box>
          )}
        </SpaceBetween>
      </Box>

      {/* Storage Management Modal */}
      {showManagementModal && (
        <StorageManagementModal
          visible={showManagementModal}
          onDismiss={() => setShowManagementModal(false)}
          userEmail={userEmail}
          onFilesDeleted={refresh}
        />
      )}
    </>
  );
};

export default StorageQuotaBar;
