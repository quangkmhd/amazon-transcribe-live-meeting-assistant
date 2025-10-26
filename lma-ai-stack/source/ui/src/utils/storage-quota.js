/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

/**
 * Storage Quota Utility
 * Handles user storage quota calculation, validation, and formatting
 */

import { supabase } from './supabase-client';

const QUOTA_BYTES = 2147483648; // 2GB in bytes
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get user's storage usage from database
 * @param {string} userEmail - User email address
 * @returns {Promise<Object>} Storage usage data
 */
export async function getUserStorageUsage(userEmail) {
  try {
    if (!userEmail) {
      throw new Error('User email is required');
    }

    const { data, error } = await supabase.from('user_storage_quota').select('*').eq('user_email', userEmail).single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error
      throw error;
    }

    // If no record exists, return default values
    if (!data) {
      return {
        userEmail,
        storageFilesBytes: 0,
        databaseBytesEstimate: 0,
        totalBytes: 0,
        quotaBytes: QUOTA_BYTES,
        lastCalculatedAt: null,
        percentage: 0,
        isOverQuota: false,
      };
    }

    const percentage = (data.total_bytes / data.quota_bytes) * 100;

    return {
      userEmail: data.user_email,
      storageFilesBytes: data.storage_files_bytes || 0,
      databaseBytesEstimate: data.database_bytes_estimate || 0,
      totalBytes: data.total_bytes || 0,
      quotaBytes: data.quota_bytes || QUOTA_BYTES,
      lastCalculatedAt: data.last_calculated_at,
      percentage,
      isOverQuota: data.total_bytes >= data.quota_bytes,
    };
  } catch (error) {
    console.error('Error fetching user storage usage:', error);
    throw error;
  }
}

/**
 * Refresh user's storage usage by recalculating
 * @param {string} userEmail - User email address
 * @returns {Promise<Object>} Updated storage usage data
 */
export async function refreshUserStorageUsage(userEmail) {
  try {
    if (!userEmail) {
      throw new Error('User email is required');
    }

    // Call the database function to recalculate storage
    const { error } = await supabase.rpc('calculate_user_storage', {
      p_user_email: userEmail,
    });

    if (error) {
      throw error;
    }

    // Fetch the updated record
    return await getUserStorageUsage(userEmail);
  } catch (error) {
    console.error('Error refreshing user storage usage:', error);
    throw error;
  }
}

/**
 * Check if user has enough quota available
 * @param {string} userEmail - User email address
 * @param {number} requiredBytes - Bytes needed for operation
 * @returns {Promise<Object>} Availability status
 */
export async function checkQuotaAvailable(userEmail, requiredBytes = 0) {
  try {
    const usage = await getUserStorageUsage(userEmail);
    const availableBytes = usage.quotaBytes - usage.totalBytes;
    const isAvailable = availableBytes >= requiredBytes;

    return {
      isAvailable,
      availableBytes,
      requiredBytes,
      currentUsage: usage.totalBytes,
      quota: usage.quotaBytes,
      wouldExceed: !isAvailable,
    };
  } catch (error) {
    console.error('Error checking quota availability:', error);
    // In case of error, allow the operation but log it
    return {
      isAvailable: true,
      availableBytes: QUOTA_BYTES,
      requiredBytes,
      currentUsage: 0,
      quota: QUOTA_BYTES,
      wouldExceed: false,
      error: error.message,
    };
  }
}

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0 || bytes === null || bytes === undefined) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Get detailed storage breakdown by category
 * @param {string} userEmail - User email address
 * @returns {Promise<Array>} Storage breakdown by category
 */
export async function getStorageBreakdown(userEmail) {
  try {
    if (!userEmail) {
      throw new Error('User email is required');
    }

    const { data, error } = await supabase.rpc('get_storage_breakdown', {
      p_user_email: userEmail,
    });

    if (error) {
      throw error;
    }

    return (
      data?.map((item) => ({
        category: item.category,
        fileCount: parseInt(item.file_count, 10) || 0,
        totalBytes: parseInt(item.total_bytes, 10) || 0,
        formatted: formatBytes(parseInt(item.total_bytes, 10) || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching storage breakdown:', error);
    return [];
  }
}

/**
 * Check if storage data needs refresh based on cache duration
 * @param {Date|string} lastCalculatedAt - Last calculation timestamp
 * @returns {boolean} True if refresh is needed
 */
export function needsRefresh(lastCalculatedAt) {
  if (!lastCalculatedAt) return true;

  const lastCalc = new Date(lastCalculatedAt);
  const now = new Date();
  const diff = now - lastCalc;

  return diff > CACHE_DURATION_MS;
}

/**
 * Get storage status color based on percentage
 * @param {number} percentage - Usage percentage
 * @returns {string} Color indicator
 */
export function getStorageStatusColor(percentage) {
  if (percentage >= 100) return 'error'; // Dark red
  if (percentage >= 90) return 'error'; // Red
  if (percentage >= 70) return 'warning'; // Yellow
  return 'success'; // Green
}

/**
 * Get user files from storage for management
 * @param {string} userEmail - User email address
 * @param {string} bucketId - Bucket ID (optional, null for all)
 * @returns {Promise<Array>} List of files
 */
export async function getUserFiles(userEmail, bucketId = null) {
  try {
    if (!userEmail) {
      throw new Error('User email is required');
    }

    console.log('[getUserFiles] Called with:', { userEmail, bucketId });
    const allFiles = [];

    // Get meeting recordings from meetings table
    if (!bucketId || bucketId === 'meeting-recordings') {
      console.log('[getUserFiles] Fetching meeting recordings from meetings table...');
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('meeting_id, recording_url, recording_size, started_at, ended_at')
        .eq('owner_email', userEmail)
        .not('recording_url', 'is', null)
        .order('started_at', { ascending: false });

      console.log('[getUserFiles] Meetings query result:', { count: meetings?.length, error: meetingsError });

      if (!meetingsError && meetings) {
        const meetingFiles = meetings.map((meeting) => {
          // Extract filename from URL
          const fileName = meeting.recording_url.split('/').pop().replace(/%20/g, ' ');

          return {
            name: fileName,
            bucket: 'meeting-recordings',
            fullPath: fileName,
            created_at: meeting.started_at,
            metadata: { size: meeting.recording_size },
            sizeFormatted: formatBytes(meeting.recording_size || 0),
            meeting_id: meeting.meeting_id,
            recording_url: meeting.recording_url,
          };
        });
        allFiles.push(...meetingFiles);
      }
    }

    // Get knowledge documents from storage (these use email prefix)
    if (!bucketId || bucketId === 'knowledge-documents') {
      const { data, error } = await supabase.storage.from('knowledge-documents').list(userEmail, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' },
      });

      if (!error && data) {
        const docFiles = data.map((file) => ({
          ...file,
          bucket: 'knowledge-documents',
          fullPath: `${userEmail}/${file.name}`,
          sizeFormatted: formatBytes(file.metadata?.size || 0),
        }));
        allFiles.push(...docFiles);
      }
    }

    // Sort by size (largest first)
    allFiles.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));

    return allFiles;
  } catch (error) {
    console.error('Error fetching user files:', error);
    throw error;
  }
}

/**
 * Delete a file from storage
 * @param {string} bucket - Bucket ID
 * @param {string} path - File path
 * @param {string} meetingId - Meeting ID (optional, for meeting recordings)
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteFile(bucket, path, meetingId = null) {
  try {
    // For meeting recordings, delete from storage and update meeting record
    if (bucket === 'meeting-recordings') {
      const { error: storageError } = await supabase.storage.from(bucket).remove([path]);

      if (storageError) {
        throw storageError;
      }

      // Update meeting record to remove recording info
      if (meetingId) {
        const { error: updateError } = await supabase
          .from('meetings')
          .update({
            recording_url: null,
            recording_size: null,
          })
          .eq('meeting_id', meetingId);

        if (updateError) {
          console.error('Error updating meeting record:', updateError);
        }
      }
    } else {
      // For knowledge documents, just delete from storage
      const { error } = await supabase.storage.from(bucket).remove([path]);

      if (error) {
        throw error;
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

/**
 * Delete multiple files from storage
 * @param {Array} files - Array of {bucket, path} objects
 * @returns {Promise<Object>} Deletion results
 */
export async function deleteMultipleFiles(files) {
  try {
    const deletePromises = files.map(async (file) => {
      try {
        await deleteFile(file.bucket, file.path, file.meeting_id);
        return { ...file, success: true, failed: false };
      } catch (error) {
        return { ...file, success: false, failed: true, error: error.message };
      }
    });

    const results = await Promise.all(deletePromises);

    return {
      successful: results.filter((r) => r.success),
      failed: results.filter((r) => r.failed),
      totalProcessed: files.length,
    };
  } catch (error) {
    console.error('Error deleting multiple files:', error);
    throw error;
  }
}
