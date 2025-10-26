# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

"""Sentiment Analysis"""
from .weighted_sentiment import ComprehendWeightedSentiment

# Gemini sentiment (AWS-free alternative)
try:
    from .gemini_sentiment import GeminiSentimentAnalyzer, detect_sentiment_async
    _GEMINI_SENTIMENT_AVAILABLE = True
except ImportError:
    GeminiSentimentAnalyzer = None
    detect_sentiment_async = None
    _GEMINI_SENTIMENT_AVAILABLE = False

__all__ = ["ComprehendWeightedSentiment", "GeminiSentimentAnalyzer", "detect_sentiment_async"]
