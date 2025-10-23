Bạn là một kỹ sư phần mềm + reviewer code chuyên nghiệp. Nhiệm vụ của bạn: thay thế mọi usage liên quan đến AWS trong một repository hiện có bằng Soniox (cho streaming ASR/transcribe) và Supabase (cho storage, database, auth, realtime), theo đúng kiến trúc trong hai file hướng dẫn: `soniox-supabase-architecture.md` và `amazon-transcribe-streaming-architecture.md` (người dùng sẽ cung cấp nội dung file nếu cần). KHÔNG chạy prompt này; chỉ dùng nó như checklist/plan để thực thi trên repo.

Mục tiêu cụ thể:

1. Tự động scan toàn repo để tìm mọi import / require / usage của AWS SDK (ví dụ: aws-sdk, @aws-sdk/*, AWS.* classes, aws-lambda handlers, s3.getObject, transcribeStreaming) và liệt kê từng file + dòng.
2. Với mỗi vị trí tìm thấy, áp dụng mapping chuyển đổi (xem phần “Mapping dịch vụ” bên dưới). Nếu không thể tự động chuyển được (logic quá tùy biến), tạo task thủ công chi tiết cho dev xử lý.
3. Viết code thay thế mẫu cho các ngôn ngữ/stack repo (ưu tiên: Node.js/TypeScript, Python, Go). Kèm unit/integration tests cho mỗi thay đổi.
4. Chạy test toàn bộ repo (nếu có test suite). Nếu test fail => debug, sửa lỗi logic/import, commit từng bước với message rõ ràng.
5. Cập nhật README/infra docs và tạo checklist deploy (env vars, secrets, Supabase & Soniox credentials, CORS, streaming endpoints).
6. Sản xuất 1 PR/branch per area (storage, transcribe, db, auth, lambda/workers) kèm CHANGELOG và migration steps.

Mapping dịch vụ (mặc định; chỉnh theo 2 file kiến trúc khi có):

- Amazon Transcribe (streaming) → Soniox Streaming API
- S3 (object storage) → Supabase Storage (buckets, signed URLs)
- DynamoDB / RDS → Supabase Postgres
- Kinesis / SQS / SNS → Supabase Realtime / pg_notify hoặc Webhook flows
- Lambda → Serverless functions (Supabase Edge Functions) hoặc containerized functions
- Cognito → Supabase Auth

Ví dụ chuyển đổi import (regex-based transformations):

- Node/TS:
  - `import AWS from 'aws-sdk'` → remove; nếu dùng s3: `import { createClient as createSupabaseClient } from '@supabase/supabase-js'`
  - `const s3 = new AWS.S3()` → `const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY); const { data, error } = await supabase.storage.from('bucket').download(path)`
- Python:
  - `import boto3` → remove; replace s3 usage with `supabase_py` or direct HTTP to Supabase Storage REST.
- Replace transcribe streaming client:
  - code calling `TranscribeStreamingClient` → refactor to Soniox websocket/HTTP streaming client with same high-level flow (open socket, stream audio chunks, handle partial/final transcripts).

Các bước thực thi kỹ thuật (task list chi tiết):
A. Khảo sát (Automated)

1. Chạy scan: tìm keywords `aws-sdk`, `boto3`, `TranscribeStreamingClient`, `S3Client`, `s3.`, `transcribe`, `Kinesis`, `Cognito`, `Lambda` → xuất CSV: file,path,line_snippet.
2. Phân loại mỗi item: safe-to-auto-replace / needs-manual-edit / infra (deploy) change.

B. Thay thế code (Auto + Manual)

1. Tạo script `tools/replace_aws.sh` (dry-run) dùng sed/perl để áp regex thay đổi import cơ bản (ví dụ mẫu bên dưới).
2. Với các driver lớn (Transcribe streaming): viết adapter file `adapters/transcribe_soniox.js` hoặc `transcribe_soniox.py`:
   - Adapter cung cấp same interface: `startSession(params)`, `sendAudio(chunk)`, `onTranscript(cb)`, `close()`.
   - Thay thế mọi nơi gọi Transcribe streaming thành adapter này.
3. Storage adapter `adapters/storage_supabase.*` cung cấp `upload(buffer,path)`, `download(path)`, `getPublicUrl(path)`.
4. DB adapter: chuyển truy vấn DynamoDB -> SQL trên Supabase nếu cần, hoặc tạo compatibility layer.

C. Test & CI

1. Thêm unit tests cho adapters (mocks): simulate Soniox responses, Supabase upload/download.
2. Nếu repo có `npm test`/`pytest`, chạy và fix failing tests.
3. Thêm e2e test minimal: upload audio → stream to Soniox adapter → assert transcript contains expected phrase (use small fixture audio + mocked Soniox if live credentials absent).

D. Infra & Env

1. Liệt kê env vars mới: `SONIOX_API_KEY`, `SONIOX_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Provide migration for stored objects: script `migrate_s3_to_supabase.py` that:
   - lists S3 objects (if access left), streams copy to Supabase Storage via signed uploads.
3. Update CI secrets and docs.
