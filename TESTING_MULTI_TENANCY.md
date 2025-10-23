# 🧪 Hướng Dẫn Test Multi-Tenancy

## Cách Chạy Test RLS Isolation

### 1. Test Nhanh Với Node.js Script

```bash
# Đảm bảo đã cài dependencies
cd /home/quangnh58/dev/amazon-transcribe-live-meeting-assistant
npm install

# Chạy test script
node scripts/test-rls-isolation.js
```

**Expected Output:**
```
🔒 Testing Multi-Tenancy Data Isolation

============================================================

📊 Testing User A: quangkmhd09344@gmail.com
------------------------------------------------------------
✅ User A logged in successfully
📋 User A can see 2 meeting(s):
   - Test Stream - Validation - 2025-10-23-08:03:47.965 (owner: quangkmhd09344@gmail.com)
   - Test Stream - Validation - 2025-10-23-08:03:10.159 (owner: quangkmhd09344@gmail.com)

📊 Testing User B: lma.testuser@gmail.com
------------------------------------------------------------
✅ User B logged in successfully
📋 User B can see 1 meeting(s):
   - test-meeting-001 (owner: lma.testuser@gmail.com)

============================================================
📝 Test Summary:
============================================================
Expected: Each user only sees their own meetings
Database: Shared Supabase database
Security: Row Level Security (RLS) policies

✅ If no warnings appeared, multi-tenancy is working correctly!
```

### 2. Test Với MCP Supabase (Trực Tiếp Database)

```bash
# Test RLS enabled
mcp8_execute_sql --project_id awihrdgxogqwabwnlezq \
  --query "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'"

# Test policies count
mcp8_execute_sql --project_id awihrdgxogqwabwnlezq \
  --query "SELECT tablename, COUNT(*) as policy_count FROM pg_policies GROUP BY tablename"

# Test data distribution
mcp8_execute_sql --project_id awihrdgxogqwabwnlezq \
  --query "SELECT owner_email, COUNT(*) FROM meetings GROUP BY owner_email"
```

### 3. Test Với Playwright (Full E2E)

```bash
# Cần frontend đang chạy
cd lma-ai-stack/source/ui
npm start

# Trong terminal khác, chạy Playwright test
cd /home/quangnh58/dev/amazon-transcribe-live-meeting-assistant
npx playwright test tests/multi-tenancy-isolation.spec.ts
```

## Giải Thích Kết Quả

### ✅ Test PASS Khi:
- User A chỉ thấy 2 meetings của họ
- User B chỉ thấy 1 meeting của họ
- Không có warnings về "seeing other user's data"
- RLS enabled trên tất cả tables

### ❌ Test FAIL Khi:
- User thấy meetings của user khác
- RLS disabled trên bất kỳ table nào
- Có warnings xuất hiện
- Query trả về empty array (có thể do password sai)

## Troubleshooting

### Issue 1: "User login failed"
**Nguyên nhân:** Password không đúng

**Giải pháp:**
```bash
# Option 1: Set password trong env
export USER_A_PASSWORD="your_actual_password"
export USER_B_PASSWORD="TestPassword123!"

# Option 2: Reset password qua Supabase dashboard
# https://supabase.com/dashboard/project/awihrdgxogqwabwnlezq/auth/users
```

### Issue 2: "User A seeing other user's data"
**Nguyên nhân:** RLS policies chưa apply đúng

**Giải pháp:**
```bash
# Re-run migrations
cd supabase
supabase db reset
supabase db push
```

### Issue 3: "Cannot find meetings"
**Nguyên nhân:** Database trống hoặc chưa có test data

**Giải pháp:**
```bash
# Tạo test meeting qua frontend
# Hoặc insert trực tiếp vào database
```

## Manual Test Steps

### Bước 1: Login as User A
1. Mở browser → `http://localhost:3000/login`
2. Login với: `quangkmhd09344@gmail.com`
3. Vào trang `/calls`
4. Xem danh sách meetings
5. **Expect:** Chỉ thấy 2 meetings

### Bước 2: Login as User B (Private/Incognito Window)
1. Mở private browser → `http://localhost:3000/login`
2. Login với: `lma.testuser@gmail.com`
3. Vào trang `/calls`
4. Xem danh sách meetings
5. **Expect:** Chỉ thấy 1 meeting khác với User A

### Bước 3: Verify Console Logs
1. Mở DevTools Console (F12)
2. Xem logs: `[useCallsSupabaseApi] Fetched meetings: X`
3. **Expect:** Số meetings khác nhau giữa User A và User B

## Security Checklist

- [x] RLS enabled trên `meetings` table
- [x] RLS enabled trên `transcripts` table
- [x] RLS enabled trên `transcript_events` table
- [x] RLS enabled trên `speaker_identity` table
- [x] Policies filter theo `owner_email`
- [x] Auto-trigger set `owner_email` khi INSERT
- [x] Existing data đã có valid `owner_email`
- [x] Frontend không cần filter manually
- [x] Shared meetings support (`shared_with` array)

## Kết Luận

✅ **Multi-tenancy đã được implement đúng cách với:**
- Shared database (tiết kiệm chi phí)
- RLS policies (bảo mật database-level)
- Auto owner detection (không thể forge)
- No cross-user data leakage

🎯 **Production Ready:** Hệ thống sẵn sàng cho production với bảo mật đầy đủ.
