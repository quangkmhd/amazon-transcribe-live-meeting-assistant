-- Create storage bucket for knowledge documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-documents',
  'knowledge-documents',
  false,  -- private bucket, only accessible by authenticated users
  52428800,  -- 50MB in bytes
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',  -- .pptx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for knowledge-documents bucket
-- Path structure: temp/{email}/{documentId}/{fileName}
-- Allow authenticated users to upload documents to their own folder
CREATE POLICY "Users can upload to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = 'temp' AND
  (storage.foldername(name))[2] = (SELECT auth.jwt() ->> 'email')
);

-- Allow users to read their own documents
CREATE POLICY "Users can read their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = 'temp' AND
  (storage.foldername(name))[2] = (SELECT auth.jwt() ->> 'email')
);

-- Allow users to update their own documents
CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = 'temp' AND
  (storage.foldername(name))[2] = (SELECT auth.jwt() ->> 'email')
)
WITH CHECK (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = 'temp' AND
  (storage.foldername(name))[2] = (SELECT auth.jwt() ->> 'email')
);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge-documents' AND
  (storage.foldername(name))[1] = 'temp' AND
  (storage.foldername(name))[2] = (SELECT auth.jwt() ->> 'email')
);

-- Add RLS policies for knowledge_documents table (if not already present)
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Knowledge documents policies
CREATE POLICY "Users can read their own documents" 
ON knowledge_documents FOR SELECT
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can insert their own documents"
ON knowledge_documents FOR INSERT
TO authenticated
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own documents"
ON knowledge_documents FOR UPDATE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'))
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can delete their own documents"
ON knowledge_documents FOR DELETE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

-- Knowledge chunks policies
CREATE POLICY "Users can read their own chunks"
ON knowledge_chunks FOR SELECT
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can insert their own chunks"
ON knowledge_chunks FOR INSERT
TO authenticated
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own chunks"
ON knowledge_chunks FOR UPDATE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'))
WITH CHECK (owner_email = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Users can delete their own chunks"
ON knowledge_chunks FOR DELETE
TO authenticated
USING (owner_email = (SELECT auth.jwt() ->> 'email'));

