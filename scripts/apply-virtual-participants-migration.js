/**
 * Script to apply the virtual_participants table migration to Supabase
 * This script reads the migration SQL file and applies it to the database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Required: SUPABASE_URL and SUPABASE_SERVICE_KEY');
  console.error('   Make sure they are set in your .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  try {
    console.log('🚀 Applying virtual_participants migration...');
    console.log(`   Supabase URL: ${SUPABASE_URL}\n`);

    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/009_create_virtual_participants.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded successfully');
    console.log('   File:', migrationPath);
    console.log('   Size:', migrationSQL.length, 'bytes\n');

    // Split SQL into individual statements (simple split by semicolon)
    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`   [${i + 1}/${statements.length}] Executing: ${statement.substring(0, 60)}...`);

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

        if (error) {
          // Check if error is about table already existing
          if (error.message.includes('already exists')) {
            console.log(`   ⚠️  Already exists (skipping)`);
          } else {
            throw error;
          }
        } else {
          console.log(`   ✅ Success`);
        }
      } catch (err) {
        // Some statements might fail if they already exist, that's okay
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`   ⚠️  Already exists (skipping)`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n✅ Migration applied successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Verify the table exists in Supabase dashboard');
    console.log('   2. Test creating a virtual participant in the UI');
    console.log('   3. Check realtime subscriptions are working\n');
  } catch (error) {
    console.error('\n❌ Error applying migration:', error);
    console.error('   Error details:', error.message);
    console.error('\n💡 Alternative: Apply migration manually using Supabase SQL Editor:');
    console.error('   1. Go to your Supabase dashboard');
    console.error('   2. Navigate to SQL Editor');
    console.error('   3. Copy and paste the contents of:');
    console.error('      supabase/migrations/009_create_virtual_participants.sql');
    console.error('   4. Click "Run" to execute\n');
    process.exit(1);
  }
}

// Run the migration
applyMigration();

