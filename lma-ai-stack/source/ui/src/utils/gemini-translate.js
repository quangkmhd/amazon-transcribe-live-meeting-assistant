/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
/* eslint-disable max-classes-per-file */

/**
 * Gemini-based translation service to replace AWS Translate
 * Uses Google Gemini API for translation
 */

const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || '';
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

/**
 * Get full language name from language code
 * @param {string} code - Language code
 * @returns {string} - Full language name
 */
const getLanguageName = (code) => {
  const languageMap = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    'zh-TW': 'Traditional Chinese',
    ar: 'Arabic',
    hi: 'Hindi',
    vi: 'Vietnamese',
    th: 'Thai',
    nl: 'Dutch',
    pl: 'Polish',
    tr: 'Turkish',
    sv: 'Swedish',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
    el: 'Greek',
    he: 'Hebrew',
    id: 'Indonesian',
    ms: 'Malay',
    ro: 'Romanian',
    uk: 'Ukrainian',
    cs: 'Czech',
    hu: 'Hungarian',
  };

  return languageMap[code] || code;
};

/**
 * Translate text using Gemini API
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code (or 'auto' for auto-detection)
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} - Translated text
 */
export const translateText = async (text, sourceLanguage = 'auto', targetLanguage = 'en') => {
  if (!text || text.trim() === '') {
    return text;
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === '') {
    console.warn('Gemini API key not configured. Skipping translation.');
    return text;
  }

  try {
    const prompt =
      sourceLanguage === 'auto'
        ? `Translate the following text to ${getLanguageName(
            targetLanguage,
          )}. Only return the translated text, no explanations:\n\n${text}`
        : `Translate the following text from ${getLanguageName(sourceLanguage)} to ${getLanguageName(
            targetLanguage,
          )}. Only return the translated text, no explanations:\n\n${text}`;

    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      const translatedText = data.candidates[0].content.parts[0].text.trim();
      return translatedText;
    }

    throw new Error('No translation result from Gemini API');
  } catch (error) {
    console.error('Translation error:', error);
    // Return original text if translation fails
    return text;
  }
};

/**
 * GeminiTranslateClient - Compatible interface with AWS TranslateClient
 * This allows drop-in replacement of AWS Translate with Gemini
 */
export class GeminiTranslateClient {
  constructor(config = {}) {
    this.config = config;
    this.maxAttempts = config.maxAttempts || 3;
  }

  /**
   * Send translation command (compatible with AWS SDK interface)
   * @param {object} command - Translation command object
   * @returns {Promise<object>} - Translation result
   */
  async send(command) {
    const { Text, SourceLanguageCode, TargetLanguageCode } = command.input || command;

    let attempts = 0;
    let lastError;

    // eslint-disable-next-line no-await-in-loop
    while (attempts < this.maxAttempts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const translatedText = await translateText(Text, SourceLanguageCode, TargetLanguageCode);

        return {
          TranslatedText: translatedText,
          SourceLanguageCode: SourceLanguageCode === 'auto' ? 'en' : SourceLanguageCode,
          TargetLanguageCode,
        };
      } catch (error) {
        lastError = error;
        attempts += 1;

        if (attempts < this.maxAttempts) {
          // Exponential backoff
          const delay = Math.min(1000 * 2 ** attempts, 5000);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
        }
      }
    }

    throw lastError || new Error('Translation failed after maximum attempts');
  }
}

/**
 * TranslateTextCommand - Compatible with AWS SDK interface
 */
export class TranslateTextCommand {
  constructor(params) {
    this.input = params;
  }
}

export default {
  translateText,
  GeminiTranslateClient,
  TranslateTextCommand,
};
