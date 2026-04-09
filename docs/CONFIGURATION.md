# Configuration Guide: Amazon Transcribe Live Meeting Assistant

This document details all the configuration files, environment variables, and deployment parameters required to run, tune, and scale the Live Meeting Assistant.

## 1. Local Environment Variables (`.env`)

For local development and the browser extension configuration, create a `.env` file in the project root.

| Variable | Description | Example / Recommended Value |
|----------|-------------|-----------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | The REST API URL for your Supabase project. | `https://xyz123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anonymous public key for Supabase client. | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key bypassing RLS (NEVER EXPOSE TO CLIENT). Used only by AWS Lambdas. | `eyJhbGci...` |
| `LOCAL_WS_PORT` | Port for the local mock WebSocket server. | `8080` |
| `LOG_LEVEL` | Verbosity of the local console logger. | `debug`, `info`, `warn`, `error` |

## 2. AWS CDK Configuration (`cdk.json` / `cdk.context.json`)

The infrastructure deployment is controlled by AWS CloudFormation via the CDK. Configuration parameters are typically passed via context variables or a config object in the setup stack.

### Example `cdk.json` context block:
```json
{
  "context": {
    "lmaEnvironment": "production",
    "transcribeLanguage": "en-US",
    "enablePiiRedaction": true,
    "aiModelId": "anthropic.claude-v2",
    "vpcId": "vpc-0a1b2c3d4e5f6g7h8"
  }
}
```

### Parameter Details:
- **`transcribeLanguage`**: The primary language code for Amazon Transcribe (e.g., `en-US`, `es-ES`, `fr-CA`).
- **`enablePiiRedaction`**: Boolean. If true, Transcribe will automatically mask Personally Identifiable Information (SSN, Credit Cards) before the text hits the WebSocket or Database.
- **`aiModelId`**: The specific LLM used in the `lma-ai-stack` for summarization. If using Amazon Bedrock, this could be `amazon.titan-text-express-v1` or `anthropic.claude-v2`.

## 3. Browser Extension Configuration (`manifest.json`)

Located in `lma-browser-extension-stack/manifest.json`.

```json
{
  "manifest_version": 3,
  "name": "Live Meeting Assistant",
  "permissions": [
    "tabCapture",
    "activeTab",
    "storage",
    "identity"
  ],
  "host_permissions": [
    "https://meet.google.com/*",
    "https://*.zoom.us/*",
    "https://teams.microsoft.com/*"
  ]
}
```
**Important Note on Permissions:**
- `tabCapture` is strictly required to intercept the audio stream of the meeting tab.
- If you deploy to an internal enterprise network, you must update the `host_permissions` to match your internal meeting domain URLs.

## 4. Supabase RLS Configuration (SQL)

Row Level Security is configured directly in PostgreSQL. While usually managed via Supabase migrations, here is the critical configuration snippet that MUST be applied to the `transcripts` table for security:

```sql
-- Enable RLS
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- Create Policy for Tenant Isolation
CREATE POLICY "Tenant Isolation Policy" ON transcripts
FOR ALL
USING (
  tenant_id = (SELECT tenant_id FROM users WHERE auth.uid() = id)
);
```

## 5. Model Hyperparameters (AI Summarization Lambda)

Inside the `lma-ai-stack/src/summarizer.js` (or equivalent), the LLM prompt parameters dictate the quality and length of the generated meeting notes.

- **`Temperature` (0.0 to 1.0):** Recommended `0.2`. Meeting summaries require high factual accuracy and low hallucination.
- **`MaxTokens`:** Recommended `1024`. Allows enough runway for detailed action items without timing out the Lambda function.
- **`SystemPrompt`:** "You are an executive assistant. Summarize the following meeting transcript. Extract key decisions and a bulleted list of action items assigned to specific people."
