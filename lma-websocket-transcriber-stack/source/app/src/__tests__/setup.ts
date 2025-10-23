/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { vi } from 'vitest';

// Set up test environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SONIOX_API_KEY = 'test-soniox-key';
process.env.LOCAL_TEMP_DIR = '/tmp/';
process.env.SHOULD_RECORD_CALL = 'true';
process.env.WS_LOG_LEVEL = 'error'; // Quiet logs during tests

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
});

