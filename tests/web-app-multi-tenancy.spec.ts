import { test, expect } from '@playwright/test';

const SUPABASE_URL = 'https://awihrdgxogqwabwnlezq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3aWhyZGd4b2dxd2Fid25sZXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDkwNzEsImV4cCI6MjA3NjcyNTA3MX0.2t-yYdOLGSbI7EiPhUGqxeYO9vKyPJkEiLEl_Fuq3AY';

const WEB_APP_URL = 'http://localhost:3001';

const USER_A = {
  email: 'lma.testuser@gmail.com',
  password: 'TestPassword123!',
  id: 'f6203f15-ca9f-4158-aa25-7f5f883efbaa'
};

const USER_B = {
  email: 'lma.testuser.b@gmail.com',
  password: 'TestPasswordB123!',
  id: '3596af60-d2ae-4c5a-ad1e-568043ecd057'
};

test.describe('Web App Multi-Tenancy UI Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(WEB_APP_URL);
  });

  test('User A can only see their own meetings in the UI', async ({ page }) => {
    await page.goto(WEB_APP_URL);
    
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', USER_A.email);
    await page.fill('input[type="password"]', USER_A.password);
    
    await page.click('button[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const meetingsVisible = await page.isVisible('text=Meetings');
    if (!meetingsVisible) {
      await page.click('text=Calls');
    }
    
    await page.waitForSelector('[data-testid="meetings-table"], table, [role="table"]', { timeout: 15000 });
    
    const tableContent = await page.textContent('body');
    
    expect(tableContent).toContain('Meetings');
    
    const hasUserBEmail = tableContent?.includes(USER_B.email);
    expect(hasUserBEmail).toBe(false);
  });

  test('User B can only see their own meetings in the UI', async ({ page }) => {
    await page.goto(WEB_APP_URL);
    
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', USER_B.email);
    await page.fill('input[type="password"]', USER_B.password);
    
    await page.click('button[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const meetingsVisible = await page.isVisible('text=Meetings');
    if (!meetingsVisible) {
      await page.click('text=Calls');
    }
    
    await page.waitForSelector('[data-testid="meetings-table"], table, [role="table"]', { timeout: 15000 });
    
    const tableContent = await page.textContent('body');
    
    expect(tableContent).toContain('Meetings');
    
    const hasUserAEmail = tableContent?.includes(USER_A.email);
    expect(hasUserAEmail).toBe(false);
  });

  test('User A and User B see different meetings (separate sessions)', async ({ browser }) => {
    // User A session
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    
    await pageA.goto(WEB_APP_URL);
    await pageA.waitForSelector('input[type="email"]', { timeout: 10000 });
    await pageA.fill('input[type="email"]', USER_A.email);
    await pageA.fill('input[type="password"]', USER_A.password);
    await pageA.click('button[type="submit"]');
    
    await pageA.waitForLoadState('networkidle');
    await pageA.waitForTimeout(2000);
    await pageA.waitForSelector('table, [role="table"], main', { timeout: 10000 });
    
    const userAContent = await pageA.textContent('body');
    
    await contextA.close();
    
    // User B session
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    
    await pageB.goto(WEB_APP_URL);
    await pageB.waitForSelector('input[type="email"]', { timeout: 10000 });
    await pageB.fill('input[type="email"]', USER_B.email);
    await pageB.fill('input[type="password"]', USER_B.password);
    await pageB.click('button[type="submit"]');
    
    await pageB.waitForLoadState('networkidle');
    await pageB.waitForTimeout(2000);
    await pageB.waitForSelector('table, [role="table"], main', { timeout: 10000 });
    
    const userBContent = await pageB.textContent('body');
    
    await contextB.close();
    
    // Verify different content
    expect(userAContent).not.toBe(userBContent);
    expect(userAContent).toContain('Meetings');
    expect(userBContent).toContain('Meetings');
  });

  test('Verify table rows contain correct owner_email via API', async ({ page }) => {
    const response = await page.request.get(`${SUPABASE_URL}/rest/v1/meetings?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    expect(response.ok()).toBe(true);
    
    const meetings = await response.json();
    
    for (const meeting of meetings) {
      expect(meeting).toHaveProperty('owner_email');
      expect([USER_A.email, USER_B.email]).toContain(meeting.owner_email);
    }
  });

  test('Direct table inspection - verify no cross-user data leakage', async ({ page }) => {
    await page.goto(WEB_APP_URL);
    
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', USER_A.email);
    await page.fill('input[type="password"]', USER_A.password);
    await page.click('button[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const tableRows = await page.$$('tr');
    
    for (const row of tableRows) {
      const rowText = await row.textContent();
      if (rowText?.includes(USER_B.email)) {
        throw new Error(`SECURITY VIOLATION: User A can see User B's email: ${rowText}`);
      }
    }
  });
});
