const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE0OTA3MSwiZXhwIjoyMDc2NzI1MDcxfQ.sb_secret_1FgrfOTfPpyVZ4D47Wumgg_LwE5UPAN';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  console.log('Fetching auth users...\n');
  
  const { data, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log(`Total users: ${data.users.length}\n`);
  
  data.users.forEach(user => {
    console.log('---');
    console.log('Email:', user.email);
    console.log('ID:', user.id);
    console.log('Email confirmed:', user.email_confirmed_at ? 'Yes ✓' : 'No ✗');
    console.log('Created:', user.created_at);
  });
  
  console.log('\n---\nSearching for quangkmhd09344@gmail.com...');
  const targetUser = data.users.find(u => u.email === 'quangkmhd09344@gmail.com');
  
  if (targetUser) {
    console.log('✓ User found!');
    console.log('Confirmed:', targetUser.email_confirmed_at ? 'Yes' : 'No');
  } else {
    console.log('✗ User NOT found');
  }
})();
