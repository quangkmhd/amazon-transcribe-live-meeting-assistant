-- Migration: Fix existing meetings with invalid owner_email
-- Update meetings that have non-email owner values

-- Update meetings with "QA Engineer Test" or invalid email format
UPDATE meetings 
SET owner_email = 'quangkmhd09344@gmail.com'
WHERE owner_email = 'QA Engineer Test' 
   OR owner_email IS NULL 
   OR owner_email NOT LIKE '%@%';

-- Update transcripts to match meeting owners
UPDATE transcripts t
SET owner_email = m.owner_email
FROM meetings m
WHERE t.meeting_id = m.meeting_id
  AND (t.owner_email IS NULL OR t.owner_email != m.owner_email);

-- Verify the changes
SELECT 
  'After migration' as status,
  owner_email, 
  COUNT(*) as count
FROM meetings
GROUP BY owner_email
ORDER BY count DESC;
