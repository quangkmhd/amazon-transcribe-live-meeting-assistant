/**
 * Script to fix duration_ms for existing meetings in database
 * This calculates duration from transcript_events for meetings with duration_ms = 0 or null
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function calculateMeetingDuration(meetingId: string): Promise<number> {
  const { data, error } = await supabase
    .from('transcript_events')
    .select('start_time, end_time')
    .eq('meeting_id', meetingId)
    .order('start_time', { ascending: true });

  if (error || !data || data.length === 0) {
    console.log(`  ⚠️  No transcript events found for ${meetingId}`);
    return 0;
  }

  // Get first start_time and last end_time
  const firstSegment = data[0];
  const lastSegment = data[data.length - 1];
  
  const durationMs = lastSegment.end_time - firstSegment.start_time;
  return Math.max(0, durationMs);
}

async function fixMeetingDurations() {
  console.log('🚀 Starting duration fix for meetings...\n');

  // Get all meetings with duration_ms = 0 or null
  const { data: meetings, error } = await supabase
    .from('meetings')
    .select('meeting_id, status, duration_ms')
    .or('duration_ms.is.null,duration_ms.eq.0')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching meetings:', error);
    return;
  }

  console.log(`📊 Found ${meetings.length} meetings with missing duration\n`);

  let fixed = 0;
  let skipped = 0;

  for (const meeting of meetings) {
    console.log(`\n🔧 Processing: ${meeting.meeting_id}`);
    console.log(`   Status: ${meeting.status}`);

    try {
      const durationMs = await calculateMeetingDuration(meeting.meeting_id);
      
      if (durationMs > 0) {
        const { error: updateError } = await supabase
          .from('meetings')
          .update({ duration_ms: durationMs })
          .eq('meeting_id', meeting.meeting_id);

        if (updateError) {
          console.error(`   ❌ Error updating: ${updateError.message}`);
          skipped++;
        } else {
          const durationSeconds = (durationMs / 1000).toFixed(1);
          console.log(`   ✅ Updated duration: ${durationMs}ms (${durationSeconds}s)`);
          fixed++;
        }
      } else {
        console.log(`   ⏭️  Skipped: No transcript segments`);
        skipped++;
      }
    } catch (err) {
      console.error(`   ❌ Error processing: ${err}`);
      skipped++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 Summary:');
  console.log(`   Total meetings processed: ${meetings.length}`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log('='.repeat(60));
}

// Run the script
fixMeetingDurations()
  .then(() => {
    console.log('\n✨ Duration fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

