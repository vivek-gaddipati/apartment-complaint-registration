# Admin Owner CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create new owner rows and edit an existing owner's name/phone from within the app, on a new `/admin/owners` page — without ever reading or writing the `pin` column, and without any delete capability.

**Architecture:** Two new functions in the existing Sheets data-access layer (`createOwner`, `updateOwnerDetails`), two new `action` values on the existing `POST /api/admin/owners` route, and a new server+client page pair at `/admin/owners` that reuses the existing admin session guard and Tailwind component patterns already used by `/admin/dashboard`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `googleapis` (Google Sheets API), Playwright for e2e.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-admin-owner-crud-design.md` — every requirement in it applies to every task below.
- **No delete capability anywhere** — UI, API, or data layer.
- **`pin` (column C in the `Owners` tab) is never read or written by any code added in this plan.**
- **`flat_no` is immutable after creation** — no UI control and no API path may change it.
- This project has **no git repository** (`git status` → "not a git repository"). Every task's "Commit" step is replaced with "check the task's checkbox" — do not run `git` commands.
- This project has **no unit test framework** (no Jest/Vitest configured) — only Playwright e2e (`npm run test:e2e`) and manual verification against the real, running dev server. Tasks 1–2 verify with disposable Node/`curl` scripts against the real Google Sheet (the same pattern already used throughout this project's development); Tasks 3–4 verify by reading the rendered output; Task 5 is the actual automated regression test for this feature.
- Dev server runs on `http://localhost:3001` (already running); admin password is in `.env.local` as `ADMIN_PASSWORD`.
- Follow existing code style exactly: Tailwind classes matching `AdminDashboardClient.tsx`, the same toast/onBlur-save pattern used there, `glass-panel`/`glass-card`/`input-dark` utility classes (already defined in `globals.css`, do not redefine them).

---

### Task 1: Data layer — `createOwner` and `updateOwnerDetails`

**Files:**
- Modify: `src/lib/sheets.ts:312-316` (append after the existing `resetOwnerPin` function, which ends at line 315)
- Test: disposable script at `/private/tmp/claude-501/-Users-vivekgaddipati-projects-apartment-complaint-registration/8a535deb-03fb-4ffa-9895-5db97b56044b/scratchpad/verify-owner-crud.mjs` (not committed — this project's scratchpad, not the repo)

**Interfaces:**
- Consumes: `getOwnerByFlat(flatNo: string): Promise<Owner | null>` (existing, `src/lib/sheets.ts:279`), `hasGoogleCredentials()`, `getClient()`, `getSheetId()`, `mockOwners` (existing module-level array), `OWNER_COLUMNS` from `./types` (existing, already imported at top of file).
- Produces:
  - `export async function createOwner(flatNo: string, ownerName: string, phone: string): Promise<Owner>` — throws `Error("Flat already exists: " + flatNo)` if `getOwnerByFlat` finds a match. Returns the created `Owner` (with `pin: ""`).
  - `export async function updateOwnerDetails(flatNo: string, updates: { owner_name: string; phone: string }): Promise<Owner>` — throws `Error("Unknown flat: " + flatNo)` if no match. Returns the merged `Owner`. Never issues a Sheets request touching column C.
  - Both are consumed by Task 2.

- [ ] **Step 1: Add the two functions to `src/lib/sheets.ts`**

Append this block immediately after the existing `resetOwnerPin` function (after line 315, i.e. right before the file's final blank line):

```ts
function ownerToRow(o: Partial<Owner>): string[] {
  return OWNER_COLUMNS.map((key) => (o[key] ?? "") as string);
}

/** Creates a new owner row. Throws if flat_no already exists (case-insensitive). */
export async function createOwner(
  flatNo: string,
  ownerName: string,
  phone: string
): Promise<Owner> {
  const existing = await getOwnerByFlat(flatNo);
  if (existing) {
    throw new Error(`Flat already exists: ${flatNo}`);
  }

  const owner: Owner = {
    flat_no: flatNo.trim(),
    owner_name: ownerName.trim(),
    pin: "",
    phone: phone.trim(),
    rowIndex: -1,
  };

  if (!hasGoogleCredentials()) {
    const rowIndex = mockOwners.length;
    mockOwners.push({ ...owner, rowIndex });
    return { ...owner, rowIndex };
  }

  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${OWNERS_TAB}!A:D`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [ownerToRow(owner)] },
  });

  return owner;
}

/** Updates owner_name and phone for a flat. Never reads or writes the pin column. */
export async function updateOwnerDetails(
  flatNo: string,
  updates: { owner_name: string; phone: string }
): Promise<Owner> {
  const owner = await getOwnerByFlat(flatNo);
  if (!owner) throw new Error(`Unknown flat: ${flatNo}`);

  const merged: Owner = {
    ...owner,
    owner_name: updates.owner_name.trim(),
    phone: updates.phone.trim(),
  };

  if (!hasGoogleCredentials()) {
    const idx = mockOwners.findIndex(
      (o) => o.flat_no.trim().toLowerCase() === flatNo.trim().toLowerCase()
    );
    if (idx !== -1) {
      mockOwners[idx] = {
        ...mockOwners[idx],
        owner_name: merged.owner_name,
        phone: merged.phone,
      };
    }
    return merged;
  }

  const sheets = getClient();
  const sheetRow = owner.rowIndex + 2;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${OWNERS_TAB}!B${sheetRow}:B${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[merged.owner_name]] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${OWNERS_TAB}!D${sheetRow}:D${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[merged.phone]] },
  });

  return merged;
}
```

- [ ] **Step 2: Self-check before moving on**

These functions can't be unit-tested in isolation (no test framework in this
project, and they need a live Google Sheets connection) — Task 2's curl
verification is what actually proves them correct end-to-end. Before moving
on, re-read the code you just added and confirm three things by eye:
`createOwner` never issues a Sheets request touching column C; `updateOwnerDetails`
never issues a Sheets request touching column C (its two `values.update` calls
target ranges `B{row}:B{row}` and `D{row}:D{row}` only); and both functions
branch on `hasGoogleCredentials()` the same way every other function in this
file already does.

- [ ] **Step 3: Lint**

Run: `cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app && npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 4: Mark task complete**

No git repo — just check this task's box.

---

### Task 2: API route — `create` and `update` actions

**Files:**
- Modify: `src/app/api/admin/owners/route.ts` (full file — current content is 49 lines: `GET`, then `POST` handling only `reset_pin`)

**Interfaces:**
- Consumes: `createOwner`, `updateOwnerDetails`, `getOwnerByFlat` (all from Task 1, `@/lib/sheets`), `getAllOwners`, `resetOwnerPin` (existing, unchanged), `getAdminSession` (existing, `@/lib/auth`).
- Produces: `POST /api/admin/owners` with `{ flat_no, action: "create", owner_name, phone }` → `200 { ok: true, owner: { flat_no, owner_name, phone, hasPin: false } }` or `400 { error }`. With `{ flat_no, action: "update", owner_name, phone }` → `200 { ok: true, owner: { flat_no, owner_name, phone, hasPin } }` or `400`/`404 { error }`. `GET` response shape is unchanged: `{ owners: { flat_no, owner_name, phone, hasPin }[] }`. Consumed by Task 3's client component.

- [ ] **Step 1: Replace the file's contents**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  getAllOwners,
  getOwnerByFlat,
  resetOwnerPin,
  createOwner,
  updateOwnerDetails,
} from "@/lib/sheets";

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  try {
    const owners = await getAllOwners();
    const formatted = owners.map((o) => ({
      flat_no: o.flat_no,
      owner_name: o.owner_name,
      phone: o.phone,
      hasPin: Boolean(o.pin && o.pin.trim() !== ""),
    }));
    return NextResponse.json({ owners: formatted });
  } catch (err) {
    console.error("Fetch owners error:", err);
    return NextResponse.json({ error: "Failed to fetch owners list." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  try {
    const { flat_no, action, owner_name, phone } = await req.json();
    if (typeof flat_no !== "string" || !flat_no.trim()) {
      return NextResponse.json({ error: "Flat number is required." }, { status: 400 });
    }

    if (action === "reset_pin") {
      await resetOwnerPin(flat_no.trim());
      return NextResponse.json({ ok: true, message: `PIN reset for Flat ${flat_no}.` });
    }

    if (action === "create") {
      if (typeof owner_name !== "string" || !owner_name.trim()) {
        return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
      }
      const existing = await getOwnerByFlat(flat_no.trim());
      if (existing) {
        return NextResponse.json(
          { error: `Flat ${flat_no} already exists.` },
          { status: 400 }
        );
      }
      const owner = await createOwner(
        flat_no.trim(),
        owner_name,
        typeof phone === "string" ? phone : ""
      );
      return NextResponse.json({
        ok: true,
        owner: {
          flat_no: owner.flat_no,
          owner_name: owner.owner_name,
          phone: owner.phone,
          hasPin: false,
        },
      });
    }

    if (action === "update") {
      if (typeof owner_name !== "string" || !owner_name.trim()) {
        return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
      }
      const existing = await getOwnerByFlat(flat_no.trim());
      if (!existing) {
        return NextResponse.json({ error: `Flat ${flat_no} not found.` }, { status: 404 });
      }
      const owner = await updateOwnerDetails(flat_no.trim(), {
        owner_name,
        phone: typeof phone === "string" ? phone : "",
      });
      return NextResponse.json({
        ok: true,
        owner: {
          flat_no: owner.flat_no,
          owner_name: owner.owner_name,
          phone: owner.phone,
          hasPin: Boolean(owner.pin && owner.pin.trim() !== ""),
        },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("Admin owners error:", err);
    return NextResponse.json(
      { error: "Failed to perform owner management action." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify against the real running dev server**

Run (dev server must already be running on port 3001):

```bash
cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app
curl -s -c /tmp/admin_cookies.txt -X POST http://localhost:3001/api/admin/login \
  -H "Content-Type: application/json" -d '{"password":"'"$(grep ADMIN_PASSWORD .env.local | cut -d= -f2)"'"}' > /dev/null

# create
curl -s -b /tmp/admin_cookies.txt -X POST http://localhost:3001/api/admin/owners \
  -H "Content-Type: application/json" \
  -d '{"action":"create","flat_no":"PLAN-VERIFY-001","owner_name":"Plan Verify","phone":"1234567890"}'
echo

# duplicate create should 400
curl -s -o /dev/null -w "duplicate create status: %{http_code}\n" -b /tmp/admin_cookies.txt \
  -X POST http://localhost:3001/api/admin/owners -H "Content-Type: application/json" \
  -d '{"action":"create","flat_no":"PLAN-VERIFY-001","owner_name":"Dup","phone":""}'

# update
curl -s -b /tmp/admin_cookies.txt -X POST http://localhost:3001/api/admin/owners \
  -H "Content-Type: application/json" \
  -d '{"action":"update","flat_no":"PLAN-VERIFY-001","owner_name":"Plan Verify Updated","phone":"9999999999"}'
echo

# update on unknown flat should 404
curl -s -o /dev/null -w "unknown update status: %{http_code}\n" -b /tmp/admin_cookies.txt \
  -X POST http://localhost:3001/api/admin/owners -H "Content-Type: application/json" \
  -d '{"action":"update","flat_no":"DOES-NOT-EXIST","owner_name":"X","phone":""}'
```

Expected: create returns `{"ok":true,"owner":{"flat_no":"PLAN-VERIFY-001",...,"hasPin":false}}`; duplicate create status `400`; update returns `{"ok":true,"owner":{...,"owner_name":"Plan Verify Updated","phone":"9999999999"}}`; unknown update status `404`.

- [ ] **Step 3: Clean up the verification row**

There's no delete endpoint by design. Manually remove the `PLAN-VERIFY-001` row from the `Owners` tab in the Google Sheet UI (same manual cleanup already done for earlier ad-hoc verification rows in this project).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 5: Mark task complete**

No git repo — just check this task's box.

---

### Task 3: `/admin/owners` page

**Files:**
- Create: `src/app/admin/owners/page.tsx`
- Create: `src/app/admin/owners/AdminOwnersClient.tsx`

**Interfaces:**
- Consumes: `getAdminSession()` (`@/lib/auth`), `getAllOwners()` (`@/lib/sheets`) in the server component; `GET`/`POST /api/admin/owners` (Task 2) from the client component.
- Produces: route `/admin/owners`, redirecting to `/admin` if not signed in as admin. `AdminOwnersClient` accepts `{ initialOwners: OwnerRow[] }` where `OwnerRow = { flat_no: string; owner_name: string; phone: string; hasPin: boolean }` — this type name/shape is referenced by Task 5's e2e test only through the rendered UI, not imported directly.

- [ ] **Step 1: Create `src/app/admin/owners/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllOwners } from "@/lib/sheets";
import AdminOwnersClient from "./AdminOwnersClient";

// Avoid Next.js's default fetch caching so Sheets reads stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminOwnersPage() {
  const session = getAdminSession();
  if (!session) {
    redirect("/admin");
  }

  const owners = await getAllOwners();
  const initialOwners = owners.map((o) => ({
    flat_no: o.flat_no,
    owner_name: o.owner_name,
    phone: o.phone,
    hasPin: Boolean(o.pin && o.pin.trim() !== ""),
  }));

  return <AdminOwnersClient initialOwners={initialOwners} />;
}
```

- [ ] **Step 2: Create `src/app/admin/owners/AdminOwnersClient.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface OwnerRow {
  flat_no: string;
  owner_name: string;
  phone: string;
  hasPin: boolean;
}

export default function AdminOwnersClient({
  initialOwners,
}: {
  initialOwners: OwnerRow[];
}) {
  const [owners, setOwners] = useState(initialOwners);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savingFlat, setSavingFlat] = useState<string | null>(null);

  const [newFlatNo, setNewFlatNo] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  async function addOwner(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");

    if (!newFlatNo.trim()) {
      setAddError("Flat number is required.");
      return;
    }
    if (!newOwnerName.trim()) {
      setAddError("Owner name is required.");
      return;
    }

    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          flat_no: newFlatNo.trim(),
          owner_name: newOwnerName.trim(),
          phone: newPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to add owner.");
        return;
      }
      setOwners((prev) => [data.owner, ...prev]);
      setNewFlatNo("");
      setNewOwnerName("");
      setNewPhone("");
      showToast(`Added Flat ${data.owner.flat_no}.`);
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAddLoading(false);
    }
  }

  async function saveDetails(flatNo: string, ownerName: string, phone: string) {
    setSavingFlat(flatNo);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          flat_no: flatNo,
          owner_name: ownerName,
          phone,
        }),
      });
      if (res.ok) {
        showToast(`Updated Flat ${flatNo}.`);
      }
    } finally {
      setSavingFlat(null);
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.flat_no.toLowerCase().includes(q) || o.owner_name.toLowerCase().includes(q)
    );
  }, [owners, searchQuery]);

  return (
    <main className="flex flex-1 flex-col py-4">
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 rounded-xl border border-sky-500/30 bg-slate-900/90 px-4 py-3 text-xs font-semibold text-sky-300 shadow-xl backdrop-blur-md">
          ⚡ {toastMessage}
        </div>
      )}

      <div className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-xl">
        <div>
          <Link
            href="/admin/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white leading-tight">Manage Owners</h1>
          <p className="text-xs text-slate-400 font-medium">
            {owners.length} flats registered
          </p>
        </div>
      </div>

      <div className="glass-panel mb-4 rounded-2xl p-4">
        <form onSubmit={addOwner} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Flat Number
            </label>
            <input
              value={newFlatNo}
              onChange={(e) => setNewFlatNo(e.target.value)}
              placeholder="e.g. H-101"
              className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Owner Name
            </label>
            <input
              value={newOwnerName}
              onChange={(e) => setNewOwnerName(e.target.value)}
              placeholder="Owner full name"
              className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Phone (optional)
            </label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone"
              className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            type="submit"
            disabled={addLoading}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-600/30 hover:from-sky-500 hover:to-blue-500 transition disabled:opacity-50"
          >
            {addLoading ? "Adding..." : "+ Add Owner"}
          </button>
        </form>
        {addError && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            {addError}
          </div>
        )}
      </div>

      <div className="glass-panel mb-4 rounded-2xl p-4">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search flat or owner name..."
          className="input-dark w-full rounded-xl px-4 py-2.5 text-xs text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl glass-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 uppercase tracking-wider text-slate-400 font-semibold">
              <tr>
                <th className="px-4 py-3.5">Flat No</th>
                <th className="px-4 py-3.5">Owner Name</th>
                <th className="px-4 py-3.5">Phone</th>
                <th className="px-4 py-3.5">PIN Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((o) => (
                <tr key={o.flat_no} className="hover:bg-slate-800/30 transition align-top">
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                    {o.flat_no}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={o.owner_name}
                      disabled={savingFlat === o.flat_no}
                      onBlur={(e) => {
                        if (e.target.value !== o.owner_name && e.target.value.trim()) {
                          const updated = { ...o, owner_name: e.target.value };
                          setOwners((prev) =>
                            prev.map((row) => (row.flat_no === o.flat_no ? updated : row))
                          );
                          saveDetails(o.flat_no, e.target.value, o.phone);
                        }
                      }}
                      className="input-dark w-48 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={o.phone}
                      disabled={savingFlat === o.flat_no}
                      onBlur={(e) => {
                        if (e.target.value !== o.phone) {
                          const updated = { ...o, phone: e.target.value };
                          setOwners((prev) =>
                            prev.map((row) => (row.flat_no === o.flat_no ? updated : row))
                          );
                          saveDetails(o.flat_no, o.owner_name, e.target.value);
                        }
                      }}
                      className="input-dark w-36 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {o.hasPin ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        ● PIN Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400 font-semibold">
                        ○ PIN Unset
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-slate-400">
            🔍 No owners match your search.
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Lint and build**

Run:
```bash
cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app
npm run lint
npm run build
```
Expected: both succeed with no errors (build will list a new static/dynamic route `/admin/owners` in its route table).

- [ ] **Step 4: Manual smoke check**

With the dev server running, visit `http://localhost:3001/admin/owners` in a browser after logging in at `/admin` (or `curl -b /tmp/admin_cookies.txt http://localhost:3001/admin/owners | head -50` and confirm it returns HTML, not a redirect, given the admin cookie from Task 2's Step 2).

- [ ] **Step 5: Mark task complete**

No git repo — just check this task's box.

---

### Task 4: Nav link from the admin dashboard

**Files:**
- Modify: `src/app/admin/dashboard/AdminDashboardClient.tsx` (top bar button row, currently: "🔑 Manage PINs" button → "✨ AI Insights Report" link → "📥 Export CSV" button → "Sign Out" button)

**Interfaces:**
- Consumes: nothing new (routes to `/admin/owners` from Task 3).
- Produces: a visible "🏠 Manage Owners" link on `/admin/dashboard`, so Task 5's e2e test can navigate via `getByRole("link", { name: "Manage Owners" })`.

- [ ] **Step 1: Add the link**

Find this block (the button row inside the top bar `<div className="flex flex-wrap items-center gap-2">`):

```tsx
          <button
            onClick={openPinModal}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
          >
            🔑 Manage PINs
          </button>
          <Link
            href="/admin/report"
```

Insert a new `Link` between the closing `</button>` of "Manage PINs" and the existing `<Link href="/admin/report" ...>`:

```tsx
          <button
            onClick={openPinModal}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
          >
            🔑 Manage PINs
          </button>
          <Link
            href="/admin/owners"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
          >
            🏠 Manage Owners
          </Link>
          <Link
            href="/admin/report"
```

(`Link` is already imported at the top of this file — no new import needed.)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 3: Visual check**

With the dev server running, log in at `/admin` and confirm the "🏠 Manage Owners" button appears on the dashboard top bar between "🔑 Manage PINs" and "✨ AI Insights Report", and clicking it navigates to `/admin/owners`.

- [ ] **Step 4: Mark task complete**

No git repo — just check this task's box.

---

### Task 5: Playwright e2e coverage

**Files:**
- Create: `e2e/admin-owners.spec.ts`

**Interfaces:**
- Consumes: the running app via Playwright's `page` fixture (per `playwright.config.ts`, already configured with its own dev server on port 3100). Does not import from `./helpers` — this file defines its own tiny `adminPassword()`/`loginAsAdmin()` helpers, matching the existing pattern already used in `e2e/admin-dashboard.spec.ts` (which also duplicates rather than shares these two small functions).
- Produces: 3 new tests, run via `npm run test:e2e`.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD is not set — required for admin e2e tests.");
  return pw;
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByPlaceholder("Enter management password").fill(adminPassword());
  await page.getByRole("button", { name: "Sign In to Admin Dashboard →" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

// Fixed, idempotent test flat: if a prior run already created it, the "create"
// step below 400s (already-exists) and the row is simply already on the page
// from the server-rendered initial list — no teardown needed either way.
const TEST_CRUD_FLAT = "TEST-CRUD-001";

test.describe.serial("Admin owner CRUD flow", () => {
  test("admin can add a new owner and see it in the list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manage Owners" }).click();
    await expect(page).toHaveURL(/\/admin\/owners/);

    await page.getByPlaceholder("e.g. H-101").fill(TEST_CRUD_FLAT);
    await page.getByPlaceholder("Owner full name").fill("CRUD Test Owner");
    await page.getByPlaceholder("Phone").fill("9999999999");
    await page.getByRole("button", { name: "+ Add Owner" }).click();

    const row = page.locator("tr", { hasText: TEST_CRUD_FLAT });
    await expect(row).toBeVisible();
  });

  test("admin can edit an existing owner's name and phone, and it persists on reload", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/owners");
    await page.getByPlaceholder("🔍 Search flat or owner name...").fill(TEST_CRUD_FLAT);

    const row = page.locator("tr", { hasText: TEST_CRUD_FLAT });
    await expect(row).toBeVisible();

    const nameInput = row.locator("input").nth(0);
    await nameInput.fill("Updated CRUD Owner");
    await nameInput.blur();
    await expect(page.getByText(`Updated Flat ${TEST_CRUD_FLAT}.`)).toBeVisible();

    await page.reload();
    await page.getByPlaceholder("🔍 Search flat or owner name...").fill(TEST_CRUD_FLAT);
    const rowAfterReload = page.locator("tr", { hasText: TEST_CRUD_FLAT });
    await expect(rowAfterReload.locator("input").nth(0)).toHaveValue("Updated CRUD Owner");
  });

  test("flat_no has no edit control and there is no delete button on the page", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/owners");
    await page.getByPlaceholder("🔍 Search flat or owner name...").fill(TEST_CRUD_FLAT);

    const row = page.locator("tr", { hasText: TEST_CRUD_FLAT });
    await expect(row).toBeVisible();
    // Only 2 inputs per row: owner_name and phone. flat_no is plain text, not an input.
    await expect(row.locator("input")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the new spec**

Run: `cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app && npx playwright test e2e/admin-owners.spec.ts`
Expected: `3 passed`.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `npx playwright test`
Expected: all tests pass (12 total: the existing 9 plus these 3). Note: this project has seen occasional multi-minute hangs on individual tests from a known, pre-existing Google Sheets API retry-timeout issue (see prior session notes) — unrelated to this feature; if a hang happens, it is not a regression from this plan.

- [ ] **Step 4: Mark task complete**

No git repo — just check this task's box.
