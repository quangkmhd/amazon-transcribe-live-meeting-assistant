const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDkwNzEsImV4cCI6MjA3NjcyNTA3MX0.2t-yYdOLGSbI7EiPhUGqxeYO9vKyPJkEiLEl_Fuq3AY';

const supabase = createClient(supabaseUrl, anonKey);

(async () => {
  console.log('Testing sign-in with email/password...\n');
  
  const email = 'quangkmhd09344@gmail.com';
  const password = 'Quang093442';
  
  console.log(`Email: ${email}`);
  console.log(`Password: ${password.slice(0, 4)}***\n`);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    console.error('❌ Sign-in failed!');
    console.error('Error:', error.message);
    console.error('Code:', error.status);
    console.error('\nFull error:', JSON.stringify(error, null, 2));
  } else {
    console.log('✅ Sign-in successful!');
    console.log('User ID:', data.user.id);
    console.log('Email:', data.user.email);
    console.log('Session:', data.session ? 'Active' : 'None');
  }
})();
