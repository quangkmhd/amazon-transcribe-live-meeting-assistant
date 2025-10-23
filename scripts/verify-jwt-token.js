const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://awihrdgxogqwabwnlezq.supabase.co';
const supabaseKey = 'sb_secret_1FgrfOTfPpyVZ4D47Wumgg_LwE5UPAN';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestMeeting() {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Latest Meeting:');
  console.log(JSON.stringify(data[0], null, 2));
}

checkLatestMeeting();
