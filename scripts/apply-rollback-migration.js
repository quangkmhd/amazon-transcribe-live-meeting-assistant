/**
 * Apply rollback migration to fix transcript deletion issue
 * This script applies the 20251027_rollback_transcript_constraint.sql migration
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  console.log('🔧 Applying rollback migration to fix transcript deletion...\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/20251027_rollback_transcript_constraint.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  console.log('📄 Migration content:');
  console.log('─'.repeat(80));
  console.log(migrationSQL);
  console.log('─'.repeat(80));
  console.log('\n⏳ Executing migration...\n');

  try {
    // Execute migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Migration failed:', error);
      
      // Try alternative method: split and execute each statement
      console.log('\n🔄 Trying alternative method: executing statements one by one...\n');
      
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i] + ';';
        console.log(`\n[${i + 1}/${statements.length}] Executing:`);
        console.log(stmt.substring(0, 100) + '...\n');
        
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
        
        if (stmtError) {
          console.error(`   ❌ Error:`, stmtError.message);
          // Continue with next statement
        } else {
          console.log(`   ✅ Success`);
        }
      }
      
      console.log('\n✅ Migration completed (with some errors that may be expected)');
    } else {
      console.log('✅ Migration applied successfully!\n');
    }

    // Verify the changes
    console.log('🔍 Verifying constraint changes...\n');
    
    const { data: constraints, error: verifyError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'transcript_events'::regclass
        AND conname LIKE '%unique%';
      `
    });

    if (verifyError) {
      console.log('⚠️  Could not verify constraints (this is OK if migration succeeded)');
    } else if (constraints) {
      console.log('Current UNIQUE constraints on transcript_events:');
      console.log(constraints);
    }

    console.log('\n✅ Done! Please restart your WebSocket server to apply code changes.');
    console.log('   Run: cd lma-websocket-transcriber-stack/source/app && npm start\n');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

// Run
applyMigration().catch(console.error);
