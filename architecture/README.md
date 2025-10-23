# Live Meeting Assistant - Complete Architecture Documentation

**Last Updated:** October 23, 2025  
**Project:** Amazon Live Meeting Assistant  
**Status:** Production-Ready with Soniox + Supabase Stack

---

## 📚 Documentation Index

This directory contains comprehensive architecture documentation for the entire Live Meeting Assistant system, covering both **frontend** (browser extension UI) and **backend** (WebSocket server + transcription pipeline).

---

## 🎯 Quick Start Guide

### For Developers New to This Project

**Start here:**
1. Read **ARCHITECTURE_ANALYSIS_SUMMARY.md** (10 min) - System overview
2. Read **FRONTEND_COMPLETE_ANALYSIS.md** (15 min) - Frontend deep dive
3. Skim **COMPONENT_FLOW_DIAGRAMS.md** (5 min) - Visual workflows
4. Reference other docs as needed

### For Frontend Engineers

**Focus on these files:**
- ✅ **FRONTEND_UI_BLUEPRINT.md** - Architecture overview
- ✅ **FRONTEND_UI_FLOWS.md** - User interaction flows
- ✅ **FRONTEND_UI_INTERACTIONS.md** - Every button and element
- ✅ **FRONTEND_UI_VISUAL_MAP.md** - Complete visual diagrams
- ✅ **FRONTEND_COMPLETE_ANALYSIS.md** - Technical deep dive

### For Backend Engineers

**Focus on these files:**
- ✅ **ARCHITECTURE_DOCUMENTATION.md** - Backend architecture
- ✅ **COMPONENT_FLOW_DIAGRAMS.md** - Data flows and workflows
- ✅ **DEPENDENCY_ANALYSIS.md** - Module dependencies
- ✅ **soniox-supabase-architecture.md** - Migration from AWS

### For System Architects / Tech Leads

**Start with:**
- ✅ **ARCHITECTURE_ANALYSIS_SUMMARY.md** - Executive summary
- ✅ **ARCHITECTURE_DOCUMENTATION.md** - Complete system design
- ✅ **FRONTEND_COMPLETE_ANALYSIS.md** - Frontend architecture
- Then dive into specific areas as needed

---

## 📖 Complete Documentation Catalog

### System-Wide Documentation

#### 1. ARCHITECTURE_ANALYSIS_SUMMARY.md
**Purpose:** Executive summary of the entire system  
**Contents:**
- System statistics and migration status
- Technology stack breakdown
- Key design patterns
- Data flow summary (30-minute meeting lifecycle)
- Critical findings (strengths & weaknesses)
- Technology debt analysis
- Performance metrics
- Recommended next steps

**Key Insights:**
- Migrated from AWS to Soniox + Supabase
- 67-97% cost reduction ($18-81/mo → $0-25/mo)
- Dual WebSocket architecture
- Staging buffer pattern for data integrity
- Clean, maintainable codebase (8.5/10 rating)

---

#### 2. ARCHITECTURE_DOCUMENTATION.md
**Purpose:** High-level system architecture guide  
**Contents:**
- Complete technology stack
- System architecture diagrams
- Database schema with RLS policies
- WebSocket data flow sequence
- Component structure
- API interactions
- Design patterns
- AWS vs Soniox/Supabase comparison
- Deployment guide

**Key Insights:**
- Layer 1: Browser (Chrome Extension)
- Layer 2: Node.js Application Server
- Layer 3: Supabase Data Layer
- Layer 4: External Services (Soniox STT)

---

#### 3. COMPONENT_FLOW_DIAGRAMS.md
**Purpose:** Detailed component interactions and workflows  
**Contents:**
- Call initialization flow
- Audio streaming flow
- Call termination flow
- Batch processing flow
- Multi-tenancy access control
- Error handling strategy
- Performance optimizations

**Key Diagrams:**
- Meeting lifecycle stages
- Audio streaming pipeline
- Recording conversion process
- Edge function batch processing
- RLS policy enforcement

---

#### 4. DEPENDENCY_ANALYSIS.md
**Purpose:** Module dependencies and relationships  
**Contents:**
- Module dependency graph
- Critical paths analysis
- Circular dependency check
- Unused dependencies report
- Type dependencies
- Function call graph
- External service dependencies
- Security dependencies
- Performance bottlenecks
- Optimization recommendations

**Key Findings:**
- No circular dependencies
- ~15MB unused AWS SDKs to remove
- Clear dependency hierarchy
- Type-safe interfaces throughout

---

#### 5. soniox-supabase-architecture.md
**Purpose:** Migration documentation from AWS to Soniox/Supabase  
**Contents:**
- Migration rationale
- Before/after architecture comparison
- Cost analysis
- Implementation details
- Challenges and solutions

**Key Insights:**
- Replaced AWS Transcribe with Soniox
- Replaced Kinesis with Supabase staging tables
- Replaced DynamoDB with PostgreSQL
- Replaced S3 with Supabase Storage
- Significant performance and cost improvements

---

### Frontend-Specific Documentation

#### 6. FRONTEND_UI_BLUEPRINT.md ⭐
**Purpose:** Complete frontend architecture overview  
**Contents:**
- Executive summary
- Technology stack (React 18.2 + Cloudscape)
- Application structure
- Complete file structure
- Page hierarchy (no routing, conditional rendering)
- Screen components (LoginCognito, Capture)
- View components (ValueWithLabel, UserMessage, etc.)
- Context providers (4 global state managers)
- Browser extension integration
- WebSocket communication protocol

**Key Insights:**
- Single-page app with 2 main screens
- No React Router (state-based navigation)
- Chrome Extension Manifest V3
- Real-time audio streaming via WebSocket
- Multi-platform support (Zoom, Teams, Meet, Webex, Chime)

---

#### 7. FRONTEND_UI_FLOWS.md
**Purpose:** Visual diagrams of all user interaction paths  
**Contents:**
- Login flow (OAuth2 with Cognito)
- Start transcription flow
- Audio streaming flow (continuous)
- Stop transcription flow
- Token refresh flow (background)
- Logout flow
- Open in LMA flow

**Key Insights:**
- Clear step-by-step sequences
- Automatic token refresh
- Graceful error handling
- User-triggered and automatic flows

---

#### 8. FRONTEND_UI_INTERACTIONS.md
**Purpose:** Detailed documentation of every interactive element  
**Contents:**
- LoginCognito screen interactions (1 button)
- Capture screen pre-recording (7 elements)
- Capture screen recording (5 elements)
- Display-only elements (6 elements)
- Content script triggers
- State-driven UI changes
- Keyboard interactions
- Touch/mobile interactions

**Key Reference:**
- Complete table of all buttons, inputs, toggles
- Action triggered by each element
- Function called for each action
- Result/behavior of each interaction

---

#### 9. FRONTEND_UI_VISUAL_MAP.md
**Purpose:** Visual representation of entire UI structure  
**Contents:**
- Application state tree
- Complete screen layout diagrams (ASCII art)
- Component hierarchy visualization
- Navigation flow diagram
- External integrations visual map
- State transition diagram

**Visual Aids:**
- ASCII box diagrams of every screen
- Tree structures for component hierarchy
- Flow charts for state transitions
- Integration diagrams (extension ↔ content scripts ↔ server)

---

#### 10. FRONTEND_COMPLETE_ANALYSIS.md ⭐
**Purpose:** Comprehensive technical analysis and summary  
**Contents:**
- Executive summary
- Architecture at a glance
- Complete UI map (all 13 interactive elements)
- Key user flows
- Technical deep dives:
  - WebSocket communication protocol
  - Audio processing pipeline
  - State management architecture
  - Chrome extension integration
- Supported platforms (5 platforms)
- Security & authentication
- Design system & styling
- Performance characteristics
- Error handling & edge cases
- Comparison with backend
- Future enhancement opportunities
- Conclusion & assessment

**Key Insights:**
- Overall rating: 8/10
- Production-ready for current scope
- Well-architected, focused application
- Solid authentication with auto-refresh
- Real-time audio streaming works reliably

---

## 🏗️ System Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPLETE SYSTEM                          │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  FRONTEND        │  React 18.2 + Cloudscape UI
│  (Browser        │  • LoginCognito screen
│   Extension)     │  • Capture screen (recording control)
│                  │  • Chrome Extension Manifest V3
│                  │  • Side panel UI
└────────┬─────────┘
         │
         │ WebSocket (audio + control messages)
         │ ws://localhost:8080/api/v1/ws
         ↓
┌──────────────────┐
│  BACKEND         │  Node.js + Fastify
│  (WebSocket      │  • Dual WebSocket (Browser ↔ Server ↔ Soniox)
│   Server)        │  • Audio recording to /tmp/*.raw
│                  │  • WAV conversion on end
│                  │  • JWT authentication
└────────┬─────────┘
         │
         ├─→ Soniox API (Speech-to-Text + Speaker Diarization)
         │
         └─→ Supabase (Data Layer)
             ├─→ PostgreSQL (meetings, transcripts, users)
             ├─→ Storage (WAV recordings)
             ├─→ Realtime (live UI updates)
             └─→ Edge Functions (batch processing)
```

### Data Flow Summary

```
1. User clicks "Start Listening" in Extension
         ↓
2. Extension captures tab audio via displayMedia API
         ↓
3. AudioWorklet processes audio in real-time (~43 chunks/sec)
         ↓
4. Binary audio sent to WebSocket server
         ↓
5. Server forwards to Soniox STT API
         ↓
6. Soniox returns transcript tokens (partial + final)
         ↓
7. Final tokens saved to transcript_events (staging)
         ↓
8. Edge function polls every 5s, processes 200 events/batch
         ↓
9. Moved to transcripts table (final)
         ↓
10. Supabase Realtime broadcasts to web app UI
```

---

## 🔑 Key Design Patterns

### 1. Dual WebSocket Pattern
- **Client ↔ Server:** Authentication, routing, control
- **Server ↔ Soniox:** STT processing
- **Benefits:** Decoupling, security, flexibility

### 2. Staging Buffer Pattern
- **transcript_events (staging) → transcripts (final)**
- Replaces AWS Kinesis Data Streams
- **Benefits:** Data integrity, batch processing, idempotency

### 3. Repository Pattern
- `supabase-client.ts` abstracts all database operations
- Single source of truth for data access
- **Benefits:** Testability, maintainability

### 4. Publisher-Subscriber Pattern
- Soniox → Server (transcript events)
- Supabase Realtime → UI (database changes)
- **Benefits:** Real-time updates, loose coupling

### 5. Observer Pattern
- WebSocket event handlers
- Map-based session management
- **Benefits:** Scalable connection handling

---

## 📊 Performance Metrics

### Audio Streaming
- **Sampling Rate:** 48000 Hz
- **Channels:** 2 (stereo)
- **Bit Depth:** 16-bit PCM
- **Bandwidth:** ~256 kbps per connection
- **Latency:** 0.6-1.7 seconds (speech-to-text)

### Database Operations
- **Writes:** ~1-2 inserts/second per meeting
- **Batch Processing:** Every 5 seconds, 200 events/batch
- **Optimization Opportunity:** Implement batch INSERT (5-10x faster)

### Scalability
- **Concurrent Meetings:** 100-200 per 4GB server
- **Memory per Connection:** 3-5MB
- **CPU per Connection:** 7-10%

---

## 🔒 Security Architecture

### Authentication
- **Protocol:** OAuth2 with AWS Cognito
- **Grant Types:** authorization_code (login), refresh_token (renewal)
- **Token Storage:** chrome.storage.local (extension) or localStorage (web)
- **Auto-Refresh:** Before every authenticated action

### Multi-Tenancy
- **Row Level Security (RLS):** PostgreSQL policies
- **Email-Based Access:** Users see only their meetings
- **Shared Access:** Support for meeting collaborators

### WebSocket Security
- **JWT Tokens:** Passed as query parameters
- **Server Validation:** JWT verification on connection
- **Rate Limiting:** Not yet implemented (recommended)

---

## 💰 Cost Analysis

### Before Migration (AWS Stack)
- **Monthly Cost:** $18-81/month
- **Components:** Transcribe, Kinesis, Lambda, DynamoDB, S3, AppSync
- **Complexity:** High (7 AWS services)

### After Migration (Soniox + Supabase)
- **Monthly Cost:** $0-25/month
- **Components:** Soniox API, Supabase (all-in-one)
- **Complexity:** Low (2 services)
- **Savings:** 67-97% cost reduction

---

## 🚀 Technology Debt & Recommendations

### High Priority (1 month)
1. ✅ Remove unused AWS dependencies (~15MB)
2. ✅ Implement batch INSERT (5-10x performance)
3. ✅ Add circuit breaker for Soniox API

### Medium Priority (3 months)
4. ✅ Enhance JWT verification
5. ✅ Implement rate limiting
6. ✅ Optimize batch processing (5s → 2s)

### Low Priority (Nice to have)
7. ✅ Compress recordings (WAV → FLAC, 40-60% savings)
8. ✅ Add comprehensive monitoring
9. ✅ Mobile app support

---

## 📝 How to Use This Documentation

### For Code Reviews
1. Check **DEPENDENCY_ANALYSIS.md** for module relationships
2. Review **COMPONENT_FLOW_DIAGRAMS.md** for data flows
3. Reference **FRONTEND_UI_INTERACTIONS.md** for UI behavior

### For Onboarding New Developers
1. Start with **ARCHITECTURE_ANALYSIS_SUMMARY.md** (overview)
2. Read **FRONTEND_COMPLETE_ANALYSIS.md** (frontend)
3. Read **ARCHITECTURE_DOCUMENTATION.md** (backend)
4. Explore specific flows in **COMPONENT_FLOW_DIAGRAMS.md**

### For Feature Planning
1. Review **FRONTEND_COMPLETE_ANALYSIS.md** - "Future Enhancements"
2. Check **ARCHITECTURE_ANALYSIS_SUMMARY.md** - "Technology Debt"
3. Assess impact using **DEPENDENCY_ANALYSIS.md**

### For Debugging
1. Identify component in **ARCHITECTURE_DOCUMENTATION.md**
2. Trace data flow in **COMPONENT_FLOW_DIAGRAMS.md**
3. Check UI interactions in **FRONTEND_UI_INTERACTIONS.md**

---

## 🔗 External References

### Official Documentation
- [React 18 Docs](https://react.dev/)
- [AWS Cloudscape Design System](https://cloudscape.design/)
- [Supabase Docs](https://supabase.com/docs)
- [Soniox API Docs](https://soniox.com/docs)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)

### Related Project Files
- **Setup Guide:** `/SETUP_GUIDE.md`
- **Quick Start:** `/QUICK_START.md`
- **Migration Guide:** `/MIGRATION_GUIDE.md`
- **Multi-Tenancy Report:** `/MULTI_TENANCY_REPORT.md`

---

## 📌 Document Maintenance

### How to Update This Documentation

**When adding a new feature:**
1. Update **ARCHITECTURE_DOCUMENTATION.md** with new components
2. Add flows to **COMPONENT_FLOW_DIAGRAMS.md**
3. If frontend changes:
   - Update **FRONTEND_UI_BLUEPRINT.md**
   - Add interactions to **FRONTEND_UI_INTERACTIONS.md**
   - Add flows to **FRONTEND_UI_FLOWS.md**
4. Update **README.md** (this file) if major changes

**When fixing bugs:**
- Document root cause in relevant architecture doc
- Update flow diagrams if behavior changed

**When refactoring:**
- Update **DEPENDENCY_ANALYSIS.md** if module structure changed
- Update **ARCHITECTURE_DOCUMENTATION.md** if patterns changed

---

## ✅ Documentation Completeness Checklist

- ✅ System architecture overview
- ✅ Frontend architecture (complete)
- ✅ Backend architecture (complete)
- ✅ Data flow diagrams
- ✅ Component interactions
- ✅ User flows
- ✅ UI element interactions
- ✅ Visual maps and layouts
- ✅ Security architecture
- ✅ Performance metrics
- ✅ Cost analysis
- ✅ Technology debt tracking
- ✅ Migration documentation
- ✅ Multi-tenancy design
- ✅ Dependency analysis

---

## 📞 Contact & Contribution

**Project Maintainer:** Quang NH  
**Last Major Update:** October 23, 2025  
**Documentation Generator:** Cascade AI - Senior Full-Stack Architect

**How to Contribute:**
1. Read relevant architecture docs before making changes
2. Update documentation when adding features
3. Run tests and verify against flow diagrams
4. Document any deviations from documented architecture

---

**🎉 This documentation suite provides complete understanding of the entire system without needing to read a single line of code.**
