import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbHost = process.env.SUPABASE_DB_HOST;
const dbPort = process.env.SUPABASE_DB_PORT;
const dbName = process.env.SUPABASE_DB_NAME;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!dbHost || !dbPort || !dbName || !dbPassword) {
  console.error('❌ Missing database credentials in .env file');
  process.exit(1);
}

const pool = new Pool({
  host: dbHost,
  port: parseInt(dbPort),
  database: dbName,
  user: 'postgres',
  password: dbPassword,
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  console.log('🔧 Applying constraint fix migration...\n');

  const statements = [
    {
      name: 'Drop transcript_events constraint',
      sql: 'ALTER TABLE transcript_events DROP CONSTRAINT IF EXISTS transcript_events_unique_segment'
    },
    {
      name: 'Drop transcripts constraint',
      sql: 'ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_unique_segment'
    },
    {
      name: 'Add transcript_events constraint with end_time',
      sql: 'ALTER TABLE transcript_events ADD CONSTRAINT transcript_events_unique_segment UNIQUE(meeting_id, start_time, end_time, speaker_number)'
    },
    {
      name: 'Add transcripts constraint with end_time',
      sql: 'ALTER TABLE transcripts ADD CONSTRAINT transcripts_unique_segment UNIQUE(meeting_id, start_time, end_time, speaker_number)'
    },
    {
      name: 'Drop translated_text column',
      sql: 'ALTER TABLE transcript_events DROP COLUMN IF EXISTS translated_text'
    },
    {
      name: 'Drop target_language column',
      sql: 'ALTER TABLE transcript_events DROP COLUMN IF EXISTS target_language'
    },
    {
      name: 'Drop translation index',
      sql: 'DROP INDEX IF EXISTS idx_transcript_events_translation'
    },
    {
      name: 'Drop old transcript_events speaker index',
      sql: 'DROP INDEX IF EXISTS idx_transcript_events_speaker'
    },
    {
      name: 'Drop old transcripts speaker index',
      sql: 'DROP INDEX IF EXISTS idx_transcripts_speaker'
    },
    {
      name: 'Create new transcript_events speaker index',
      sql: 'CREATE INDEX IF NOT EXISTS idx_transcript_events_speaker ON transcript_events(meeting_id, speaker_number, start_time, end_time)'
    },
    {
      name: 'Create new transcripts speaker index',
      sql: 'CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON transcripts(meeting_id, speaker_number, start_time, end_time)'
    },
    {
      name: 'Add comment to table',
      sql: "COMMENT ON TABLE transcript_events IS 'Rollback applied 2025-10-27: Fixed UNIQUE constraint to prevent token deletion'"
    }
  ];

  let successCount = 0;
  let failCount = 0;

  const client = await pool.connect();
  
  try {
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      process.stdout.write(`[${i + 1}/${statements.length}] ${statement.name}... `);
      
      try {
        await client.query(statement.sql);
        console.log('✅');
        successCount++;
      } catch (err: any) {
        console.log('❌');
        console.error(`   Error: ${err.message}`);
        failCount++;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n📊 Summary: ${successCount} successful, ${failCount} failed`);
  
  if (failCount === 0) {
    console.log('✅ Migration completed successfully!');
    console.log('\n🔄 Please restart your WebSocket server:');
    console.log('   cd lma-websocket-transcriber-stack/source/app && npm start');
  } else {
    console.log('⚠️  Migration completed with some errors');
  }
}

applyMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
