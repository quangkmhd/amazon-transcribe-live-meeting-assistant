/**
 * Real-time Transcript Indexer for RAG Knowledge Base
 * Automatically indexes final transcript segments with embeddings
 */

import axios, { AxiosError } from 'axios';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Lazy-initialized Supabase client
let supabaseClient: SupabaseClient | null = null;

/**
 * Get or initialize Supabase client
 */
function getSupabaseClient(): SupabaseClient | null {
    if (!supabaseClient) {
        const SUPABASE_URL = process.env['SUPABASE_URL'];
        const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];
        
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[Transcript Indexer] Supabase credentials not configured');
            return null;
        }
        
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }
    return supabaseClient;
}

/**
 * Check if real-time indexing is enabled
 */
function isIndexingEnabled(): boolean {
    return process.env['ENABLE_REALTIME_TRANSCRIPT_INDEXING'] === 'true';
}

/**
 * Get Gemini API key
 */
function getGeminiApiKey(): string {
    return process.env['GEMINI_API_KEY'] || '';
}

interface TranscriptSegment {
    meeting_id: string;
    speaker: string;
    content: string;
    start_time: number;
    end_time: number;
    is_final: boolean;
    owner_email?: string;
}

/**
 * Generate embedding for text using Gemini API
 */
async function generateEmbedding(text: string): Promise<number[]> {
    try {
        if (!text || !text.trim()) {
            console.warn('[Transcript Indexer] Empty text for embedding, skipping');
            return [];
        }

        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            console.warn('[Transcript Indexer] Gemini API key not configured');
            return [];
        }

        const url = `${GEMINI_API_BASE_URL}/${GEMINI_EMBEDDING_MODEL}:embedContent`;
        
        const response = await axios.post(
            url,
            {
                model: `models/${GEMINI_EMBEDDING_MODEL}`,
                content: {
                    parts: [{
                        text: text
                    }]
                },
                taskType: 'RETRIEVAL_DOCUMENT'
            },
            {
                params: { key: apiKey },
                timeout: 10000
            }
        );

        if (response.status === 200 && response.data.embedding) {
            const embedding = response.data.embedding.values;
            return embedding || [];
        } else {
            console.error('[Transcript Indexer] Unexpected Gemini API response:', response.status);
            return [];
        }
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            console.error('[Transcript Indexer] Gemini API error:', axiosError.response?.status, axiosError.response?.data);
        } else {
            console.error('[Transcript Indexer] Error generating embedding:', error);
        }
        return [];
    }
}

/**
 * Index a transcript segment with embedding
 */
export async function indexTranscriptSegment(segment: TranscriptSegment): Promise<boolean> {
    try {
        // Skip if real-time indexing is disabled
        if (!isIndexingEnabled()) {
            console.log('[Transcript Indexer] Real-time indexing is disabled');
            return false;
        }

        // Get Supabase client
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.warn('[Transcript Indexer] Supabase not configured, skipping indexing');
            return false;
        }

        // Only index final segments
        if (!segment.is_final) {
            return false;
        }

        // Skip if content is too short (less than 10 characters)
        if (!segment.content || segment.content.trim().length < 10) {
            return false;
        }

        console.log(`[Transcript Indexer] Indexing segment for meeting ${segment.meeting_id}...`);

        // Generate embedding
        const embedding = await generateEmbedding(segment.content);

        if (!embedding || embedding.length === 0) {
            console.error('[Transcript Indexer] Failed to generate embedding, skipping index');
            return false;
        }

        // Generate chunk ID
        const chunk_id = `${segment.meeting_id}_${segment.start_time}_${Date.now()}`;

        // Store in database
        const { error } = await supabase
            .from('meeting_transcript_chunks')
            .insert({
                chunk_id: chunk_id,
                meeting_id: segment.meeting_id,
                owner_email: segment.owner_email || 'unknown@example.com',
                speaker: segment.speaker,
                content: segment.content,
                start_time: segment.start_time,
                end_time: segment.end_time,
                embedding: embedding
            });

        if (error) {
            console.error('[Transcript Indexer] Error storing indexed segment:', error);
            return false;
        }

        console.log(`[Transcript Indexer] Successfully indexed segment ${chunk_id}`);
        return true;

    } catch (error) {
        console.error('[Transcript Indexer] Error indexing transcript segment:', error);
        return false;
    }
}

/**
 * Batch index multiple transcript segments
 */
export async function batchIndexTranscripts(segments: TranscriptSegment[]): Promise<number> {
    if (!isIndexingEnabled()) {
        return 0;
    }

    let successCount = 0;

    for (const segment of segments) {
        const success = await indexTranscriptSegment(segment);
        if (success) {
            successCount++;
        }
        
        // Rate limiting: Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Transcript Indexer] Batch indexed ${successCount}/${segments.length} segments`);
    return successCount;
}

/**
 * Delete indexed chunks for a meeting
 */
export async function deleteIndexedTranscripts(meetingId: string, ownerEmail: string): Promise<boolean> {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.warn('[Transcript Indexer] Supabase not configured, skipping deletion');
            return false;
        }

        const { error } = await supabase
            .from('meeting_transcript_chunks')
            .delete()
            .eq('meeting_id', meetingId)
            .eq('owner_email', ownerEmail);

        if (error) {
            console.error('[Transcript Indexer] Error deleting indexed transcripts:', error);
            return false;
        }

        console.log(`[Transcript Indexer] Deleted indexed transcripts for meeting ${meetingId}`);
        return true;

    } catch (error) {
        console.error('[Transcript Indexer] Error deleting indexed transcripts:', error);
        return false;
    }
}


