# Apartment Complaint Registration

Mobile-friendly complaint tracker for a single apartment society, built on Next.js with Google Sheets as the data store. See `complaint-app-spec.md` in the project root for the full spec this was built from.

## 1. Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

## 2. Google Sheet setup

1. Create a Google Sheet with three tabs:
   - **Complaints** — header row: `id, timestamp, flat_no, owner_name, category, description, photo_url, status, priority, assigned_to, admin_notes, resolved_at, owner_rating`
   - **Owners** — header row: `flat_no, owner_name, pin, phone`
   - **KnowledgeBase** — header row: `id, document_id, source_title, source_type, page_hint, chunk_text, tags, created_at, created_by`
2. Fill in every row of `Owners` with `flat_no` and `owner_name` for each unit. Leave `pin` and `phone` empty — the app writes the PIN on first login.
3. In [Google Cloud Console](https://console.cloud.google.com/), create a service account, enable the **Google Sheets API**, and generate a JSON key.
4. Share the Sheet with the service account's email address (Editor access).
5. Copy the Sheet ID from its URL (`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`).

## 3. Environment variables

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=      # from the service account JSON
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=  # from the service account JSON, keep \n escapes as-is
GOOGLE_SHEET_ID=                   # from the Sheet URL
GEMINI_API_KEY=                    # preferred for owner assistant + AI report (supports gemini_api_key too)
ANTHROPIC_API_KEY=                 # optional fallback provider
ADMIN_PASSWORD=                    # shared admin password
SESSION_SECRET=                    # any long random string, e.g. `openssl rand -hex 32`
KNOWLEDGE_UPLOADS_BUCKET=          # S3 bucket for uploaded PDFs (set in deployed Lambda env)
KNOWLEDGE_UPLOADS_PREFIX=knowledge-pdfs/  # S3 key prefix, must end with /
```

PDF upload constraints for knowledge ingestion:

- Keep each PDF under 25 MB.
- Store only policy/handbook documents intended for resident-facing answers.

## 4. Deploy

This app deploys to AWS (S3 + Lambda + CloudFront), not Vercel. Pushing to `main` triggers `.github/workflows/deploy.yml`, which lints and runs the Playwright suite, builds the app via OpenNext, and deploys the CloudFormation stack defined in `deploy/app-stack.yaml` — gated behind a required manual approval on GitHub's `production` environment before anything actually ships. See `docs/superpowers/specs/2026-08-26-aws-deployment-pipeline-design.md` for the full architecture and rationale.

## 5. What's implemented (v1 scope)

- Owner: flat + PIN sign-in (first-time PIN setup, PIN hashed with scrypt), submit complaint, view own complaints, star-rate or reopen resolved complaints, and ask society policy questions in `/owner/assistant` using the uploaded knowledge base.
- Admin: shared-password login, dashboard table (filter by status/category/flat, sort by date/priority, inline status/priority/assigned-to/notes editing), owner management, knowledge base management at `/admin/assistant` (PDF/TXT upload, chunking, document delete), AI Insights Report (date-range filtered, calls Gemini first, then fallback providers).
- All Google Sheets access happens server-side only (API routes / server components) — the client never talks to Sheets or Claude directly.

Out of scope for v1 (see spec §8): photo upload, WhatsApp integration, real-time notifications, multi-tenant support, SLA timers, scheduled reports.

## 6. A note on this build

This project was originally scaffolded and hand-written file-by-file rather than via `create-next-app`/`npm install`, because the sandbox it was first built in had no outbound access to the npm registry. Since then, `npm install`, `npm run lint`, and `npm run build` have all been run repeatedly (locally and in CI via `.github/workflows/deploy.yml`) and pass.
