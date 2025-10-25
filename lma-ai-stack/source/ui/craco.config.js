/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */

/*
 * CRACO Configuration for LMA UI
 * 
 * This configuration overrides Create React App's webpack settings without ejecting.
 * Main purpose: Suppress benign ResizeObserver errors from React's error overlay.
 * 
 * ResizeObserver errors occur when real-time transcript updates happen rapidly,
 * causing the browser to be unable to deliver all resize notifications in a single frame.
 * This is harmless but clutters the UI with error overlays during live transcription.
 */

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    return {
      ...devServerConfig,
      client: {
        ...devServerConfig.client,
        overlay: {
          errors: true,
          warnings: false,
          // Filter out benign ResizeObserver errors from the error overlay
          runtimeErrors: (error) => {
            // Suppress ResizeObserver errors - they're benign and don't affect functionality
            if (
              error?.message === 'ResizeObserver loop completed with undelivered notifications.' ||
              error?.message === 'ResizeObserver loop limit exceeded' ||
              error?.message?.includes('ResizeObserver')
            ) {
              // Log to console for debugging but don't show in overlay
              console.warn('[SUPPRESSED] ResizeObserver error:', error.message);
              return false; // Don't show this error in the overlay
            }
            // Show all other errors normally
            return true;
          },
        },
      },
    };
  },
};

