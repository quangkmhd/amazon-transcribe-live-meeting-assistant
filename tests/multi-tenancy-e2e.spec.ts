import { test, expect } from '@playwright/test';

/**
 * End-to-End Multi-Tenancy Test
 * Creates meetings for different users and verifies RLS isolation at the database level
 */

const SUPABASE_URL = 'https://awihrdgxogqwabwnlezq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDkwNzEsImV4cCI6MjA3NjcyNTA3MX0.2t-yYdOLGSbI7EiPhUGqxeYO9vKyPJkEiLEl_Fuq3AY';

const USER_A = {
  email: 'lma.testuser@gmail.com',
  password: 'TestPassword123!',
};

const USER_B = {
  email: 'lma.testuser.b@gmail.com',
  password: 'TestPasswordB123!',
};

test.describe('Multi-Tenancy End-to-End', () => {
  let userAToken: string;
  let userBToken: string;
  let userAMeetingId: string;
  let userBMeetingId: string;

  test.beforeAll(async ({ request }) => {
    // Login User A
    const loginA = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      data: {
        email: USER_A.email,
        password: USER_A.password,
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      }
    });
    expect(loginA.ok()).toBeTruthy();
    const authDataA = await loginA.json();
    userAToken = authDataA.access_token;

    // Login User B
    const loginB = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      data: {
        email: USER_B.email,
        password: USER_B.password,
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      }
    });
    expect(loginB.ok()).toBeTruthy();
    const authDataB = await loginB.json();
    userBToken = authDataB.access_token;
  });

  test('Create meeting for User A', async ({ request }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    userAMeetingId = `e2e-test-user-a-${timestamp}`;

    const response = await request.post(`${SUPABASE_URL}/rest/v1/meetings`, {
      data: {
        meeting_id: userAMeetingId,
        title: 'User A Test Meeting',
        agent_id: 'User A Agent',
        status: 'started',
        owner_email: USER_A.email,
        started_at: new Date().toISOString(),
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userAToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    });

    expect(response.ok()).toBeTruthy();
    const meeting = await response.json();
    console.log('Created User A Meeting:', meeting);
  });

  test('Create meeting for User B', async ({ request }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    userBMeetingId = `e2e-test-user-b-${timestamp}`;

    const response = await request.post(`${SUPABASE_URL}/rest/v1/meetings`, {
      data: {
        meeting_id: userBMeetingId,
        title: 'User B Test Meeting',
        agent_id: 'User B Agent',
        status: 'started',
        owner_email: USER_B.email,
        started_at: new Date().toISOString(),
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userBToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    });

    expect(response.ok()).toBeTruthy();
    const meeting = await response.json();
    console.log('Created User B Meeting:', meeting);
  });

  test('User A can only see their own meeting', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/meetings?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userAToken}`,
      }
    });

    expect(response.ok()).toBeTruthy();
    const meetings = await response.json();
    
    console.log(`User A sees ${meetings.length} meetings`);
    
    // All meetings should belong to User A
    meetings.forEach((meeting: any) => {
      expect(meeting.owner_email).toBe(USER_A.email);
      expect(meeting.owner_email).not.toBe(USER_B.email);
    });

    // Should not see User B's meeting
    const userBMeeting = meetings.find((m: any) => m.meeting_id === userBMeetingId);
    expect(userBMeeting).toBeUndefined();
  });

  test('User B can only see their own meeting', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/meetings?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userBToken}`,
      }
    });

    expect(response.ok()).toBeTruthy();
    const meetings = await response.json();
    
    console.log(`User B sees ${meetings.length} meetings`);
    
    // All meetings should belong to User B
    meetings.forEach((meeting: any) => {
      expect(meeting.owner_email).toBe(USER_B.email);
      expect(meeting.owner_email).not.toBe(USER_A.email);
    });

    // Should not see User A's meeting
    const userAMeeting = meetings.find((m: any) => m.meeting_id === userAMeetingId);
    expect(userAMeeting).toBeUndefined();
  });

  test('User A cannot access User B meeting by ID', async ({ request }) => {
    // Try to query User B's meeting directly
    const response = await request.get(`${SUPABASE_URL}/rest/v1/meetings?meeting_id=eq.${userBMeetingId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userAToken}`,
      }
    });

    expect(response.ok()).toBeTruthy();
    const meetings = await response.json();
    
    // Should return empty array due to RLS
    expect(meetings).toEqual([]);
  });

  test('User B cannot access User A meeting by ID', async ({ request }) => {
    // Try to query User A's meeting directly
    const response = await request.get(`${SUPABASE_URL}/rest/v1/meetings?meeting_id=eq.${userAMeetingId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userBToken}`,
      }
    });

    expect(response.ok()).toBeTruthy();
    const meetings = await response.json();
    
    // Should return empty array due to RLS
    expect(meetings).toEqual([]);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Delete test meetings
    await request.delete(`${SUPABASE_URL}/rest/v1/meetings?meeting_id=eq.${userAMeetingId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userAToken}`,
      }
    });

    await request.delete(`${SUPABASE_URL}/rest/v1/meetings?meeting_id=eq.${userBMeetingId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${userBToken}`,
      }
    });

    console.log('Cleanup completed');
  });
});
