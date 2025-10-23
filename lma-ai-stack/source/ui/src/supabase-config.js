/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */

const { REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY } = process.env;

const supabaseConfig = {
  url: REACT_APP_SUPABASE_URL,
  anonKey: REACT_APP_SUPABASE_ANON_KEY,
};

export default supabaseConfig;
