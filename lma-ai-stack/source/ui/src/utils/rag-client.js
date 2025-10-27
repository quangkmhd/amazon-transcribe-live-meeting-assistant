/*
 * Copyright (c) 2025
 * This file is licensed under the MIT License.
 */

/**
 * RAG Knowledge Base Client
 * Handles document upload, deletion, and querying
 */

import { supabase } from './supabase-client';
import { checkQuotaAvailable, formatBytes } from './storage-quota';

/**
 * Poll document processing status
 * @param {string} documentId - Document ID to check
 * @param {number} maxWaitMs - Maximum time to wait (default: 5 minutes)
 * @param {number} pollIntervalMs - Polling interval (default: 2 seconds)
 * @returns {Promise<Object>} Final status
 */
async function pollDocumentStatus(documentId, maxWaitMs = 300000, pollIntervalMs = 2000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('processing_status, chunk_count, metadata')
      .eq('document_id', documentId)
      .single();
    
    if (error) {
      throw new Error(`Failed to check status: ${error.message}`);
    }
    
    const status = data.processing_status;
    const metadata = data.metadata || {};
    
    console.log(`[POLL] Status: ${status}, Progress: ${metadata.progress_percent || 0}%`);
    
    // Check if completed
    if (status === 'completed') {
      return {
        success: true,
        status: 'completed',
        chunks: data.chunk_count,
        metadata,
      };
    }
    
    // Check if failed
    if (status === 'failed') {
      throw new Error(`Processing failed: ${metadata.error || 'Unknown error'}`);
    }
    
    // Still processing - wait and try again
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error('Processing timeout - document may still be processing in background');
}

/**
 * Upload a knowledge document
 * @param {File} file - File to upload
 * @param {Function} onProgress - Optional progress callback (percent, message)
 * @returns {Promise<Object>} Upload result
 */
export async function uploadKnowledgeDocument(file, onProgress = null) {
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
    const documentId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check storage quota before uploading (chunks will count toward quota)
    onProgress?.(5, 'Checking storage quota...');
    const quotaCheck = await checkQuotaAvailable(ownerEmail, file.size);
    if (!quotaCheck.isAvailable) {
      const currentUsageFormatted = formatBytes(quotaCheck.currentUsage);
      const quotaFormatted = formatBytes(quotaCheck.quota);
      const fileSizeFormatted = formatBytes(file.size);
      const availableFormatted = formatBytes(quotaCheck.availableBytes);

      throw new Error(
        `Storage quota exceeded!\n\n` +
          `Current usage: ${currentUsageFormatted} of ${quotaFormatted}\n` +
          `File size: ${fileSizeFormatted}\n` +
          `Available space: ${availableFormatted}\n\n` +
          `Please delete old chunks to free up space before uploading.`,
      );
    }

    // Read file as base64
    onProgress?.(10, 'Reading file...');
    console.log('Reading file...');
    const fileContent = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Get base64 string (remove data:*/*;base64, prefix)
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Send file content directly to Edge Function
    onProgress?.(20, 'Uploading to server...');
    console.log('Processing document...');
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const edgeFunctionUrl = `${supabase.supabaseUrl}/functions/v1/process-documents`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
        apikey: supabase.supabaseKey,
      },
      body: JSON.stringify({
        file_content: fileContent,
        document_id: documentId,
        owner_email: ownerEmail,
        file_name: fileName,
        file_type: fileType,
        file_size: file.size,
      }),
    });

    const result = await response.json();

    // Handle 202 Accepted - processing in background
    if (response.status === 202) {
      console.log('Document accepted for processing:', result);
      onProgress?.(30, 'Processing document in background...');
      
      // Poll for completion
      const finalStatus = await pollDocumentStatus(documentId, 300000, 2000);
      
      onProgress?.(100, 'Processing complete!');
      
      return {
        success: true,
        document_id: documentId,
        filename: fileName,
        chunks: finalStatus.chunks,
        processing_time_ms: finalStatus.metadata?.processing_time_ms || 0,
        status: 'completed',
        message: 'Document processed successfully.',
      };
    }

    // Handle immediate response (200 OK - small files)
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Document processing failed');
    }

    onProgress?.(100, 'Processing complete!');
    console.log('Document processed successfully:', result);

    return {
      success: true,
      document_id: documentId,
      filename: fileName,
      chunks: result.chunks,
      processing_time_ms: result.processing_time_ms,
      status: 'completed',
      message: 'Document processed successfully.',
    };
  } catch (error) {
    console.error('Error processing document:', error);
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

    // Transform snake_case to camelCase for UI
    const transformedData = (data || []).map((doc) => ({
      documentId: doc.document_id,
      ownerEmail: doc.owner_email,
      fileName: doc.file_name,
      fileType: doc.file_type,
      fileSize: doc.file_size,
      storagePath: doc.storage_path,
      uploadDate: doc.upload_date,
      processingStatus: doc.processing_status,
      processingError: doc.processing_error,
      chunkCount: doc.chunk_count,
      metadata: doc.metadata,
    }));

    return transformedData;
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

    // Delete chunks (CASCADE will handle this, but explicit is better)
    await supabase.from('knowledge_chunks').delete().eq('document_id', documentId);

    // Delete document record
    const { error: deleteError } = await supabase
      .from('knowledge_documents')
      .delete()
      .eq('document_id', documentId)
      .eq('owner_email', ownerEmail);

    if (deleteError) {
      throw new Error(`Database delete failed: ${deleteError.message}`);
    }

    // No need to delete from storage - we don't store files anymore!

    return {
      success: true,
      document_id: documentId,
    };
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
      return {
        context: 'Please log in to search the knowledge base.',
        sources: [],
        has_context: false,
      };
    }

    const ownerEmail = user.email;
    const contextParts = [];
    const sources = [];

    // Search documents if requested
    if (includeDocuments) {
      // Simple text search in knowledge_chunks (without embeddings for now)
      const { data: docChunks, error: docError } = await supabase
        .from('knowledge_chunks')
        .select('*, knowledge_documents(file_name)')
        .eq('owner_email', ownerEmail)
        .textSearch('content', query, { type: 'websearch' })
        .limit(5);

      if (!docError && docChunks && docChunks.length > 0) {
        contextParts.push('# Knowledge Base Documents\n');
        docChunks.forEach((chunk, idx) => {
          contextParts.push(`\n[Document ${idx + 1}]`);
          contextParts.push(`${chunk.content.substring(0, 500)}...`);

          sources.push({
            type: 'document',
            document_id: chunk.document_id,
            chunk_id: chunk.chunk_id,
            file_name: chunk.knowledge_documents?.file_name,
          });
        });
      }
    }

    // Search meeting transcripts if requested
    if (includeTranscripts) {
      const transcriptQuery = supabase
        .from('transcript_events')
        .select('*')
        .eq('is_final', true)
        .textSearch('transcript', query, { type: 'websearch' })
        .limit(3);

      if (meetingId) {
        transcriptQuery.eq('meeting_id', meetingId);
      }

      const { data: transcripts, error: transError } = await transcriptQuery;

      if (!transError && transcripts && transcripts.length > 0) {
        if (contextParts.length > 0) {
          contextParts.push('\n\n# Meeting Transcripts\n');
        }

        transcripts.forEach((trans, idx) => {
          contextParts.push(`\n[Transcript ${idx + 1} - ${trans.speaker_name || trans.speaker_number}]`);
          contextParts.push(trans.transcript);

          sources.push({
            type: 'transcript',
            meeting_id: trans.meeting_id,
            speaker: trans.speaker_name || trans.speaker_number,
          });
        });
      }
    }

    const context = contextParts.join('\n');

    return {
      context: context || '',
      sources,
      has_context: contextParts.length > 0,
    };
  } catch (error) {
    console.error('Error searching RAG:', error);
    return {
      context: '',
      sources: [],
      has_context: false,
      error: error.message,
    };
  }
}
