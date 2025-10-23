const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDkwNzEsImV4cCI6MjA3NjcyNTA3MX0.2t-yYdOLGSbI7EiPhUGqxeYO9vKyPJkEiLEl_Fuq3AY';

const supabase = createClient(supabaseUrl, anonKey);

(async () => {
  console.log('Testing login with newly created user...\n');
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'lma.testuser@gmail.com',
    password: 'TestPassword123!'
  });
  
  if (error) {
    console.error('❌ Login failed!');
    console.error('Error:', error.message);
    if (error.message.includes('confirmation') || error.message.includes('verify')) {
      console.log('\n⚠️  Email confirmation is REQUIRED.');
      console.log('   Go to Supabase Dashboard > Authentication > Users');
      console.log('   Or disable email confirmation: Settings > Authentication > Email Auth');
    }
  } else {
    console.log('✅ Login successful!');
    console.log('User ID:', data.user.id);
    console.log('Email:', data.user.email);
  }
})();
