/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

/**
 * Conversation History Manager
 * Manages chat conversation history per user in localStorage
 */

const MAX_CONVERSATIONS = 20; // Show max 20 recent conversations
const STORAGE_KEY_PREFIX = 'lma_conversation_';

/**
 * Get storage key for user
 */
function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/**
 * Get all conversations for a user
 * @param {string} userId - User ID
 * @returns {Array} Array of conversations
 */
export function getConversations(userId) {
  try {
    const key = getStorageKey(userId);
    const data = localStorage.getItem(key);

    if (!data) {
      return [];
    }

    const conversations = JSON.parse(data);

    // Return only last 20
    return conversations.slice(-MAX_CONVERSATIONS);
  } catch (error) {
    console.error('Error loading conversations:', error);
    return [];
  }
}

/**
 * Save a conversation message
 * @param {string} userId - User ID
 * @param {Object} message - Message object
 */
export function saveMessage(userId, message) {
  try {
    const conversations = getConversations(userId);

    // Add new message
    conversations.push({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
      id: message.id || `msg_${Date.now()}_${Math.random()}`,
    });

    // Keep only last 20
    const trimmed = conversations.slice(-MAX_CONVERSATIONS);

    const key = getStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(trimmed));

    return trimmed;
  } catch (error) {
    console.error('Error saving message:', error);
    return [];
  }
}

/**
 * Clear all conversations for a user
 * @param {string} userId - User ID
 */
export function clearConversations(userId) {
  try {
    const key = getStorageKey(userId);
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Error clearing conversations:', error);
    return false;
  }
}

/**
 * Get last N messages for context
 * @param {string} userId - User ID
 * @param {number} count - Number of messages (default 10)
 * @returns {Array} Last N messages
 */
export function getLastMessages(userId, count = 10) {
  try {
    const conversations = getConversations(userId);
    return conversations.slice(-count);
  } catch (error) {
    console.error('Error getting last messages:', error);
    return [];
  }
}

/**
 * Format messages for Gemini API
 * @param {Array} messages - Array of messages
 * @returns {string} Formatted conversation string
 */
export function formatMessagesForContext(messages) {
  return messages
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
}
