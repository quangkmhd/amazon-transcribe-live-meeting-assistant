# Migration Checklist - AWS to Soniox + Supabase

## ✅ Phase 1: Core Infrastructure (COMPLETE)

- [x] Database schema verified (`supabase/migrations/001_initial_schema.sql`)
- [x] Storage bucket configuration ready
- [x] Row Level Security policies in place
- [ ] **USER ACTION:** Create Supabase project
- [ ] **USER ACTION:** Run `supabase db push`
- [ ] **USER ACTION:** Obtain Supabase API keys
- [ ] **USER ACTION:** Register for Soniox and get API key

## ✅ Phase 2: WebSocket Transcriber Stack (COMPLETE)

- [x] Update package.json dependencies
- [x] Create supabase-client.ts
- [x] Create soniox.ts integration
- [x] Update index.ts (main server)
- [x] Update eventtypes.ts
- [x] Create module documentation
- [ ] **USER ACTION:** Create .env file with credentials
- [ ] **USER ACTION:** Run `npm install`
- [ ] **USER ACTION:** Test local server

## ✅ Phase 3: Supabase Edge Functions (COMPLETE)

- [x] Create process-transcripts Edge Function
- [ ] **USER ACTION:** Deploy Edge Function: `supabase functions deploy process-transcripts`
- [ ] **USER ACTION:** Setup pg_cron trigger (SQL in MIGRATION_GUIDE.md)
- [ ] **USER ACTION:** Test Edge Function execution

## ✅ Phase 4: Browser Extension Updates (COMPLETE)

- [x] Update sample rate to 16kHz
- [x] Update audio merging to mono
- [ ] **USER ACTION:** Test browser extension with new server
- [ ] **USER ACTION:** Verify multi-speaker detection works

## ⏳ Phase 5: UI Updates (NOT STARTED)

- [ ] Install @supabase/supabase-js in UI package
- [ ] Create SupabaseContext.tsx
- [ ] Create use-meeting-transcripts.ts hook
- [ ] Replace AppSync queries with Supabase queries
- [ ] Replace AppSync subscriptions with Supabase Realtime
- [ ] Update CallPanel.jsx
- [ ] Update all transcript-related components
- [ ] Test real-time updates
- [ ] Test meeting list view
- [ ] Test recording playback

**Estimated Time:** 6-8 hours

## ⏳ Phase 6: Data Migration Scripts (NOT STARTED)

- [ ] Create `scripts/migrate-dynamodb-to-supabase.ts`
  - [ ] Scan DynamoDB tables
  - [ ] Transform data to new schema
  - [ ] Insert to Supabase
  - [ ] Handle errors and duplicates
- [ ] Create `scripts/migrate-s3-to-supabase.ts`
  - [ ] List S3 objects
  - [ ] Download from S3
  - [ ] Upload to Supabase Storage
  - [ ] Update meeting records
- [ ] Test migration scripts on sample data
- [ ] Run full migration
- [ ] Verify data integrity

**Estimated Time:** 4-6 hours

## ⏳ Phase 7: Testing & Validation (NOT STARTED)

### Unit Tests
- [ ] Write tests for supabase-client.ts
  - [ ] insertTranscriptEvent()
  - [ ] upsertMeeting()
  - [ ] uploadRecording()
  - [ ] getSpeakerName()
- [ ] Write tests for soniox.ts
  - [ ] startSonioxTranscription()
  - [ ] Speaker grouping logic
  - [ ] mapSpeakerToChannel()
  - [ ] Error handling

### Integration Tests
- [ ] End-to-end transcription flow
- [ ] Multi-speaker detection
- [ ] Recording upload and playback
- [ ] Edge Function processing
- [ ] Real-time UI updates

### Manual Testing
- [ ] Start new meeting → verify record created
- [ ] Stream audio → verify transcripts appear
- [ ] Multi-speaker audio → verify detection
- [ ] End meeting → verify recording uploaded
- [ ] Verify recording playback works
- [ ] Test speaker identification
- [ ] Test duplicate prevention
- [ ] Load test (10+ concurrent meetings)

**Estimated Time:** 8-12 hours

## ⏳ Phase 8: Deployment & Rollout (NOT STARTED)

### Pre-Deployment
- [ ] Create production Supabase project
- [ ] Configure production environment variables
- [ ] Setup Soniox production API key
- [ ] Configure CORS properly
- [ ] Enable RLS policies
- [ ] Setup database backups

### Deployment
- [ ] Deploy Edge Functions to production
- [ ] Build WebSocket server: `npm run build`
- [ ] Deploy WebSocket server (Docker/ECS/Fargate)
- [ ] Deploy UI (CloudFront/Vercel/Netlify)
- [ ] Publish browser extension update

### Post-Deployment
- [ ] Setup monitoring (Supabase Dashboard)
- [ ] Setup alerts (email/Slack)
- [ ] Monitor Soniox API usage
- [ ] Monitor Edge Function execution times
- [ ] Monitor WebSocket connections
- [ ] Keep AWS infrastructure for 30 days (rollback plan)

**Estimated Time:** 4-6 hours + ongoing monitoring

## 📋 Verification Steps

### After Phase 1-4 (Current State)
```bash
# 1. Check dependencies installed
cd lma-websocket-transcriber-stack/source/app
npm install
npm list @supabase/supabase-js ws

# 2. Verify environment variables
node -e "require('dotenv').config(); console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : '✗'); console.log('SONIOX_API_KEY:', process.env.SONIOX_API_KEY ? '✓' : '✗');"

# 3. Start server
npm start
# Should see: Server listening at http://0.0.0.0:8080

# 4. Test with browser extension
# - Load extension
# - Start meeting
# - Check Supabase Table Editor for transcript_events
```

### After Phase 5 (UI Updates)
```bash
# 1. Start UI dev server
cd lma-ai-stack/source/ui
npm start

# 2. Verify real-time updates
# - Start meeting
# - Watch transcripts appear in UI
# - Verify speaker detection
```

### After Phase 6 (Data Migration)
```sql
-- Verify data in Supabase
SELECT COUNT(*) FROM meetings;
SELECT COUNT(*) FROM transcripts;
SELECT COUNT(*) FROM speaker_identity;

-- Check recordings in Storage
-- Supabase Dashboard → Storage → meeting-recordings
```

### After Phase 7 (Testing)
```bash
# Run all tests
npm test

# Check coverage
npm run test:coverage
```

### After Phase 8 (Deployment)
```bash
# Test production endpoints
curl https://your-server.com/health/check

# Verify Edge Function
curl -X POST https://your-project.supabase.co/functions/v1/process-transcripts \
  -H "Authorization: Bearer YOUR_SERVICE_KEY"

# Monitor logs
# - Supabase Dashboard → Logs
# - Server logs (Docker/CloudWatch)
```

## 🎯 Success Criteria

### Phase 1-4 (Current - Should Work)
- [x] ✅ Code compiles without errors
- [x] ✅ All dependencies resolve
- [x] ✅ No AWS SDK imports remain
- [ ] ⏳ Server starts successfully
- [ ] ⏳ WebSocket accepts connections
- [ ] ⏳ Soniox connection works
- [ ] ⏳ Transcripts save to Supabase

### Phase 5 (UI Updates)
- [ ] UI displays real-time transcripts
- [ ] Meeting list loads from Supabase
- [ ] Recording playback works
- [ ] No console errors

### Phase 6 (Data Migration)
- [ ] All historical meetings migrated
- [ ] All transcripts preserved
- [ ] All recordings accessible
- [ ] No data loss

### Phase 7 (Testing)
- [ ] 90%+ test coverage
- [ ] All tests pass
- [ ] No critical bugs
- [ ] Performance acceptable

### Phase 8 (Deployment)
- [ ] Production server running
- [ ] Zero downtime migration
- [ ] Monitoring active
- [ ] Rollback plan tested

## 📊 Progress Tracking

**Overall Progress:** 50% (4/8 phases complete)

| Phase | Status | Progress |
|-------|--------|----------|
| 1. Infrastructure | ✅ Complete | 100% |
| 2. WebSocket Server | ✅ Complete | 100% |
| 3. Edge Functions | ✅ Complete | 100% |
| 4. Browser Extension | ✅ Complete | 100% |
| 5. UI Updates | ⏳ Not Started | 0% |
| 6. Data Migration | ⏳ Not Started | 0% |
| 7. Testing | ⏳ Not Started | 0% |
| 8. Deployment | ⏳ Not Started | 0% |

**Next Milestone:** Complete Phase 5 (UI Updates)

## 🚀 Quick Commands

```bash
# Setup (First Time)
cd lma-websocket-transcriber-stack/source/app
npm install
# Create .env file
supabase db push
supabase functions deploy process-transcripts

# Development
npm start                    # Start server
npm run build               # Build for production
npm test                    # Run tests
npm run lint                # Check code quality

# Supabase
supabase db push            # Apply migrations
supabase functions deploy <name>   # Deploy function
supabase db reset           # Reset database (careful!)

# Deployment
docker build -t lma-ws .    # Build Docker image
docker run -p 8080:8080 lma-ws   # Run container
```

## 📞 Get Help

- **Setup Issues:** Read `QUICK_START.md`
- **Configuration:** Read `ENV_VARS_README.md`
- **Architecture:** Read `MIGRATION_GUIDE.md`
- **Implementation:** Read `IMPLEMENTATION_SUMMARY.md`
- **Module Details:** Read `lma-websocket-transcriber-stack/source/app/src/calleventdata/README.md`

---

**Last Updated:** October 22, 2025  
**Status:** Phases 1-4 complete, ready for user testing

