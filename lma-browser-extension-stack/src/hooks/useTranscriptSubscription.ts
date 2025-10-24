/**
 * Transcript Subscription Hook
 * Subscribes to Supabase Realtime for live transcripts and logs stage 6
 */

import { useEffect, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../context/SupabaseContext';
import { logUIReceivedDebounced } from '../utils/pipelineLogger';

export interface Transcript {
  id: string;
  call_id: string;
  segment_id: string;
  start_time: number;
  end_time: number;
  transcript: string;
  speaker: string;
  confidence?: number;
  created_at: string;
}

/**
 * Hook to subscribe to real-time transcripts for a specific call
 * Automatically logs stage 6 (UI_RECEIVED) when transcripts arrive
 */
export function useTranscriptSubscription(callId: string | null) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!callId) {
      setIsLoading(false);
      return;
    }

    let channel: RealtimeChannel | null = null;

    async function setupSubscription() {
      try {
        // 1. Fetch existing transcripts
        const { data: existingTranscripts, error: fetchError } = await supabase
          .from('transcripts')
          .select('*')
          .eq('call_id', callId)
          .order('start_time', { ascending: true });

        if (fetchError) throw fetchError;

        setTranscripts(existingTranscripts || []);
        setIsLoading(false);

        // 2. Subscribe to new transcripts
        channel = supabase
          .channel(`transcripts:${callId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'transcripts',
              filter: `call_id=eq.${callId}`,
            },
            (payload) => {
              const newTranscript = payload.new as Transcript;
              
              // Add to state
              setTranscripts((prev) => [...prev, newTranscript]);
              
              // 🎯 LOG STAGE 6: UI has received and will display the transcript
              logUIReceivedDebounced({
                callId: newTranscript.call_id,
                transcript: newTranscript.transcript,
                speaker: newTranscript.speaker || 'Unknown',
                metadata: {
                  timestamp: newTranscript.created_at,
                  segmentId: newTranscript.segment_id,
                  confidence: newTranscript.confidence,
                },
              });
              
              console.log('[Transcript Subscription] New transcript received:', {
                speaker: newTranscript.speaker,
                text: newTranscript.transcript.substring(0, 50) + '...',
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'transcripts',
              filter: `call_id=eq.${callId}`,
            },
            (payload) => {
              const updatedTranscript = payload.new as Transcript;
              
              // Update in state
              setTranscripts((prev) =>
                prev.map((t) => (t.id === updatedTranscript.id ? updatedTranscript : t))
              );
              
              // Log update as well
              logUIReceivedDebounced({
                callId: updatedTranscript.call_id,
                transcript: updatedTranscript.transcript,
                speaker: updatedTranscript.speaker || 'Unknown',
                metadata: {
                  timestamp: updatedTranscript.created_at,
                  segmentId: updatedTranscript.segment_id,
                  confidence: updatedTranscript.confidence,
                },
              });
            }
          )
          .subscribe();

        console.log(`[Transcript Subscription] Subscribed to call: ${callId}`);
      } catch (err) {
        console.error('[Transcript Subscription] Setup error:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    }

    setupSubscription();

    // Cleanup
    return () => {
      if (channel) {
        console.log(`[Transcript Subscription] Unsubscribing from call: ${callId}`);
        supabase.removeChannel(channel);
      }
    };
  }, [callId]);

  return { transcripts, isLoading, error };
}
