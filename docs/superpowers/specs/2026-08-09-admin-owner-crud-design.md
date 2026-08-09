# Admin Owner CRUD — Design

## Purpose

Admins currently have no way to add a new flat/owner to the `Owners` tab or correct an
owner's name/phone from within the app — the only owner-facing admin action today is
the read-only "Manage PINs" modal on `/admin/dashboard` (list owners + reset PIN).
With the Owners tab now populated with real production data (156 flats), admins need
to create and edit owner records directly from the app instead of hand-editing the
Google Sheet.

Explicitly excluded: PIN is never readable or writable through this feature (reset
stays exactly as it is today, on the existing modal), and there is no delete action.

## Non-goals

- No delete capability, anywhere.
- No changes to the existing "Manage PINs" modal or its `reset_pin` action.
- No editing of `flat_no` after creation.

## Architecture & Data Flow

- **Page**: `src/app/admin/owners/page.tsx` — server component, gated by
  `getAdminSession()` exactly like `/admin/dashboard/page.tsx` (redirect to `/admin`
  if not signed in). Fetches the owner list server-side via `getAllOwners()` and
  passes it to a client component.
- **Client component**: `src/app/admin/owners/AdminOwnersClient.tsx` — table +
  search + add-owner form + inline edit, following the existing patterns in
  `AdminDashboardClient.tsx` (inline `onBlur`-triggered PATCH, toast on save).
- **Sheets layer** (`src/lib/sheets.ts`): two new functions.
  - `createOwner(flatNo: string, ownerName: string, phone: string): Promise<void>` —
    validates `flatNo` isn't already taken (case-insensitive), appends a row to the
    `Owners` tab with `pin` left as `""`. Mirrors `appendComplaint`'s mock/real
    branching.
  - `updateOwnerDetails(flatNo: string, updates: { owner_name?: string; phone?: string }): Promise<void>` —
    looks up the row via `getOwnerByFlat`, writes only the `owner_name`/`phone`
    columns (B and D) via `values.update`, exactly like `setOwnerPin` writes only
    column C today. Never touches column C (`pin`).
- **API route** (`src/app/api/admin/owners/route.ts`): `POST` gains two new
  `action` values alongside the existing `reset_pin`:
  - `action: "create"` — body `{ flat_no, owner_name, phone }`.
  - `action: "update"` — body `{ flat_no, owner_name, phone }`. The route only ever
    reads `owner_name`/`phone` off the body for this action — a `pin` field in the
    request body, if present, is ignored.
  - `GET` (list) is unchanged and is reused by both the new page and the existing
    "Manage PINs" modal.

## UI Design (`/admin/owners`)

- Table columns: **Flat No | Owner Name | Phone | PIN Status**.
  - PIN Status is read-only display only (`● Active` / `○ Unset`, same visual
    language as the existing modal) — no reset control on this page.
- Search input filtering the table client-side by `flat_no` or `owner_name`
  substring match (mirrors the complaints dashboard's search box) — necessary at
  156 rows.
- **Add Owner**: a small inline form (Flat No, Owner Name, Phone) pinned above the
  table. Submits `POST { action: "create" }`; on success, prepends the new row to
  local state and clears the form.
- **Inline edit**: `owner_name` and `phone` cells become editable inputs; on blur,
  if the value changed, `POST { action: "update" }` and show a toast on success
  (same `onBlur`-diff-then-save pattern as `assigned_to`/`admin_notes` in
  `AdminDashboardClient.tsx`).
- `flat_no` renders as plain text, never an input — there is no code path that can
  change it once created.
- No delete button or action anywhere on this page.
- Admin dashboard top bar (`AdminDashboardClient.tsx`) gets a new link to
  `/admin/owners`, alongside the existing "Manage PINs" / "AI Insights Report"
  links. The "Manage PINs" modal itself is untouched.

## Validation & Error Handling

- `create`:
  - 400 if `flat_no` or `owner_name` is empty/whitespace.
  - 400 if `flat_no` already exists (case-insensitive compare, consistent with
    `getOwnerByFlat`'s existing matching).
  - `phone` optional, defaults to `""`.
- `update`:
  - 404 if `flat_no` doesn't match any existing row.
  - 400 if `owner_name` is empty/whitespace.
  - `phone` optional.
- Both actions: 401 if `getAdminSession()` is null (same guard already used by
  every other `/api/admin/*` route).
- Client-side errors render the same way as the rest of the admin dashboard —
  inline red error box for the add-owner form, toast for inline-edit failures.

## Testing

- New `e2e/admin-owners.spec.ts` in the existing Playwright suite:
  1. Admin logs in, navigates to `/admin/owners`.
  2. Creates a new owner row (fixed test flat number, e.g. `TEST-CRUD-001`) and
     verifies it appears in the table.
  3. Edits that row's `owner_name` and `phone`, reloads the page, and verifies the
     new values persisted.
  4. Confirms there is no input/control that allows editing `flat_no`.
  5. Confirms there is no delete control anywhere on the page.
- The test reuses the same fixed test flat number idempotently across runs
  (create-if-missing, then update) rather than accumulating new rows — unlike
  complaint rows, a couple of stable test owner rows aren't disruptive, so no
  teardown step is added for this feature.
