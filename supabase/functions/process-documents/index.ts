/**
 * Process Documents Edge Function - REFACTORED
 * 
 * Client gửi file TRỰC TIẾP → Parse → Chunk → Embed → Save → Done
 * KHÔNG CẦN storage trung gian!
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || 'AIzaSyBftkScq4WOGjidTirS5yMfbjl6ne7w0JU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Chunking configuration
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Parse document from base64 string
 */
async function parseDocument(fileContent: string, fileType: string, fileName: string): Promise<string> {
  try {
    // Decode base64 to binary
    const binaryString = atob(fileContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const decoder = new TextDecoder();
    
    switch (fileType.toLowerCase()) {
      case 'pdf':
        // For PDF, we'd need pdf-parse but that's heavy
        // For now, try basic text extraction or return error
        console.warn(`PDF parsing requires heavy library - ${fileName}`);
        // Try to extract text anyway (won't work well for complex PDFs)
        return decoder.decode(bytes);
      
      case 'txt':
      case 'md':
      case 'markdown':
      case 'html':
      case 'htm':
      case 'json':
      case 'csv':
      case 'py':
      case 'js':
      case 'ts':
      case 'java':
      case 'cpp':
      case 'go':
      case 'rs':
      case 'php':
      case 'sh':
      case 'sql':
        return decoder.decode(bytes);
      
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse ${fileType}: ${error.message}`);
  }
}

function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let position = 0;
  
  while (position < text.length) {
    const chunk = text.slice(position, position + chunkSize);
    chunks.push(chunk.trim());
    position += chunkSize - overlap;
  }
  
  return chunks.filter(chunk => chunk.length > 0);
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map(text => ({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] }
          }))
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }
    
    const data = await response.json();
    embeddings.push(...data.embeddings.map((e: any) => e.values));
  }
  
  return embeddings;
}

/**
 * Process in background without blocking response
 */
async function processInBackground(
  document_id: string,
  owner_email: string,
  file_name: string,
  file_type: string,
  file_size: number,
  text: string,
  chunks: string[]
) {
  try {
    const startTime = Date.now();
    
    // Update status to processing
    await supabase
      .from('knowledge_documents')
      .update({ 
        processing_status: 'processing',
        metadata: { 
          current_step: 'generating_embeddings',
          total_chunks: chunks.length 
        }
      })
      .eq('document_id', document_id);
    
    // Generate embeddings in batches
    console.log(`[BACKGROUND] Generating embeddings for ${chunks.length} chunks...`);
    const embeddings: number[][] = [];
    const BATCH_SIZE = 50; // Smaller batches for large files
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, Math.min(i + BATCH_SIZE, chunks.length));
      const batchEmbeddings = await generateEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
      
      // Update progress
      const progress = Math.round((embeddings.length / chunks.length) * 100);
      console.log(`[PROGRESS] ${progress}% (${embeddings.length}/${chunks.length} chunks)`);
      
      await supabase
        .from('knowledge_documents')
        .update({ 
          metadata: { 
            current_step: 'generating_embeddings',
            progress_percent: progress,
            chunks_processed: embeddings.length,
            total_chunks: chunks.length
          }
        })
        .eq('document_id', document_id);
    }
    
    console.log(`[BACKGROUND] Generated ${embeddings.length} embeddings`);
    
    // Update status to saving
    await supabase
      .from('knowledge_documents')
      .update({ 
        metadata: { 
          current_step: 'saving_chunks',
          progress_percent: 100 
        }
      })
      .eq('document_id', document_id);
    
    // Save chunks in batches (Supabase has row limits)
    console.log('[BACKGROUND] Saving chunks...');
    const SAVE_BATCH_SIZE = 1000; // Supabase recommended batch size
    
    for (let i = 0; i < chunks.length; i += SAVE_BATCH_SIZE) {
      const batchChunks = chunks.slice(i, Math.min(i + SAVE_BATCH_SIZE, chunks.length));
      const batchEmbeddings = embeddings.slice(i, Math.min(i + SAVE_BATCH_SIZE, embeddings.length));
      
      const chunkRecords = batchChunks.map((content, index) => ({
        chunk_id: `${document_id}_chunk_${i + index}`,
        document_id,
        owner_email,
        chunk_index: i + index,
        content,
        content_length: content.length,
        embedding: JSON.stringify(batchEmbeddings[index]),
        metadata: {
          chunk_size: content.length,
          total_chunks: chunks.length
        }
      }));
      
      const { error: chunksError } = await supabase
        .from('knowledge_chunks')
        .insert(chunkRecords);
      
      if (chunksError) {
        throw new Error(`Save chunks batch ${i} failed: ${chunksError.message}`);
      }
      
      console.log(`[PROGRESS] Saved ${Math.min(i + SAVE_BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
    }
    
    // Update status to completed
    const processingTime = Date.now() - startTime;
    await supabase
      .from('knowledge_documents')
      .update({ 
        processing_status: 'completed',
        chunk_count: chunks.length,
        metadata: {
          processing_time_ms: processingTime,
          text_length: text.length,
          uploaded_via: 'web_ui_direct',
          completed_at: new Date().toISOString()
        }
      })
      .eq('document_id', document_id);
    
    console.log(`[BACKGROUND] ✅ Completed in ${processingTime}ms`);
    
  } catch (error) {
    console.error('[BACKGROUND ERROR]', error);
    
    // Update status to failed
    await supabase
      .from('knowledge_documents')
      .update({ 
        processing_status: 'failed',
        metadata: {
          error: error.message,
          failed_at: new Date().toISOString()
        }
      })
      .eq('document_id', document_id);
  }
}

/**
 * Main handler
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200 
    });
  }

  try {
    const requestData = await req.json();
    const { 
      file_content,  // Base64 encoded file content
      document_id, 
      owner_email, 
      file_name, 
      file_type, 
      file_size 
    } = requestData;
    
    console.log(`[PROCESS] Starting: ${file_name} (${document_id})`);
    
    // Step 1: Parse document from base64
    console.log('[STEP 1] Parsing document...');
    const text = await parseDocument(file_content, file_type, file_name);
    console.log(`[STEP 1] Extracted ${text.length} chars`);
    
    if (!text || text.trim().length === 0) {
      throw new Error('No text content extracted');
    }
    
    // Step 2: Chunk text
    console.log('[STEP 2] Chunking...');
    const chunks = chunkText(text);
    console.log(`[STEP 2] Created ${chunks.length} chunks`);
    
    // Step 3: Save document metadata IMMEDIATELY (status = 'pending')
    console.log('[STEP 3] Saving metadata...');
    const { error: docError } = await supabase
      .from('knowledge_documents')
      .insert({
        document_id,
        owner_email,
        file_name,
        file_type,
        file_size,
        storage_path: 'direct_upload',
        processing_status: 'pending', // Will be updated by background process
        chunk_count: 0, // Will be updated
        metadata: {
          text_length: text.length,
          uploaded_via: 'web_ui_direct',
          started_at: new Date().toISOString()
        }
      });
    
    if (docError) {
      throw new Error(`Save metadata failed: ${docError.message}`);
    }
    
    // Step 4: Start background processing (don't wait)
    console.log('[STEP 4] Starting background processing...');
    processInBackground(document_id, owner_email, file_name, file_type, file_size, text, chunks)
      .catch(err => console.error('[BACKGROUND FAILED]', err));
    
    // Return immediately
    console.log(`[RESPONSE] Returning immediately - processing continues in background`);
    
    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        file_name,
        chunks: chunks.length,
        status: 'processing',
        message: 'Document accepted for processing. Check status for progress.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202 // Accepted
      }
    );
    
  } catch (error) {
    console.error('[ERROR]', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
