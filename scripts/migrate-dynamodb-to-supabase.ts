/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { createClient } from '@supabase/supabase-js';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const CALLS_TABLE_NAME = process.env.CALLS_TABLE_NAME!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function migrateCallsTable() {
  console.log('🚀 Starting DynamoDB → Supabase migration...');
  console.log(`Source: DynamoDB table ${CALLS_TABLE_NAME}`);
  console.log(`Destination: Supabase ${SUPABASE_URL}\n`);

  let totalMigrated = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    // Scan DynamoDB table (paginated)
    const scanCommand = new ScanCommand({
      TableName: CALLS_TABLE_NAME,
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 100, // Process 100 items at a time
    });

    const response = await dynamoClient.send(scanCommand);
    const items = response.Items?.map((item) => unmarshall(item)) || [];
    lastEvaluatedKey = response.LastEvaluatedKey;

    // Filter Call entities (PK starts with "c#")
    const calls = items.filter(
      (item) => item.PK?.startsWith('c#') && item.SK?.startsWith('c#')
    );

    console.log(`📦 Processing batch: ${calls.length} meetings found`);

    // Transform and insert to Supabase
    for (const call of calls) {
      const meeting = {
        meeting_id: call.CallId,
        agent_id: call.AgentId,
        title: call.CallSummaryText?.substring(0, 100) || 'Untitled Meeting',
        status: call.Status?.toLowerCase() || 'ended',
        recording_url: call.RecordingUrl,
        recording_size: null, // Not available in DynamoDB
        recording_duration: Math.floor(
          (call.TotalConversationDurationMillis || 0) / 1000
        ),
        summary_text: call.CallSummaryText,
        categories:
          call.CallCategories?.length > 0
            ? { categories: call.CallCategories }
            : null,
        issues_detected: call.IssuesDetected,
        sentiment_stats: call.Sentiment || null,
        duration_ms: call.TotalConversationDurationMillis,
        owner_email: call.Owner,
        shared_with: call.SharedWith?.split(',').filter(Boolean) || [],
        started_at: call.CreatedAt,
        ended_at: call.UpdatedAt,
        created_at: call.CreatedAt,
        updated_at: call.UpdatedAt,
        expires_at: call.ExpiresAfter
          ? new Date(call.ExpiresAfter * 1000).toISOString()
          : null,
      };

      const { error } = await supabase
        .from('meetings')
        .upsert(meeting, { onConflict: 'meeting_id' });

      if (error) {
        console.error(`❌ Error migrating meeting ${call.CallId}:`, error);
      } else {
        totalMigrated++;
        process.stdout.write(`\r✓ Migrated ${totalMigrated} meetings`);
      }
    }

    if (calls.length > 0) {
      console.log(); // New line after batch
    }
  } while (lastEvaluatedKey);

  console.log(`\n\n✅ Migration complete! Total meetings migrated: ${totalMigrated}`);
}

async function migrateTranscriptSegments() {
  console.log('\n🚀 Starting Transcript Segments migration...');

  let totalMigrated = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const scanCommand = new ScanCommand({
      TableName: CALLS_TABLE_NAME,
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 100,
    });

    const response = await dynamoClient.send(scanCommand);
    const items = response.Items?.map((item) => unmarshall(item)) || [];
    lastEvaluatedKey = response.LastEvaluatedKey;

    // Filter TranscriptSegment entities (SK starts with "ts#")
    const segments = items.filter((item) => item.SK?.startsWith('ts#'));

    console.log(`📦 Processing batch: ${segments.length} segments found`);

    // Batch insert to Supabase (max 1000 per batch)
    if (segments.length > 0) {
      const transcripts = segments.map((segment) => ({
        meeting_id: segment.CallId,
        segment_id: segment.SegmentId,
        transcript: segment.Transcript,
        start_time: segment.StartTime || 0,
        end_time: segment.EndTime || 0,
        is_partial: segment.IsPartial || false,
        speaker_number: segment.Speaker || '1',
        speaker_name: null,
        speaker_role: null,
        channel: segment.Channel,
        speaker: segment.Speaker,
        sentiment: segment.Sentiment,
        sentiment_score: segment.SentimentScore || null,
        sentiment_weighted: segment.SentimentWeighted || null,
        owner_email: segment.Owner,
        shared_with: segment.SharedWith?.split(',').filter(Boolean) || [],
        created_at: segment.CreatedAt,
        updated_at: segment.UpdatedAt,
        expires_at: segment.ExpiresAfter
          ? new Date(segment.ExpiresAfter * 1000).toISOString()
          : null,
      }));

      // Insert in batches of 1000
      for (let i = 0; i < transcripts.length; i += 1000) {
        const batch = transcripts.slice(i, i + 1000);
        const { error } = await supabase.from('transcripts').upsert(batch, {
          onConflict: 'meeting_id,start_time,end_time',
        });

        if (error) {
          console.error(`❌ Error migrating batch:`, error);
        } else {
          totalMigrated += batch.length;
          process.stdout.write(`\r✓ Migrated ${totalMigrated} segments`);
        }
      }

      console.log(); // New line after batch
    }
  } while (lastEvaluatedKey);

  console.log(`\n✅ Transcript migration complete! Total segments migrated: ${totalMigrated}`);
}

// Main execution
(async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   DynamoDB to Supabase Migration Tool');
    console.log('═══════════════════════════════════════════════════════\n');

    if (!CALLS_TABLE_NAME || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing required environment variables:');
      console.error('   - CALLS_TABLE_NAME');
      console.error('   - SUPABASE_URL');
      console.error('   - SUPABASE_SERVICE_KEY');
      process.exit(1);
    }

    await migrateCallsTable();
    await migrateTranscriptSegments();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   Migration Complete! 🎉');
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
})();
