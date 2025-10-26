import { createClient } from '@supabase/supabase-js';
import supabaseConfig from '../supabase-config';

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

// Export supabase instance for use in other modules (named export for rag-client)
export { supabase };

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

/**
 * Share meetings with specified recipients
 * @param {Array} calls - Array of call objects with CallId, ListPK, ListSK
 * @param {string} meetingRecipients - Comma-separated list of email addresses
 * @returns {Promise<string>} - Success message
 */
export const shareMeetings = async (calls, meetingRecipients) => {
  try {
    // Get current user from Supabase auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    // Convert comma-separated string to array
    const recipientsArray = meetingRecipients.split(',').map((email) => email.trim());

    // Update each call's shared_with field
    const updatePromises = calls.map(async (call) => {
      const { data, error } = await supabase
        .from('meetings')
        .update({
          shared_with: recipientsArray,
          updated_at: new Date().toISOString(),
        })
        .eq('meeting_id', call.CallId)
        .select();

      if (error) {
        console.error(`Failed to share meeting ${call.CallId}:`, error);
        throw new Error(`Failed to share meeting ${call.CallId}: ${error.message}`);
      }

      return data;
    });

    await Promise.all(updatePromises);

    return 'Meetings shared successfully';
  } catch (error) {
    console.error('Error sharing meetings:', error);
    throw error;
  }
};

/**
 * Delete meetings and all related data
 * @param {Array} calls - Array of call objects with CallId, ListPK, ListSK
 * @returns {Promise<string>} - Success message
 */
export const deleteMeetings = async (calls) => {
  try {
    // Get current user from Supabase auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    // Delete all related data for each call
    const deletePromises = calls.map(async (call) => {
      const callId = call.CallId;

      // Delete in order: transcripts, speaker identities, then meeting entry
      // 1. Delete all transcript segments for this call
      const { error: transcriptError } = await supabase.from('transcripts').delete().eq('meeting_id', callId);

      if (transcriptError) {
        console.error(`Failed to delete transcripts for ${callId}:`, transcriptError);
      }

      // 2. Delete transcript events
      const { error: eventError } = await supabase.from('transcript_events').delete().eq('meeting_id', callId);

      if (eventError) {
        console.error(`Failed to delete transcript events for ${callId}:`, eventError);
      }

      // 3. Delete speaker identities
      const { error: speakerError } = await supabase.from('speaker_identity').delete().eq('meeting_id', callId);

      if (speakerError) {
        console.error(`Failed to delete speaker identities for ${callId}:`, speakerError);
      }

      // 4. Delete virtual participants associated with this call
      const { error: vpError } = await supabase.from('virtual_participants').delete().eq('call_id', callId);

      if (vpError) {
        console.error(`Failed to delete virtual participants for ${callId}:`, vpError);
      }

      // 5. Delete pipeline logs
      const { error: logError } = await supabase.from('pipeline_logs').delete().eq('call_id', callId);

      if (logError) {
        console.error(`Failed to delete pipeline logs for ${callId}:`, logError);
      }

      // 6. Delete meeting entry (main record)
      const { error: meetingError } = await supabase.from('meetings').delete().eq('meeting_id', callId);

      if (meetingError) {
        console.error(`Failed to delete meeting ${callId}:`, meetingError);
        throw new Error(`Failed to delete meeting ${callId}: ${meetingError.message}`);
      }

      return callId;
    });

    await Promise.all(deletePromises);

    return 'Meetings deleted successfully';
  } catch (error) {
    console.error('Error deleting meetings:', error);
    throw error;
  }
};

/**
 * Virtual Participant Functions
 */

/**
 * List all virtual participants for the current user
 * @returns {Promise<Array>} - Array of virtual participant objects
 */
export const listVirtualParticipants = async () => {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('virtual_participants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to list virtual participants:', error);
      throw new Error(`Failed to list virtual participants: ${error.message}`);
    }

    // Transform data to match expected format
    return data.map((vp) => ({
      id: vp.id,
      meetingName: vp.meeting_name,
      meetingPlatform: vp.meeting_platform,
      meetingId: vp.meeting_id,
      meetingPassword: vp.meeting_password,
      meetingTime: vp.meeting_time,
      scheduledFor: vp.scheduled_for,
      isScheduled: vp.is_scheduled,
      scheduleId: vp.schedule_id,
      status: vp.status,
      owner: vp.owner_email,
      Owner: vp.owner_email,
      SharedWith: vp.shared_with?.join(',') || '',
      createdAt: vp.created_at,
      updatedAt: vp.updated_at,
      CallId: vp.call_id,
    }));
  } catch (error) {
    console.error('Error listing virtual participants:', error);
    throw error;
  }
};

/**
 * Get a single virtual participant by ID
 * @param {string} id - Virtual participant ID
 * @returns {Promise<Object>} - Virtual participant object
 */
export const getVirtualParticipant = async (id) => {
  try {
    const { data, error } = await supabase.from('virtual_participants').select('*').eq('id', id).single();

    if (error) {
      throw new Error(`Failed to get virtual participant: ${error.message}`);
    }

    // Transform data to match expected format
    return {
      id: data.id,
      meetingName: data.meeting_name,
      meetingPlatform: data.meeting_platform,
      meetingId: data.meeting_id,
      meetingPassword: data.meeting_password,
      meetingTime: data.meeting_time,
      scheduledFor: data.scheduled_for,
      isScheduled: data.is_scheduled,
      scheduleId: data.schedule_id,
      status: data.status,
      owner: data.owner_email,
      Owner: data.owner_email,
      SharedWith: data.shared_with?.join(',') || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      CallId: data.call_id,
    };
  } catch (error) {
    console.error('Error getting virtual participant:', error);
    throw error;
  }
};

/**
 * Create a new virtual participant
 * @param {Object} input - Virtual participant input data
 * @returns {Promise<Object>} - Created virtual participant
 */
export const createVirtualParticipant = async (input) => {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('virtual_participants')
      .insert({
        meeting_name: input.meetingName,
        meeting_platform: input.meetingPlatform,
        meeting_id: input.meetingId,
        meeting_password: input.meetingPassword || null,
        meeting_time: input.meetingTime || null,
        is_scheduled: input.isScheduled || false,
        status: input.status,
        owner_email: user.email,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create virtual participant: ${error.message}`);
    }

    // Transform data to match expected format
    return {
      id: data.id,
      meetingName: data.meeting_name,
      meetingPlatform: data.meeting_platform,
      meetingId: data.meeting_id,
      status: data.status,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('Error creating virtual participant:', error);
    throw error;
  }
};

/**
 * Update virtual participant status
 * @param {string} id - Virtual participant ID
 * @param {string} status - New status
 * @param {string} callId - Optional call ID to associate
 * @returns {Promise<Object>} - Updated virtual participant
 */
export const updateVirtualParticipantStatus = async (id, status, callId = null) => {
  try {
    const updateData = { status };
    if (callId) {
      updateData.call_id = callId;
    }

    const { data, error } = await supabase
      .from('virtual_participants')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update virtual participant: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error updating virtual participant:', error);
    throw error;
  }
};

/**
 * Delete a virtual participant
 * @param {string} id - Virtual participant ID
 * @returns {Promise<void>}
 */
export const deleteVirtualParticipant = async (id) => {
  try {
    const { error } = await supabase.from('virtual_participants').delete().eq('id', id);

    if (error) {
      throw new Error(`Failed to delete virtual participant: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deleting virtual participant:', error);
    throw error;
  }
};

/**
 * Subscribe to virtual participant updates
 * @param {Function} callback - Callback function to handle updates
 * @returns {Object} - Subscription object with unsubscribe method
 */
export const subscribeToVirtualParticipantUpdates = (callback) => {
  const subscription = supabase
    .channel('virtual_participants_changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'virtual_participants',
      },
      (payload) => {
        // Transform data to match expected format
        const transformed = {
          id: payload.new.id,
          status: payload.new.status,
          updatedAt: payload.new.updated_at,
          meetingName: payload.new.meeting_name,
          owner: payload.new.owner_email,
          Owner: payload.new.owner_email,
          SharedWith: payload.new.shared_with?.join(',') || '',
        };
        callback(transformed);
      },
    )
    .subscribe();

  return {
    unsubscribe: () => subscription.unsubscribe(),
  };
};

export default supabase;
