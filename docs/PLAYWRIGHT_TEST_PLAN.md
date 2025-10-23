# 🎭 Playwright UI Testing Plan

## Overview
Complete UI testing plan using MCP Playwright for LMA web interface.

## Prerequisites
- ✅ Supabase database configured
- ✅ Web UI running on http://localhost:3000
- ✅ WebSocket server running on ws://localhost:8080
- ✅ Playwright browser installed

## Test Suites

### 1. Home Page Tests
- [ ] Navigate to homepage
- [ ] Verify page title
- [ ] Check navigation menu
- [ ] Verify logo and branding
- [ ] Test responsive layout

### 2. Meetings List Tests
- [ ] Navigate to meetings page
- [ ] Verify empty state
- [ ] Check table headers
- [ ] Test search functionality
- [ ] Test filtering options
- [ ] Verify pagination

### 3. Create Meeting Tests
- [ ] Click "New Meeting" button
- [ ] Fill in meeting details
- [ ] Verify form validation
- [ ] Submit and verify creation
- [ ] Check realtime updates

### 4. Meeting Details Tests
- [ ] Open meeting details
- [ ] Verify meeting information
- [ ] Check transcript display
- [ ] Test speaker labels
- [ ] Verify timestamps
- [ ] Test audio playback

### 5. Realtime Transcript Tests
- [ ] Start new meeting
- [ ] Verify WebSocket connection
- [ ] Send test audio
- [ ] Watch transcripts appear
- [ ] Check speaker detection
- [ ] Verify formatting

### 6. Search & Filter Tests
- [ ] Search by meeting title
- [ ] Filter by date range
- [ ] Filter by speaker
- [ ] Filter by status
- [ ] Test combined filters

### 7. Settings Tests
- [ ] Navigate to settings
- [ ] Update user preferences
- [ ] Test theme switching
- [ ] Verify save functionality
- [ ] Check API key display

### 8. Error Handling Tests
- [ ] Test offline mode
- [ ] Verify error messages
- [ ] Test connection loss
- [ ] Check retry mechanisms
- [ ] Verify error boundaries

## Automated Test Scripts

### Quick Start Test
```javascript
// Test 1: Homepage loads
await page.goto('http://localhost:3000');
await expect(page).toHaveTitle(/LMA/);

// Test 2: Navigate to meetings
await page.click('text=Meetings');
await expect(page).toHaveURL(/meetings/);

// Test 3: Check empty state
await expect(page.locator('text=No meetings')).toBeVisible();
```

### Create Meeting Test
```javascript
// Navigate and create
await page.click('text=New Meeting');
await page.fill('[name="title"]', 'Test Meeting');
await page.click('text=Start Meeting');

// Verify creation
await expect(page.locator('text=Test Meeting')).toBeVisible();
```

### Realtime Transcript Test
```javascript
// Subscribe to realtime
const ws = new WebSocket('ws://localhost:8080');
ws.send(JSON.stringify({
  type: 'startMeeting',
  meetingId: 'test-001'
}));

// Verify UI updates
await expect(page.locator('.transcript-item')).toHaveCount(1);
```

## Test Data Setup

### Sample Meetings
```sql
INSERT INTO meetings (meeting_id, title, status) VALUES
  ('test-meeting-001', 'Sales Call - Q1 2025', 'completed'),
  ('test-meeting-002', 'Team Standup', 'in_progress'),
  ('test-meeting-003', 'Client Demo', 'started');
```

### Sample Transcripts
```sql
INSERT INTO transcripts (meeting_id, transcript, speaker_name) VALUES
  ('test-meeting-001', 'Welcome everyone to this meeting', 'John'),
  ('test-meeting-001', 'Thank you for joining', 'Sarah');
```

## Coverage Goals
- [x] Unit tests: 80%+ coverage
- [ ] Integration tests: 60%+ coverage
- [ ] E2E tests: 40%+ coverage
- [ ] Visual regression: Key pages
- [ ] Performance: Load time < 2s
- [ ] Accessibility: WCAG AA compliance

## Tools & Framework
- **Browser:** Chromium, Firefox, WebKit
- **Language:** TypeScript/JavaScript
- **Framework:** Playwright Test
- **Assertions:** expect (Playwright)
- **CI/CD:** GitHub Actions

## Running Tests

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Suite
```bash
npm run test:e2e -- meetings
```

### Run with UI
```bash
npm run test:e2e -- --ui
```

### Generate Report
```bash
npm run test:e2e -- --reporter=html
```

## Next Steps
1. Install Playwright if not already: `npm install @playwright/test`
2. Configure playwright.config.ts
3. Write test specs in `tests/` directory
4. Run and verify all tests pass
5. Integrate with CI/CD pipeline

