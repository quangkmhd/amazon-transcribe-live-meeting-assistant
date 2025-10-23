#!/usr/bin/env ts-node
/**
 * Manually trigger Edge Function to process stuck transcript_events
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY!;

async function triggerEdgeFunction() {
    console.log('\n🚀 Triggering Edge Function: process-transcripts\n');

    try {
        // Call edge function via HTTP
        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/process-transcripts`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Edge Function failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        
        console.log('✅ Edge Function executed successfully!');
        console.log(`   Processed: ${result.processed} events\n`);

        // Verify results
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        
        const { data: remaining } = await supabase
            .from('transcript_events')
            .select('id')
            .eq('processed', false);

        const { data: transcripts } = await supabase
            .from('transcripts')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(10);

        console.log('📊 After processing:');
        console.log(`   Remaining unprocessed: ${remaining?.length || 0}`);
        console.log(`   Total transcripts: ${transcripts?.length || 0} (showing last 10)\n`);

        if (remaining && remaining.length > 0) {
            console.log('⚠️  Still have unprocessed events. Run again or check for errors.\n');
        } else {
            console.log('✅ All events processed successfully!\n');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        console.log('\n💡 TIP: Make sure Edge Function is deployed:');
        console.log('   npx supabase functions deploy process-transcripts\n');
    }
}

triggerEdgeFunction();
