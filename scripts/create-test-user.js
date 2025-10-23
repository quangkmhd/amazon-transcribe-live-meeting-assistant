const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://awihrdgxogqwabwnlezq.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  console.error('Error: REACT_APP_SUPABASE_ANON_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTestUser(email, password) {
  console.log(`Creating test user: ${email}...`);
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${supabaseUrl}/auth/v1/callback`,
      data: {
        username: email.split('@')[0]
      }
    }
  });

  if (error) {
    console.error('Error creating user:', error);
    process.exit(1);
  }

  console.log('✅ Test user created successfully!');
  console.log('User ID:', data.user?.id);
  console.log('Email:', data.user?.email);
  console.log('\nCredentials:');
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  
  if (data.user && !data.user.confirmed_at) {
    console.log('\n⚠️  Note: Email confirmation may be required.');
    console.log('   Check Supabase dashboard to confirm the user or disable email confirmation.');
  }
}

const email = process.argv[2] || 'lma.testuser@gmail.com';
const password = process.argv[3] || 'TestPassword123!';
createTestUser(email, password);
