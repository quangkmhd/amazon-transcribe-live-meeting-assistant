# Data Migration Scripts - AWS to Supabase

## Overview

These scripts migrate data from AWS services to Supabase:

1. **DynamoDB → Supabase PostgreSQL**: Meetings and transcript segments
2. **S3 → Supabase Storage**: Audio recordings

## Prerequisites

- Node.js 16+ installed
- AWS credentials configured (for reading from DynamoDB/S3)
- Supabase project with schema applied
- Environment variables set

## Installation

```bash
cd scripts
npm install
```

## Environment Variables

Create a `.env` file in the `scripts/` directory:

```bash
# AWS Configuration (source)
AWS_REGION=us-east-1
CALLS_TABLE_NAME=your-dynamodb-table-name
RECORDINGS_BUCKET_NAME=your-s3-bucket-name
RECORDING_FILE_PREFIX=lma-audio-recordings/

# Supabase Configuration (destination)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Usage

### Migrate DynamoDB Data

Migrates meetings and transcript segments:

```bash
npm run migrate:dynamodb
```

**What it does:**
- Scans entire DynamoDB table
- Filters Call entities (PK starts with `c#`)
- Filters TranscriptSegment entities (SK starts with `ts#`)
- Transforms to Supabase schema
- Upserts to `meetings` and `transcripts` tables
- Handles duplicates gracefully

**Duration:** ~1 minute per 1000 records

### Migrate S3 Recordings

Migrates audio recording files:

```bash
npm run migrate:s3
```

**What it does:**
- Lists all objects in S3 bucket
- Downloads each recording
- Uploads to Supabase Storage bucket `meeting-recordings`
- Updates meeting records with new URLs
- Preserves file metadata

**Duration:** Depends on file sizes (estimate ~1GB per 5 minutes)

### Migrate Everything

Run both migrations sequentially:

```bash
npm run migrate:all
```

**Recommended order:**
1. DynamoDB migration (creates meeting records)
2. S3 migration (updates meeting records with recording URLs)

## Safety Features

### Idempotent Operations

All scripts can be run multiple times safely:
- DynamoDB migration uses `upsert` with `meeting_id` conflict resolution
- S3 migration uses `upsert: true` to overwrite existing files
- Duplicate transcripts are handled by UNIQUE constraint

### Progress Tracking

Both scripts provide real-time progress:
```
📦 Processing batch: 100 meetings found
✓ Migrated 1 meetings
✓ Migrated 2 meetings
...
✅ Migration complete! Total meetings migrated: 1523
```

### Error Handling

Errors are logged but don't stop migration:
```
❌ Error migrating meeting abc-123: duplicate key value
✓ Migrated 2 meetings (continuing...)
```

## Verification

After migration, verify data:

### Check Meeting Count

```sql
-- In Supabase SQL Editor
SELECT COUNT(*) FROM meetings;
SELECT COUNT(*) FROM transcripts;
```

### Check Storage Files

1. Go to Supabase Dashboard → Storage
2. Open `meeting-recordings` bucket
3. Verify files are uploaded

### Spot Check Data

Compare a few records:

```sql
-- Get a random meeting
SELECT * FROM meetings ORDER BY created_at DESC LIMIT 1;

-- Check its transcripts
SELECT COUNT(*) FROM transcripts 
WHERE meeting_id = 'your-meeting-id';
```

Compare with DynamoDB using AWS Console or CLI.

## Rollback

If migration fails or data is incorrect:

### Clear Supabase Data

```sql
-- WARNING: This deletes all data!
TRUNCATE TABLE transcripts;
TRUNCATE TABLE transcript_events;
TRUNCATE TABLE meetings CASCADE;
```

### Delete Storage Files

```sql
-- In Supabase SQL Editor
SELECT storage.empty_bucket('meeting-recordings');
```

Then re-run migration.

## Performance Tips

### Large Datasets

For > 10,000 meetings or > 10GB of recordings:

1. **Increase batch size** in scripts (change `Limit` parameter)
2. **Run in parallel**: Split by date ranges
3. **Use EC2**: Run from AWS EC2 for faster S3 access

### Network Issues

If migration is interrupted:
- Simply re-run the script
- It will skip already-migrated data
- Continue from where it left off

## Troubleshooting

### "Access Denied" Error

Check AWS credentials:
```bash
aws sts get-caller-identity
aws dynamodb scan --table-name $CALLS_TABLE_NAME --limit 1
```

### "Invalid Supabase URL"

Verify environment variables:
```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY
```

### "Table does not exist"

Apply Supabase schema first:
```bash
cd ../supabase
supabase db push
```

### Out of Memory

Reduce batch size in scripts:
```typescript
// In migrate-dynamodb-to-supabase.ts
Limit: 50, // Reduce from 100
```

## Cost Considerations

### AWS Costs

- **DynamoDB**: Read capacity units (~$0.25 per million)
- **S3**: GET requests (~$0.0004 per 1000) + data transfer out (~$0.09/GB)

### Supabase Costs

- Free tier: 500MB database + 1GB storage
- Pro tier: Unlimited for $25/month

### Example

Migrating 5000 meetings + 5GB recordings:
- AWS costs: ~$0.50 (one-time)
- Supabase: Free tier sufficient or $25/month (Pro)

## Advanced Usage

### Filter by Date

Modify scripts to migrate only recent data:

```typescript
// In sendSetCallsForPeriod()
const startDate = new Date('2024-01-01');
const scanCommand = new ScanCommand({
  TableName: CALLS_TABLE_NAME,
  FilterExpression: 'CreatedAt >= :start',
  ExpressionAttributeValues: {
    ':start': { S: startDate.toISOString() }
  }
});
```

### Dry Run

Test without actually writing to Supabase:

```typescript
// Comment out the upsert line
// const { error } = await supabase.from('meetings').upsert(meeting);
console.log('Would migrate:', meeting);
```

## Support

If you encounter issues:

1. Check logs for error messages
2. Verify environment variables
3. Test with a small subset first
4. Review Supabase Dashboard logs
5. Check AWS CloudWatch for source issues

## Next Steps

After successful migration:

1. ✅ Verify data integrity
2. ✅ Test UI with migrated data
3. ✅ Update application to use Supabase
4. ✅ Keep AWS data for 30 days (rollback plan)
5. ✅ Delete AWS resources after confirmation

