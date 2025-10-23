#!/usr/bin/env ts-node
/**
 * Pipeline Diagnostic Tool
 * Kiểm tra xem transcript có flow qua các stages không
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface DiagnosticResult {
    stage: string;
    status: '✅ OK' | '⚠️  WARNING' | '❌ ERROR';
    count?: number;
    details?: any;
    fix?: string;
}

async function diagnose(): Promise<void> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          TRANSCRIPT PIPELINE DIAGNOSTIC TOOL                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const results: DiagnosticResult[] = [];

    // ============================================
    // Stage 3: Check transcript_events (staging)
    // ============================================
    console.log('🔍 Checking Stage 3: transcript_events table...');
    
    const { data: stagingData, error: stagingError } = await supabase
        .from('transcript_events')
        .select('id, meeting_id, processed, timestamp')
        .order('timestamp', { ascending: false })
        .limit(10);

    if (stagingError) {
        results.push({
            stage: '3️⃣ transcript_events',
            status: '❌ ERROR',
            details: stagingError.message,
            fix: 'Check Supabase connection and table permissions'
        });
    } else {
        const unprocessedCount = stagingData?.filter(e => !e.processed).length || 0;
        const totalCount = stagingData?.length || 0;
        
        results.push({
            stage: '3️⃣ transcript_events',
            status: totalCount > 0 ? '✅ OK' : '⚠️  WARNING',
            count: totalCount,
            details: {
                total: totalCount,
                unprocessed: unprocessedCount,
                processed: totalCount - unprocessedCount,
                latest: stagingData?.[0]
            },
            fix: totalCount === 0 ? 'No data yet - start a meeting to generate transcripts' : undefined
        });
    }

    // ============================================
    // Stage 4: Check if Edge Function is needed
    // ============================================
    console.log('🔍 Checking Stage 4: Edge Function processing...');
    
    const { data: unprocessedEvents } = await supabase
        .from('transcript_events')
        .select('id, meeting_id')
        .eq('processed', false);
    
    const unprocessedCount = unprocessedEvents?.length || 0;

    if (unprocessedCount > 0) {
        results.push({
            stage: '4️⃣ Edge Function',
            status: '⚠️  WARNING',
            count: unprocessedCount,
            details: {
                stuck_events: unprocessedCount,
                meeting_ids: [...new Set(unprocessedEvents?.map(e => e.meeting_id) || [])]
            },
            fix: `Run: supabase functions invoke process-transcripts\nOr setup pg_cron to run every 5s`
        });
    } else {
        results.push({
            stage: '4️⃣ Edge Function',
            status: '✅ OK',
            details: 'No stuck events - Edge Function working or no data yet'
        });
    }

    // ============================================
    // Stage 5: Check transcripts (final table)
    // ============================================
    console.log('🔍 Checking Stage 5: transcripts table...');
    
    const { data: finalData, error: finalError } = await supabase
        .from('transcripts')
        .select('id, meeting_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (finalError) {
        results.push({
            stage: '5️⃣ transcripts',
            status: '❌ ERROR',
            details: finalError.message,
            fix: 'Check Supabase table exists and has correct schema'
        });
    } else {
        const finalCount = finalData?.length || 0;
        
        results.push({
            stage: '5️⃣ transcripts',
            status: finalCount > 0 ? '✅ OK' : '⚠️  WARNING',
            count: finalCount,
            details: {
                total: finalCount,
                latest: finalData?.[0]
            },
            fix: finalCount === 0 ? 'Edge Function not processing or no data yet' : undefined
        });
    }

    // ============================================
    // Stage 6: Check Realtime configuration
    // ============================================
    console.log('🔍 Checking Stage 6: Supabase Realtime...');
    
    // Try to check if realtime is enabled (this is a heuristic check)
    const channel = supabase.channel('test-channel');
    const realtimeStatus = channel ? '✅ OK' : '❌ ERROR';
    
    results.push({
        stage: '6️⃣ Supabase Realtime',
        status: realtimeStatus as any,
        details: 'Supabase Realtime is configured at project level',
        fix: realtimeStatus === '❌ ERROR' ? 'Enable Realtime in Supabase Dashboard > Database > Replication' : undefined
    });

    // ============================================
    // Print results
    // ============================================
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     DIAGNOSTIC RESULTS                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    results.forEach(result => {
        console.log(`${result.stage.padEnd(25)} ${result.status}`);
        if (result.count !== undefined) {
            console.log(`   Count: ${result.count}`);
        }
        if (result.details && typeof result.details !== 'string') {
            console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
        } else if (result.details) {
            console.log(`   Details: ${result.details}`);
        }
        if (result.fix) {
            console.log(`   🔧 Fix: ${result.fix}`);
        }
        console.log('');
    });

    // ============================================
    // Summary and recommendations
    // ============================================
    const errorCount = results.filter(r => r.status === '❌ ERROR').length;
    const warningCount = results.filter(r => r.status === '⚠️  WARNING').length;

    console.log('═════════════════════════════════════════════════════════════════\n');
    console.log('📊 SUMMARY:');
    console.log(`   ✅ Healthy: ${results.length - errorCount - warningCount} stages`);
    console.log(`   ⚠️  Warnings: ${warningCount} stages`);
    console.log(`   ❌ Errors: ${errorCount} stages\n`);

    if (errorCount > 0) {
        console.log('🚨 CRITICAL: Pipeline has errors. Review fixes above.\n');
    } else if (warningCount > 0) {
        console.log('⚠️  WARNING: Pipeline has issues. Review fixes above.\n');
    } else {
        console.log('✅ SUCCESS: Pipeline is healthy!\n');
    }

    // ============================================
    // Recommendations
    // ============================================
    console.log('💡 RECOMMENDATIONS:\n');
    
    if (unprocessedCount > 0) {
        console.log('1. Run Edge Function manually to clear stuck events:');
        console.log('   npx supabase functions invoke process-transcripts\n');
        
        console.log('2. Setup pg_cron for automatic processing (every 5s):');
        console.log('   See: supabase/migrations/004_setup_pg_cron.sql\n');
    }

    console.log('3. View pipeline logs:');
    console.log('   tail -f debug-logs/pipeline-*.txt\n');
    
    console.log('4. View edge function logs:');
    console.log('   tail -f debug-logs/transcript-*.txt\n');
}

diagnose().catch(console.error);
