/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'stream';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const RECORDINGS_BUCKET_NAME = process.env.RECORDINGS_BUCKET_NAME!;
const RECORDING_PREFIX = process.env.RECORDING_FILE_PREFIX || 'lma-audio-recordings/';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const s3Client = new S3Client({ region: AWS_REGION });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function updateMeetingRecordingUrl(
  meetingId: string,
  newUrl: string,
  fileSize: number
) {
  const { error } = await supabase
    .from('meetings')
    .update({
      recording_url: newUrl,
      recording_size: fileSize,
    })
    .eq('meeting_id', meetingId);

  if (error) {
    console.error(`  ⚠️  Could not update meeting record:`, error.message);
  }
}

async function migrateRecordings() {
  console.log('🚀 Starting S3 → Supabase Storage migration...');
  console.log(`Source: s3://${RECORDINGS_BUCKET_NAME}/${RECORDING_PREFIX}`);
  console.log(`Destination: Supabase Storage bucket "meeting-recordings"\n`);

  let totalMigrated = 0;
  let totalSize = 0;
  let continuationToken: string | undefined;

  do {
    // List recordings from S3
    const listCommand = new ListObjectsV2Command({
      Bucket: RECORDINGS_BUCKET_NAME,
      Prefix: RECORDING_PREFIX,
      ContinuationToken: continuationToken,
      MaxKeys: 50, // Process 50 files at a time
    });

    const listResponse = await s3Client.send(listCommand);
    const files = listResponse.Contents || [];
    continuationToken = listResponse.NextContinuationToken;

    console.log(`📦 Processing batch: ${files.length} files found`);

    for (const file of files) {
      if (!file.Key) continue;

      // Skip if it's a directory marker
      if (file.Key.endsWith('/')) continue;

      try {
        // Extract filename and meeting ID
        const fileName = file.Key.split('/').pop()!;
        const meetingId = fileName.replace(/\.(wav|raw)$/, '');

        console.log(`  📄 ${fileName} (${(file.Size! / 1024 / 1024).toFixed(2)} MB)`);

        // Download from S3
        const getCommand = new GetObjectCommand({
          Bucket: RECORDINGS_BUCKET_NAME,
          Key: file.Key,
        });

        const s3Response = await s3Client.send(getCommand);
        const stream = s3Response.Body as Readable;
        const buffer = await streamToBuffer(stream);

        // Determine content type
        const contentType = fileName.endsWith('.wav')
          ? 'audio/wav'
          : fileName.endsWith('.mp3')
          ? 'audio/mpeg'
          : 'audio/raw';

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('meeting-recordings')
          .upload(fileName, buffer, {
            contentType,
            upsert: true,
          });

        if (error) {
          console.error(`    ❌ Upload failed:`, error.message);
          continue;
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('meeting-recordings').getPublicUrl(fileName);

        // Update meeting record with new URL
        await updateMeetingRecordingUrl(
          meetingId,
          publicUrl,
          buffer.length
        );

        totalMigrated++;
        totalSize += buffer.length;
        console.log(`    ✓ Uploaded to: ${publicUrl}`);
      } catch (error: any) {
        console.error(`    ❌ Error migrating ${file.Key}:`, error.message);
      }
    }

    if (files.length > 0) {
      console.log(
        `\n📊 Progress: ${totalMigrated} files (${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)\n`
      );
    }
  } while (continuationToken);

  return { totalMigrated, totalSize };
}

// Main execution
(async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   S3 to Supabase Storage Migration Tool');
    console.log('═══════════════════════════════════════════════════════\n');

    if (
      !RECORDINGS_BUCKET_NAME ||
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_KEY
    ) {
      console.error('❌ Missing required environment variables:');
      console.error('   - RECORDINGS_BUCKET_NAME');
      console.error('   - SUPABASE_URL');
      console.error('   - SUPABASE_SERVICE_KEY');
      console.error('\nOptional:');
      console.error('   - AWS_REGION (default: us-east-1)');
      console.error('   - RECORDING_FILE_PREFIX (default: lma-audio-recordings/)');
      process.exit(1);
    }

    const { totalMigrated, totalSize } = await migrateRecordings();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   Migration Complete! 🎉');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total files migrated: ${totalMigrated}`);
    console.log(`Total size: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
})();

