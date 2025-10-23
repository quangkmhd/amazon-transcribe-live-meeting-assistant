import { test, expect } from '@playwright/test';

/**
 * Multi-Tenancy Data Isolation Test
 * Verifies that each user can only see their own meetings
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Test users
const USER_A = {
  email: 'quangkmhd09344@gmail.com',
  password: process.env.USER_A_PASSWORD || 'quangkmhd623',
};

const USER_B = {
  email: 'lma.testuser@gmail.com', 
  password: process.env.USER_B_PASSWORD || 'test123456',
};

test.describe('Multi-Tenancy Data Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
  });

  test('User A can only see their own meetings', async ({ page }) => {
    // Login as User A
    await page.goto(`${FRONTEND_URL}/login`);
    await page.fill('input[type="email"]', USER_A.email);
    await page.fill('input[type="password"]', USER_A.password);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL(`${FRONTEND_URL}/calls`, { timeout: 10000 });

    // Get all meetings displayed
    await page.waitForTimeout(2000); // Wait for data to load

    // Check console for any loaded meetings
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().includes('Fetched meetings')) {
        consoleLogs.push(msg.text());
      }
    });

    // Reload to capture logs
    await page.reload();
    await page.waitForTimeout(3000);

    console.log('User A Console Logs:', consoleLogs);

    // Verify no meetings from User B are visible
    // This should be done by checking the DOM or API responses
    const meetings = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="meeting-row"]');
      return Array.from(rows).map(row => {
        const owner = row.getAttribute('data-owner');
        return { owner };
      });
    });

    console.log('User A Meetings:', meetings);

    // All meetings should belong to User A
    meetings.forEach(meeting => {
      expect(meeting.owner).toBe(USER_A.email);
    });
  });

  test('User B can only see their own meetings', async ({ page }) => {
    // Login as User B
    await page.goto(`${FRONTEND_URL}/login`);
    await page.fill('input[type="email"]', USER_B.email);
    await page.fill('input[type="password"]', USER_B.password);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL(`${FRONTEND_URL}/calls`, { timeout: 10000 });

    // Get all meetings displayed
    await page.waitForTimeout(2000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().includes('Fetched meetings')) {
        consoleLogs.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForTimeout(3000);

    console.log('User B Console Logs:', consoleLogs);

    const meetings = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="meeting-row"]');
      return Array.from(rows).map(row => {
        const owner = row.getAttribute('data-owner');
        return { owner };
      });
    });

    console.log('User B Meetings:', meetings);

    // All meetings should belong to User B
    meetings.forEach(meeting => {
      expect(meeting.owner).toBe(USER_B.email);
    });
  });

  test('Direct API test - User A cannot access User B meetings', async ({ request }) => {
    // This requires Supabase API key and proper auth
    // For now, we'll test via the frontend
    
    // Login as User A and get token
    const loginResponse = await request.post(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      data: {
        email: USER_A.email,
        password: USER_A.password,
      },
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY || '',
        'Content-Type': 'application/json',
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const authData = await loginResponse.json();
    const accessToken = authData.access_token;

    // Try to fetch all meetings
    const meetingsResponse = await request.get(`${process.env.SUPABASE_URL}/rest/v1/meetings?select=*`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    expect(meetingsResponse.ok()).toBeTruthy();
    const meetings = await meetingsResponse.json();

    console.log('User A API Meetings:', meetings);

    // All meetings should have owner_email matching User A
    meetings.forEach((meeting: any) => {
      expect([USER_A.email, null, undefined]).toContain(meeting.owner_email);
      expect(meeting.owner_email).not.toBe(USER_B.email);
    });
  });
});
