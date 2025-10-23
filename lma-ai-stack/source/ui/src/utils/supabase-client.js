import { createClient } from '@supabase/supabase-js';
import supabaseConfig from '../supabase-config';

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

export const setSpeakerName = async (meetingId, speakerNumber, speakerName, speakerEmail = null) => {
  const { data, error } = await supabase.from('speaker_identity').upsert(
    {
      meeting_id: meetingId,
      speaker_number: speakerNumber,
      speaker_name: speakerName,
      speaker_email: speakerEmail,
      identified_at: new Date().toISOString(),
    },
    {
      onConflict: 'meeting_id,speaker_number',
    },
  );

  if (error) {
    throw new Error(`Failed to set speaker name: ${error.message}`);
  }

  return data;
};

export const getSpeakerIdentities = async (meetingId) => {
  const { data, error } = await supabase.from('speaker_identity').select('*').eq('meeting_id', meetingId);

  if (error) {
    throw new Error(`Failed to get speaker identities: ${error.message}`);
  }

  const speakerMap = {};
  if (data) {
    data.forEach((identity) => {
      speakerMap[identity.speaker_number] = {
        name: identity.speaker_name,
        email: identity.speaker_email,
      };
    });
  }

  return speakerMap;
};

export const getSpeakerName = async (meetingId, speakerNumber) => {
  const { data, error } = await supabase
    .from('speaker_identity')
    .select('speaker_name, speaker_email')
    .eq('meeting_id', meetingId)
    .eq('speaker_number', speakerNumber)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get speaker name: ${error.message}`);
  }

  return data;
};

export default supabase;
