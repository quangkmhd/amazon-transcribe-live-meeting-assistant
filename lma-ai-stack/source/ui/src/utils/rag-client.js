/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

/**
 * RAG Knowledge Base Client
 * Handles document upload, deletion, and querying
 */

import { supabase } from './supabase-client';

/**
 * Convert File to base64
 * @param {File} file
 * @returns {Promise<string>} Base64 string
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Upload a knowledge document
 * @param {File} file - File to upload
 * @returns {Promise<Object>} Upload result
 */
export async function uploadKnowledgeDocument(file) {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const ownerEmail = user.email;
    const fileName = file.name;
    const fileType = file.name.split('.').pop().toLowerCase();

    // Read file as base64
    const fileContent = await fileToBase64(file);

    //  Upload via document processor (could be Lambda function or Supabase function)
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/document-processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'process',
        file_content: fileContent.split(',')[1], // Remove data URL prefix
        filename: fileName,
        owner_email: ownerEmail,
        metadata: {
          uploaded_via: 'web_ui',
          file_type: fileType,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

/**
 * List user's knowledge documents
 * @returns {Promise<Array>} List of documents
 */
export async function listKnowledgeDocuments() {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    const ownerEmail = user.email;

    // Query knowledge_documents table
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('owner_email', ownerEmail)
      .order('upload_date', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error listing documents:', error);
    return [];
  }
}

/**
 * Delete a knowledge document
 * @param {string} documentId - Document ID to delete
 * @returns {Promise<Object>} Delete result
 */
export async function deleteKnowledgeDocument(documentId) {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const ownerEmail = user.email;

    // Call document processor to delete
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/document-processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'delete',
        document_id: documentId,
        owner_email: ownerEmail,
      }),
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

/**
 * Search RAG knowledge base
 * @param {string} query - Search query
 * @param {string} meetingId - Optional meeting ID for transcript search
 * @param {boolean} includeDocuments - Include knowledge base documents
 * @param {boolean} includeTranscripts - Include meeting transcripts
 * @returns {Promise<Object>} Search results with context and sources
 */
export async function searchRAG(query, meetingId = null, includeDocuments = true, includeTranscripts = true) {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const ownerEmail = user.email;

    // Call RAG query resolver
    const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/rag-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        user_email: ownerEmail,
        meeting_id: meetingId,
        include_documents: includeDocuments,
        include_transcripts: includeTranscripts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error searching RAG:', error);
    throw error;
  }
}
