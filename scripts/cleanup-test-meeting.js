const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanup() {
  const { data, error } = await supabase
    .from('meetings')
    .update({ status: 'ended' })
    .eq('meeting_id', 'Testing JWT Token Pass - 2025-10-23-08:48:29.184')
    .select();
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Meeting status updated to ended');
    console.log(data);
  }
}

cleanup();
