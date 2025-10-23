const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE0OTA3MSwiZXhwIjoyMDc2NzI1MDcxfQ.YOgvEiDgQTd7Sl8y0j3gLMauxKpMNxzc_KbIxvnqt4M';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function confirmUser(email) {
  console.log(`Confirming user: ${email}...`);
  
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }
  
  const user = users.users.find(u => u.email === email);
  
  if (!user) {
    console.error('User not found');
    return;
  }
  
  console.log('Found user:', user.id);
  
  const { data, error } = await supabase.auth.admin.updateUserById(
    user.id,
    { email_confirm: true }
  );
  
  if (error) {
    console.error('Error confirming user:', error);
    return;
  }
  
  console.log('✅ User confirmed successfully!');
}

const email = process.argv[2] || 'lma.stage6test@gmail.com';
confirmUser(email);
