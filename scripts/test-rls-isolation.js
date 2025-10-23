#!/usr/bin/env node

/**
 * Simple RLS Isolation Test Script
 * Tests that users can only see their own data through Supabase client
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Test credentials
const USER_A = {
  email: 'quangkmhd09344@gmail.com',
  password: process.env.USER_A_PASSWORD || 'Test@123456',
};

const USER_B = {
  email: 'lma.testuser@gmail.com',
  password: process.env.USER_B_PASSWORD || 'TestPassword123!',
};

async function testUserIsolation() {
  console.log('🔒 Testing Multi-Tenancy Data Isolation\n');
  console.log('=' .repeat(60));

  // Test User A
  console.log('\n📊 Testing User A:', USER_A.email);
  console.log('-'.repeat(60));
  
  const supabaseA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: sessionA, error: errorA } = await supabaseA.auth.signInWithPassword({
    email: USER_A.email,
    password: USER_A.password,
  });

  if (errorA) {
    console.error('❌ User A login failed:', errorA.message);
    console.log('⚠️  Please update USER_A.password in script');
  } else {
    console.log('✅ User A logged in successfully');
    
    // Query meetings for User A
    const { data: meetingsA, error: queryErrorA } = await supabaseA
      .from('meetings')
      .select('meeting_id, owner_email, title');
    
    if (queryErrorA) {
      console.error('❌ Query error:', queryErrorA.message);
    } else {
      console.log(`📋 User A can see ${meetingsA.length} meeting(s):`);
      meetingsA.forEach(m => {
        console.log(`   - ${m.meeting_id} (owner: ${m.owner_email})`);
        if (m.owner_email !== USER_A.email && !m.owner_email?.includes(USER_A.email)) {
          console.log('   ⚠️  WARNING: User A seeing other user\'s data!');
        }
      });
    }
    
    await supabaseA.auth.signOut();
  }

  // Test User B
  console.log('\n📊 Testing User B:', USER_B.email);
  console.log('-'.repeat(60));
  
  const supabaseB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: sessionB, error: errorB } = await supabaseB.auth.signInWithPassword({
    email: USER_B.email,
    password: USER_B.password,
  });

  if (errorB) {
    console.error('❌ User B login failed:', errorB.message);
    console.log('⚠️  Please update USER_B.password in script');
  } else {
    console.log('✅ User B logged in successfully');
    
    // Query meetings for User B
    const { data: meetingsB, error: queryErrorB } = await supabaseB
      .from('meetings')
      .select('meeting_id, owner_email, title');
    
    if (queryErrorB) {
      console.error('❌ Query error:', queryErrorB.message);
    } else {
      console.log(`📋 User B can see ${meetingsB.length} meeting(s):`);
      meetingsB.forEach(m => {
        console.log(`   - ${m.meeting_id} (owner: ${m.owner_email})`);
        if (m.owner_email !== USER_B.email && !m.owner_email?.includes(USER_B.email)) {
          console.log('   ⚠️  WARNING: User B seeing other user\'s data!');
        }
      });
    }
    
    await supabaseB.auth.signOut();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📝 Test Summary:');
  console.log('='.repeat(60));
  console.log('Expected: Each user only sees their own meetings');
  console.log('Database: Shared Supabase database');
  console.log('Security: Row Level Security (RLS) policies');
  console.log('\n✅ If no warnings appeared, multi-tenancy is working correctly!');
  console.log('');
}

// Run test
testUserIsolation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
