/**
 * Test script to check if stage 6 logs exist in database
 * Run: node test-stage6.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStage6Logs() {
    console.log('🔍 Checking for stage 6 logs in database...\n');

    try {
        // Check if pipeline_logs table exists
        const { data: tables, error: tableError } = await supabase
            .from('pipeline_logs')
            .select('*')
            .limit(1);

        if (tableError) {
            if (tableError.code === '42P01') {
                console.error('❌ Table "pipeline_logs" does not exist!');
                console.log('\n📝 You need to create it:');
                console.log(`
CREATE TABLE pipeline_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id text NOT NULL,
    stage text NOT NULL,
    transcript text,
    speaker text,
    duration integer,
    error text,
    metadata jsonb,
    timestamp timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pipeline_logs_call_id ON pipeline_logs(call_id);
CREATE INDEX idx_pipeline_logs_stage ON pipeline_logs(stage);
CREATE INDEX idx_pipeline_logs_timestamp ON pipeline_logs(timestamp);
                `);
                return;
            }
            throw tableError;
        }

        console.log('✅ Table "pipeline_logs" exists\n');

        // Check total logs
        const { count: totalCount } = await supabase
            .from('pipeline_logs')
            .select('*', { count: 'exact', head: true });

        console.log(`📊 Total logs in database: ${totalCount || 0}`);

        // Check stage distribution
        const { data: stageStats } = await supabase
            .from('pipeline_logs')
            .select('stage')
            .order('timestamp', { ascending: false })
            .limit(1000);

        if (stageStats && stageStats.length > 0) {
            const stageCounts = {};
            stageStats.forEach(log => {
                stageCounts[log.stage] = (stageCounts[log.stage] || 0) + 1;
            });

            console.log('\n📈 Stage distribution (last 1000 logs):');
            Object.entries(stageCounts)
                .sort((a, b) => b[1] - a[1])
                .forEach(([stage, count]) => {
                    const emoji = stage.includes('6️⃣') ? '🎯' : '  ';
                    console.log(`${emoji} ${stage}: ${count}`);
                });
        }

        // Check specifically for stage 6
        const { data: stage6Logs, error: stage6Error } = await supabase
            .from('pipeline_logs')
            .select('*')
            .eq('stage', '6️⃣ UI_RECEIVED')
            .order('timestamp', { ascending: false })
            .limit(5);

        if (stage6Error) {
            console.error('\n❌ Error querying stage 6 logs:', stage6Error);
            return;
        }

        console.log(`\n🎯 Stage 6 (UI_RECEIVED) logs found: ${stage6Logs?.length || 0}`);

        if (stage6Logs && stage6Logs.length > 0) {
            console.log('\n📝 Recent stage 6 logs:');
            stage6Logs.forEach((log, i) => {
                console.log(`\n${i + 1}. Call ID: ${log.call_id}`);
                console.log(`   Speaker: ${log.speaker}`);
                console.log(`   Transcript: ${log.transcript?.substring(0, 50)}...`);
                console.log(`   Time: ${log.timestamp}`);
            });
        } else {
            console.log('\n⚠️  NO STAGE 6 LOGS FOUND!');
            console.log('\n🔍 Possible reasons:');
            console.log('   1. Frontend is not sending stage 6 logs');
            console.log('   2. UI has not received any transcripts yet');
            console.log('   3. The integration is not implemented');
            console.log('\n💡 Solution:');
            console.log('   - Use the frontend utilities created:');
            console.log('     • /lma-browser-extension-stack/src/utils/pipelineLogger.ts');
            console.log('     • /lma-browser-extension-stack/src/hooks/useTranscriptSubscription.ts');
            console.log('   - See STAGE6_INTEGRATION_GUIDE.md for details');
        }

        // Check recent calls
        const { data: recentCalls } = await supabase
            .from('meetings')
            .select('call_id, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (recentCalls && recentCalls.length > 0) {
            console.log('\n📞 Recent meetings:');
            recentCalls.forEach((call, i) => {
                console.log(`${i + 1}. ${call.call_id} (${call.created_at})`);
            });
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error(error.stack);
    }
}

checkStage6Logs().then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
