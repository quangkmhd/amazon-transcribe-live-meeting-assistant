/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';

import App from './App';

// Suppress XState warning from AWS Amplify UI library (third-party dependency)
// The warning is about predictableActionArguments configuration in @aws-amplify/ui-react
// This is a known issue with older versions of AWS Amplify UI components
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('predictableActionArguments') &&
    args[0].includes('createMachine')
  ) {
    // Suppress this specific warning from XState/AWS Amplify UI
    return;
  }
  originalWarn.apply(console, args);
};

// Suppress benign ResizeObserver errors
// This occurs when ResizeObserver can't deliver all notifications in a single frame
// Common with auto-scrolling transcripts and frequent WebSocket updates
// Does not affect functionality - it's a known browser/React quirk
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('ResizeObserver loop completed with undelivered notifications')) {
    // Suppress this benign error
    return;
  }
  originalError.apply(console, args);
};

// Suppress ResizeObserver errors at the window level (uncaught runtime errors)
// These bubble up from the ResizeObserver API when many DOM updates happen rapidly
window.addEventListener('error', (e) => {
  if (
    e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
    e.message === 'ResizeObserver loop limit exceeded'
  ) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  }
  return true;
});

// Also suppress unhandled promise rejections related to ResizeObserver
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && typeof e.reason === 'string' && e.reason.includes('ResizeObserver')) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root'),
);
