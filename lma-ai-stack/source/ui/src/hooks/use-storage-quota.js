/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

/**
 * useStorageQuota Hook
 * React hook for managing user storage quota state with real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase-client';
import {
  getUserStorageUsage,
  refreshUserStorageUsage,
  needsRefresh,
  getStorageBreakdown,
} from '../utils/storage-quota';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Custom hook for managing storage quota
 * @param {string} userEmail - User email address
 * @param {Object} options - Hook options
 * @returns {Object} Storage quota state and methods
 */
export default function useStorageQuota(userEmail, options = {}) {
  const { autoRefresh = true, refreshInterval = AUTO_REFRESH_INTERVAL, enableRealtime = true } = options;

  const [usage, setUsage] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshTimerRef = useRef(null);
  const subscriptionRef = useRef(null);

  /**
   * Fetch storage breakdown
   */
  const fetchBreakdown = useCallback(async () => {
    if (!userEmail) return;

    try {
      const data = await getStorageBreakdown(userEmail);
      setBreakdown(data);
    } catch (err) {
      console.error('Error fetching storage breakdown:', err);
    }
  }, [userEmail]);

  /**
   * Refresh storage usage (recalculate)
   */
  const refreshUsage = useCallback(
    async (showLoading = true) => {
      if (!userEmail) return;

      try {
        if (showLoading) {
          setIsRefreshing(true);
        }
        setError(null);

        const data = await refreshUserStorageUsage(userEmail);
        setUsage(data);

        // Also refresh breakdown
        await fetchBreakdown();
      } catch (err) {
        console.error('Error refreshing storage usage:', err);
        setError(err.message);
      } finally {
        if (showLoading) {
          setIsRefreshing(false);
        }
      }
    },
    [userEmail, fetchBreakdown],
  );

  /**
   * Fetch storage usage data
   */
  const fetchUsage = useCallback(async () => {
    if (!userEmail) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await getUserStorageUsage(userEmail);
      setUsage(data);

      // Auto-refresh if data is stale (only on mount, not on every call)
      if (autoRefresh && needsRefresh(data.lastCalculatedAt)) {
        refreshUsage(false);
      }
    } catch (err) {
      console.error('Error fetching storage usage:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [userEmail, autoRefresh, refreshUsage]);

  /**
   * Setup real-time subscription
   */
  useEffect(() => {
    if (!userEmail || !enableRealtime) return undefined;

    const channel = supabase
      .channel(`storage-quota-${userEmail}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_storage_quota',
          filter: `user_email=eq.${userEmail}`,
        },
        (payload) => {
          console.log('Storage quota changed:', payload);

          if (payload.new) {
            const percentage = (payload.new.total_bytes / payload.new.quota_bytes) * 100;

            setUsage({
              userEmail: payload.new.user_email,
              storageFilesBytes: payload.new.storage_files_bytes || 0,
              databaseBytesEstimate: payload.new.database_bytes_estimate || 0,
              totalBytes: payload.new.total_bytes || 0,
              quotaBytes: payload.new.quota_bytes || 2147483648,
              lastCalculatedAt: payload.new.last_calculated_at,
              percentage,
              isOverQuota: payload.new.total_bytes >= payload.new.quota_bytes,
            });
          }
        },
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [userEmail, enableRealtime]);

  /**
   * Setup auto-refresh timer
   */
  useEffect(() => {
    if (!autoRefresh || !refreshInterval) return undefined;

    refreshTimerRef.current = setInterval(() => {
      if (usage && needsRefresh(usage.lastCalculatedAt)) {
        refreshUsage(false);
      }
    }, refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, usage, refreshUsage]);

  /**
   * Initial fetch on mount or when userEmail changes
   */
  useEffect(() => {
    fetchUsage();
    fetchBreakdown();
  }, [fetchUsage, fetchBreakdown]);

  return {
    usage,
    breakdown,
    isLoading,
    error,
    isRefreshing,
    refresh: refreshUsage,

    // Computed values for convenience
    isOverQuota: usage?.isOverQuota || false,
    percentage: usage?.percentage || 0,
    totalBytes: usage?.totalBytes || 0,
    quotaBytes: usage?.quotaBytes || 2147483648,
    availableBytes: (usage?.quotaBytes || 2147483648) - (usage?.totalBytes || 0),
  };
}
