#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Gemini Sentiment Analysis Service
Replaces AWS Comprehend for sentiment detection
"""

import os
import json
import logging
import requests
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_CHAT_MODEL', 'gemini-2.0-flash-exp')
GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'


class GeminiSentimentAnalyzer:
    """Sentiment analyzer using Gemini API - compatible with Comprehend output format"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable must be set")
    
    def detect_sentiment(self, text: str, language_code: str = 'en') -> Dict[str, Any]:
        """
        Detect sentiment in text using Gemini API
        Returns format compatible with AWS Comprehend DetectSentimentResponse
        
        Args:
            text: Text to analyze
            language_code: Language code (e.g., 'en')
        
        Returns:
            Dict matching Comprehend response format:
            {
                'Sentiment': 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED',
                'SentimentScore': {
                    'Positive': float,
                    'Negative': float,
                    'Neutral': float,
                    'Mixed': float
                }
            }
        """
        if not text or not text.strip():
            # Return neutral for empty text
            return {
                'Sentiment': 'NEUTRAL',
                'SentimentScore': {
                    'Positive': 0.0,
                    'Negative': 0.0,
                    'Neutral': 1.0,
                    'Mixed': 0.0
                }
            }
        
        try:
            # Create sentiment analysis prompt
            prompt = f"""Analyze the sentiment of the following text and return ONLY a JSON object with this exact structure:
{{
  "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED",
  "scores": {{
    "positive": 0.0 to 1.0,
    "negative": 0.0 to 1.0,
    "neutral": 0.0 to 1.0,
    "mixed": 0.0 to 1.0
  }}
}}

Rules:
- POSITIVE: Overall positive emotion, optimism, satisfaction
- NEGATIVE: Overall negative emotion, dissatisfaction, anger
- NEUTRAL: Factual, objective, no strong emotion
- MIXED: Both positive and negative emotions present
- Scores must sum to approximately 1.0
- Return ONLY valid JSON, no explanation

Text to analyze:
{text}

JSON Response:"""

            url = f"{GEMINI_API_BASE_URL}/{GEMINI_MODEL}:generateContent"
            params = {'key': self.api_key}
            
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.1,  # Low temperature for consistent sentiment
                    "maxOutputTokens": 256,
                    "topP": 0.95
                }
            }
            
            response = requests.post(
                url,
                params=params,
                json=payload,
                timeout=15
            )
            
            if response.status_code != 200:
                logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                return self._default_neutral_response()
            
            result = response.json()
            
            # Extract text from Gemini response
            if 'candidates' in result and len(result['candidates']) > 0:
                candidate = result['candidates'][0]
                if 'content' in candidate:
                    parts = candidate['content'].get('parts', [])
                    if parts and 'text' in parts[0]:
                        response_text = parts[0]['text'].strip()
                        
                        # Parse JSON response
                        # Try to extract JSON if wrapped in markdown
                        import re
                        json_match = re.search(r'\{[^}]*"sentiment"[^}]*\}', response_text, re.DOTALL)
                        if json_match:
                            response_text = json_match.group()
                        
                        sentiment_data = json.loads(response_text)
                        
                        # Convert to Comprehend format
                        return {
                            'Sentiment': sentiment_data.get('sentiment', 'NEUTRAL').upper(),
                            'SentimentScore': {
                                'Positive': float(sentiment_data.get('scores', {}).get('positive', 0.0)),
                                'Negative': float(sentiment_data.get('scores', {}).get('negative', 0.0)),
                                'Neutral': float(sentiment_data.get('scores', {}).get('neutral', 1.0)),
                                'Mixed': float(sentiment_data.get('scores', {}).get('mixed', 0.0))
                            }
                        }
            
            logger.warning("No valid sentiment response from Gemini, using neutral")
            return self._default_neutral_response()
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini sentiment JSON: {str(e)}")
            return self._default_neutral_response()
        except Exception as e:
            logger.error(f"Error detecting sentiment with Gemini: {str(e)}")
            return self._default_neutral_response()
    
    def _default_neutral_response(self) -> Dict[str, Any]:
        """Return default neutral sentiment"""
        return {
            'Sentiment': 'NEUTRAL',
            'SentimentScore': {
                'Positive': 0.0,
                'Negative': 0.0,
                'Neutral': 1.0,
                'Mixed': 0.0
            }
        }


# Async wrapper for compatibility with existing code
async def detect_sentiment_async(text: str, language_code: str = 'en') -> Dict[str, Any]:
    """
    Async version of sentiment detection
    Compatible with existing eventprocessor_utils code
    """
    import asyncio
    loop = asyncio.get_running_loop()
    
    analyzer = GeminiSentimentAnalyzer()
    
    # Run Gemini call in executor to avoid blocking
    result = await loop.run_in_executor(
        None,
        lambda: analyzer.detect_sentiment(text, language_code)
    )
    
    return result


# For testing
if __name__ == "__main__":
    # Test sentiment detection
    analyzer = GeminiSentimentAnalyzer()
    
    test_texts = [
        "This is absolutely wonderful! I'm so happy with the results.",
        "This is terrible and I'm very disappointed.",
        "The meeting is scheduled for 3pm tomorrow.",
        "I love the new features but the interface is confusing."
    ]
    
    for text in test_texts:
        result = analyzer.detect_sentiment(text)
        print(f"\nText: {text}")
        print(f"Sentiment: {result['Sentiment']}")
        print(f"Scores: {result['SentimentScore']}")

