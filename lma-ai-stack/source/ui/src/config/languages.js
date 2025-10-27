/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */

/**
 * Soniox Supported Languages for Real-time Translation
 * Source: https://soniox.com/docs/speech-to-text/api-reference/models/get_models
 */

// AWS UI Components React Select requires {label, value} format
export const TRANSLATION_LANGUAGES = [
  { label: '🚫 No Translation', value: 'none' },
  { label: '🇻🇳 Vietnamese - Tiếng Việt', value: 'vi' },
  { label: '🇺🇸 English', value: 'en' },
  { label: '🇪🇸 Spanish - Español', value: 'es' },
  { label: '🇫🇷 French - Français', value: 'fr' },
  { label: '🇩🇪 German - Deutsch', value: 'de' },
  { label: '🇯🇵 Japanese - 日本語', value: 'ja' },
  { label: '🇰🇷 Korean - 한국어', value: 'ko' },
  { label: '🇨🇳 Chinese - 中文', value: 'zh' },
  { label: '🇮🇳 Hindi - हिन्दी', value: 'hi' },
  { label: '🇸🇦 Arabic - العربية', value: 'ar' },
  { label: '🇵🇹 Portuguese - Português', value: 'pt' },
  { label: '🇷🇺 Russian - Русский', value: 'ru' },
  { label: '🇮🇹 Italian - Italiano', value: 'it' },
  { label: '🇳🇱 Dutch - Nederlands', value: 'nl' },
  { label: '🇵🇱 Polish - Polski', value: 'pl' },
  { label: '🇹🇷 Turkish - Türkçe', value: 'tr' },
  { label: '🇸🇪 Swedish - Svenska', value: 'sv' },
  { label: '🇹🇭 Thai - ไทย', value: 'th' },
  { label: '🇬🇷 Greek - Ελληνικά', value: 'el' },
  { label: '🇮🇱 Hebrew - עברית', value: 'he' },
  { label: '🇮🇷 Persian - فارسی', value: 'fa' },
  { label: '🇵🇭 Tagalog', value: 'tl' },
  { label: 'Afrikaans', value: 'af' },
  { label: 'Albanian', value: 'sq' },
  { label: 'Azerbaijani', value: 'az' },
  { label: 'Basque', value: 'eu' },
  { label: 'Belarusian', value: 'be' },
  { label: 'Bengali', value: 'bn' },
  { label: 'Bosnian', value: 'bs' },
  { label: 'Bulgarian', value: 'bg' },
  { label: 'Catalan', value: 'ca' },
  { label: 'Croatian', value: 'hr' },
  { label: 'Czech', value: 'cs' },
  { label: 'Danish', value: 'da' },
  { label: 'Estonian', value: 'et' },
  { label: 'Finnish', value: 'fi' },
  { label: 'Galician', value: 'gl' },
  { label: 'Gujarati', value: 'gu' },
  { label: 'Kannada', value: 'kn' },
  { label: 'Kazakh', value: 'kk' },
  { label: 'Latvian', value: 'lv' },
  { label: 'Lithuanian', value: 'lt' },
  { label: 'Macedonian', value: 'mk' },
  { label: 'Malay', value: 'ms' },
  { label: 'Malayalam', value: 'ml' },
  { label: 'Marathi', value: 'mr' },
  { label: 'Norwegian', value: 'no' },
  { label: 'Punjabi', value: 'pa' },
  { label: 'Romanian', value: 'ro' },
  { label: 'Serbian', value: 'sr' },
  { label: 'Slovak', value: 'sk' },
  { label: 'Slovenian', value: 'sl' },
  { label: 'Swahili', value: 'sw' },
  { label: 'Tamil', value: 'ta' },
  { label: 'Telugu', value: 'te' },
  { label: 'Ukrainian', value: 'uk' },
  { label: 'Urdu', value: 'ur' },
  { label: 'Welsh', value: 'cy' },
];

/**
 * Get language by value/code
 * @param {string} value - Language code (e.g., 'vi', 'en', 'es')
 * @returns {Object} Language object {label, value}
 */
export function getLanguage(value) {
  return TRANSLATION_LANGUAGES.find((lang) => lang.value === value) || TRANSLATION_LANGUAGES[0];
}

/**
 * Get user's preferred translation language from localStorage
 * @returns {string} Language code or 'none'
 */
export function getStoredTargetLanguage() {
  try {
    return localStorage.getItem('lma_target_language') || 'none';
  } catch {
    return 'none';
  }
}

/**
 * Save user's preferred translation language
 * @param {string} code - Language code
 */
export function saveTargetLanguage(code) {
  try {
    localStorage.setItem('lma_target_language', code);
  } catch (error) {
    console.error('Failed to save target language:', error);
  }
}

