import { test, expect } from '@playwright/test';

test.describe('Speaker Identification UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3000/#/login');
    await page.waitForLoadState('networkidle');

    // Login with test credentials
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Sign In")');

    await emailInput.fill('lma.testuser@gmail.com');
    await passwordInput.fill('TestPassword123!');
    await loginButton.click();

    // Wait for successful login and redirect
    await page.waitForURL(/\/#\/(?!login)/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('should display speaker numbers in transcript', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const speakerLabel = page.locator('text=/Speaker \\d+/').first();
    await expect(speakerLabel).toBeVisible({ timeout: 10000 });
  });

  test('should open modal when clicking speaker number', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const clickableSpeaker = page.locator('button:has-text("Speaker")').first();
    await clickableSpeaker.waitFor({ state: 'visible', timeout: 10000 });
    await clickableSpeaker.click();

    const modal = page.locator('[role="dialog"]:has-text("Identify Speaker")');
    await expect(modal).toBeVisible();
    await expect(page.locator('text=/Identify Speaker \\d+/')).toBeVisible();
  });

  test('should save speaker name and display it', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const clickableSpeaker = page.locator('button:has-text("Speaker")').first();
    await clickableSpeaker.waitFor({ state: 'visible', timeout: 10000 });
    
    const speakerText = await clickableSpeaker.textContent();
    const speakerNumber = speakerText?.match(/Speaker (\d+)/)?.[1];
    
    await clickableSpeaker.click();

    const modal = page.locator('[role="dialog"]:has-text("Identify Speaker")');
    await expect(modal).toBeVisible();

    const testName = `Test User ${Date.now()}`;
    const nameInput = page.locator('input[placeholder*="John Smith"]');
    await nameInput.fill(testName);

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();

    await expect(modal).not.toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator(`text=/${testName}/`).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=/${testName} \\(Speaker ${speakerNumber}\\)/`).first()).toBeVisible();
  });

  test('should show error when saving empty name', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const clickableSpeaker = page.locator('button:has-text("Speaker")').first();
    await clickableSpeaker.waitFor({ state: 'visible', timeout: 10000 });
    await clickableSpeaker.click();

    const modal = page.locator('[role="dialog"]:has-text("Identify Speaker")');
    await expect(modal).toBeVisible();

    const nameInput = page.locator('input[placeholder*="John Smith"]');
    await nameInput.fill('');

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();

    await expect(page.locator('text=/Speaker name cannot be empty/')).toBeVisible();
    await expect(modal).toBeVisible();
  });

  test('should allow canceling modal', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const clickableSpeaker = page.locator('button:has-text("Speaker")').first();
    await clickableSpeaker.waitFor({ state: 'visible', timeout: 10000 });
    await clickableSpeaker.click();

    const modal = page.locator('[role="dialog"]:has-text("Identify Speaker")');
    await expect(modal).toBeVisible();

    const cancelButton = modal.locator('button:has-text("Cancel")');
    await cancelButton.click();

    await expect(modal).not.toBeVisible();
  });

  test('should persist speaker names across page refreshes', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const clickableSpeaker = page.locator('button:has-text("Speaker")').first();
    await clickableSpeaker.waitFor({ state: 'visible', timeout: 10000 });
    
    const speakerText = await clickableSpeaker.textContent();
    console.log('Speaker button text BEFORE save:', speakerText);
    const speakerNumber = speakerText?.match(/Speaker (\d+)/)?.[1];
    
    await clickableSpeaker.click();

    const modal = page.locator('[role="dialog"]:has-text("Identify Speaker")');
    await expect(modal).toBeVisible();

    const nameInput = page.locator('input[placeholder*="John Smith"]');
    const persistentName = `Persistent User ${Date.now()}`;
    await nameInput.fill(persistentName);

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();

    // Wait for modal to close and UI to update
    await expect(modal).not.toBeVisible();
    
    // Give React time to update the UI with the new speaker name
    await page.waitForTimeout(1000);
    
    // Check what's actually displayed now
    const updatedSpeakerText = await clickableSpeaker.textContent();
    console.log('Speaker button text AFTER save:', updatedSpeakerText);
    
    // Wait for the UI to update with the new speaker name
    await expect(page.locator(`button:has-text("${persistentName}")`).first()).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check for the full format: "{Name} (Speaker {number})"
    await expect(page.locator(`button:has-text("${persistentName}")`).first()).toBeVisible({ timeout: 10000 });

    await page.context().clearCookies();
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify name persists even after clearing cookies
    await expect(page.locator(`button:has-text("${persistentName}")`).first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle keyboard navigation for speaker buttons', async ({ page }) => {
    await page.goto('http://localhost:3000/#/calls/test-meeting-001');
    await page.waitForLoadState('networkidle');

    const clickableSpeaker = page.locator('button:has-text("Speaker")').first();
    await clickableSpeaker.waitFor({ state: 'visible', timeout: 10000 });
    
    await clickableSpeaker.focus();
    await page.keyboard.press('Enter');

    const modal = page.locator('[role="dialog"]:has-text("Identify Speaker")');
    await expect(modal).toBeVisible();
  });
});
