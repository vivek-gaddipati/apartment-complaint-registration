# Apartment Complaint Registration

Mobile-friendly complaint tracker for a single apartment society, built on Next.js with Google Sheets as the data store. See `complaint-app-spec.md` in the project root for the full spec this was built from.

## 1. Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

## 2. Google Sheet setup

1. Create a Google Sheet with two tabs:
   - **Complaints** — header row: `id, timestamp, flat_no, owner_name, category, description, photo_url, status, priority, assigned_to, admin_notes, resolved_at, owner_rating`
   - **Owners** — header row: `flat_no, owner_name, pin, phone`
2. Fill in every row of `Owners` with `flat_no` and `owner_name` for each unit. Leave `pin` and `phone` empty — the app writes the PIN on first login.
3. In [Google Cloud Console](https://console.cloud.google.com/), create a service account, enable the **Google Sheets API**, and generate a JSON key.
4. Share the Sheet with the service account's email address (Editor access).
5. Copy the Sheet ID from its URL (`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`).

## 3. Environment variables

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=      # from the service account JSON
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=  # from the service account JSON, keep \n escapes as-is
GOOGLE_SHEET_ID=                   # from the Sheet URL
ANTHROPIC_API_KEY=                 # for the AI Insights Report
ADMIN_PASSWORD=                    # shared admin password
SESSION_SECRET=                    # any long random string, e.g. `openssl rand -hex 32`
```

## 4. Deploy

Push to a Git repo and import into Vercel, or run `vercel` from this directory. Add the same environment variables in the Vercel project settings.

## 5. What's implemented (v1 scope)

- Owner: flat + PIN sign-in (first-time PIN setup, PIN hashed with scrypt), submit complaint, view own complaints, star-rate or reopen resolved complaints.
- Admin: shared-password login, dashboard table (filter by status/category/flat, sort by date/priority, inline status/priority/assigned-to/notes editing), AI Insights Report (date-range filtered, calls Claude, renders structured summary).
- All Google Sheets access happens server-side only (API routes / server components) — the client never talks to Sheets or Claude directly.

Out of scope for v1 (see spec §8): photo upload, WhatsApp integration, real-time notifications, multi-tenant support, SLA timers, scheduled reports.

## 6. A note on this build

This project was scaffolded and hand-written file-by-file rather than via `create-next-app`/`npm install`, because the sandbox this was built in has no outbound access to the npm registry. The code has been reviewed carefully but has **not** been run through `npm install`, `next build`, or `next lint` in this environment. Please run those locally before deploying:

```bash
npm install
npm run lint
npm run build
```
