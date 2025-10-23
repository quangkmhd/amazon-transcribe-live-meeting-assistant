# Multi-Tenancy RLS Verification Test

## Test Plan

This document outlines the verification process for Row Level Security (RLS) policies that ensure data isolation between users.

## Expected Behavior

1. **User A** (`quangkmhd09344@gmail.com`) should only see their own 2 meetings
2. **User B** (`lma.testuser@gmail.com`) should only see their own 1 meeting
3. No user should see meetings belonging to other users
4. API queries should automatically filter by authenticated user

## Manual Verification Steps

### Step 1: Verify Database Policies
✅ RLS policies have been created for:
- meetings table
- transcripts table  
- transcript_events table
- speaker_identity table

### Step 2: Test User A Access
Login as User A and verify they only see 2 meetings:
- Test Stream - Validation - 2025-10-23-08:03:47.965
- Test Stream - Validation - 2025-10-23-08:03:10.159

### Step 3: Test User B Access
Login as User B and verify they only see 1 meeting:
- test-meeting-001

### Step 4: API Level Test
Direct Supabase query with authentication token should respect RLS policies.

## Automated Test Results

Run with: `npm run test:multi-tenancy`

Expected output:
- ✅ RLS policies active
- ✅ User A sees only their meetings
- ✅ User B sees only their meetings
- ✅ No cross-user data leakage
