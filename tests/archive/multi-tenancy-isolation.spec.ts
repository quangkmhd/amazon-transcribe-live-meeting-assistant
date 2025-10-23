import { test, expect } from '@playwright/test';

/**
 * Multi-Tenancy Data Isolation Test
 * Verifies that each user can only see their own meetings
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Test users
const USER_A = {
  email: 'lma.testuser@gmail.com',
  password: process.env.USER_A_PASSWORD || 'TestPassword123!',
};

const USER_B = {
  email: 'lma.testuser.b@gmail.com', 
  password: process.env.USER_B_PASSWORD || 'TestPasswordB123!',
};

test.describe('Multi-Tenancy Data Isolation', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('User A can only see their own meetings', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // Clear storage after page loads
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Reload to ensure clean state
    await page.reload();
    
    // Wait for loading state to complete
    await page.waitForFunction(() => {
      const loadingText = document.body.textContent;
      return !loadingText?.includes('Loading...');
    }, { timeout: 10000 });
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/user-a-before-login.png' });
    
    // Now wait for login button
    await page.waitForSelector('button:has-text("Login with Email")', { timeout: 10000 });
    await page.click('button:has-text("Login with Email")');
    
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', USER_A.email);
    await page.fill('input[type="password"]', USER_A.password);
    await page.click('button:has-text("Sign In")');

    await page.waitForTimeout(3000);

    const meetings = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="meeting-row"]');
      return Array.from(rows).map(row => {
        const owner = row.getAttribute('data-owner');
        return { owner };
      });
    });

    console.log('User A Meetings:', meetings);

    meetings.forEach(meeting => {
      expect(meeting.owner).toBe(USER_A.email);
    });
  });

  test('User B can only see their own meetings', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // Clear storage after page loads
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Reload to ensure clean state
    await page.reload();
    
    // Wait for loading state to complete
    await page.waitForFunction(() => {
      const loadingText = document.body.textContent;
      return !loadingText?.includes('Loading...');
    }, { timeout: 10000 });
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/user-b-before-login.png' });
    
    await page.waitForSelector('button:has-text("Login with Email")', { timeout: 10000 });
    await page.click('button:has-text("Login with Email")');
    
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', USER_B.email);
    await page.fill('input[type="password"]', USER_B.password);
    await page.click('button:has-text("Sign In")');

    await page.waitForTimeout(3000);

    const meetings = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="meeting-row"]');
      return Array.from(rows).map(row => {
        const owner = row.getAttribute('data-owner');
        return { owner };
      });
    });

    console.log('User B Meetings:', meetings);

    meetings.forEach(meeting => {
      expect(meeting.owner).toBe(USER_B.email);
    });
  });

  test('Direct API test - User A cannot access User B meetings', async ({ request }) => {
    const SUPABASE_URL = 'https://awihrdgxogqwabwnlezq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDkwNzEsImV4cCI6MjA3NjcyNTA3MX0.2t-yYdOLGSbI7EiPhUGqxeYO9vKyPJkEiLEl_Fuq3AY';
    
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      data: {
        email: USER_A.email,
        password: USER_A.password,
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const authData = await loginResponse.json();
    const accessToken = authData.access_token;

    const meetingsResponse = await request.get(`${SUPABASE_URL}/rest/v1/meetings?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    expect(meetingsResponse.ok()).toBeTruthy();
    const meetings = await meetingsResponse.json();

    console.log('User A API Meetings:', meetings);

    meetings.forEach((meeting: any) => {
      expect([USER_A.email, null, undefined]).toContain(meeting.owner_email);
      expect(meeting.owner_email).not.toBe(USER_B.email);
    });
  });
});
