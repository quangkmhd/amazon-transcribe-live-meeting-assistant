const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const supabaseKey = 'sb_secret_1FgrfOTfPpyVZ4D47Wumgg_LwE5UPAN';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMeetings() {
  const { data, error } = await supabase
    .from('meetings')
    .select('meeting_id, agent_id, owner_email, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Latest Meetings:');
  console.log(JSON.stringify(data, null, 2));
}

checkMeetings();
