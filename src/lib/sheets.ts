import { google, sheets_v4 } from "googleapis";
import {
  Complaint,
  COMPLAINT_COLUMNS,
  KnowledgeChunk,
  KnowledgeDocument,
  KNOWLEDGE_COLUMNS,
  Owner,
  OWNER_COLUMNS,
} from "./types";

const COMPLAINTS_TAB = "Complaints";
const OWNERS_TAB = "Owners";
const KNOWLEDGE_TAB = "KnowledgeBase";

let cachedClient: sheets_v4.Sheets | null = null;

/** In-memory storage for dev/testing when Google Sheets credentials are not configured */
let mockComplaints: (Complaint & { rowIndex: number })[] = [
  {
    id: "c-1001",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    flat_no: "B-402",
    owner_name: "John Doe",
    category: "Plumbing",
    description: "Main bathroom tap is leaking heavily.",
    photo_url: "",
    status: "Open",
    priority: "High",
    assigned_to: "Ramesh (Plumber)",
    admin_notes: "Assigned plumber for morning visit.",
    resolved_at: "",
    owner_rating: "",
    rowIndex: 0,
  },
  {
    id: "c-1002",
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    flat_no: "A-101",
    owner_name: "Alice Smith",
    category: "Electrical",
    description: "Corridor light outside flat flickers intermittently.",
    photo_url: "",
    status: "Resolved",
    priority: "Medium",
    assigned_to: "Suresh (Electrician)",
    admin_notes: "Replaced LED fixture bulb.",
    resolved_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    owner_rating: "5",
    rowIndex: 1,
  },
  {
    id: "c-1003",
    timestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    flat_no: "C-204",
    owner_name: "Vikram Kumar",
    category: "Lift",
    description: "Tower C Lift 2 button panel unresponsive on 2nd floor.",
    photo_url: "",
    status: "In Progress",
    priority: "High",
    assigned_to: "Otis Service Team",
    admin_notes: "Technician called, parts ordered.",
    resolved_at: "",
    owner_rating: "",
    rowIndex: 2,
  },
];

let mockOwners: (Owner & { rowIndex: number })[] = [
  { flat_no: "B-402", owner_name: "John Doe", pin: "", phone: "+91 9876543210", rowIndex: 0 },
  { flat_no: "A-101", owner_name: "Alice Smith", pin: "", phone: "+91 9876543211", rowIndex: 1 },
  { flat_no: "C-204", owner_name: "Vikram Kumar", pin: "", phone: "+91 9876543212", rowIndex: 2 },
  { flat_no: "D-501", owner_name: "Priya Sharma", pin: "", phone: "+91 9876543213", rowIndex: 3 },
];

let mockKnowledge: (KnowledgeChunk & { rowIndex: number })[] = [
  {
    id: "k-1001",
    document_id: "doc-1001",
    source_title: "Society Handbook",
    source_type: "manual",
    page_hint: "1",
    chunk_text:
      "Visitor entry is permitted between 6 AM and 10 PM. Deliveries must be registered at the gate.",
    tags: "security,visitor",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    created_by: "admin",
    rowIndex: 0,
  },
];

function hasGoogleCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSheetId(): string {
  return getEnv("GOOGLE_SHEET_ID");
}

function getClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;

  const email = getEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const rawKey = getEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

function rowToComplaint(row: string[], rowIndex: number): Complaint {
  const obj = {} as Complaint & { rowIndex: number };
  COMPLAINT_COLUMNS.forEach((key, i) => {
    (obj as any)[key] = row[i] ?? "";
  });
  obj.rowIndex = rowIndex;
  return obj;
}

function complaintToRow(c: Partial<Complaint>): string[] {
  return COMPLAINT_COLUMNS.map((key) => (c[key] ?? "") as string);
}

function rowToOwner(row: string[], rowIndex: number): Owner {
  const obj = {} as Owner;
  OWNER_COLUMNS.forEach((key, i) => {
    (obj as any)[key] = row[i] ?? "";
  });
  obj.rowIndex = rowIndex;
  return obj;
}

function rowToKnowledge(row: string[], rowIndex: number): KnowledgeChunk {
  const obj = {} as KnowledgeChunk & { rowIndex: number };
  KNOWLEDGE_COLUMNS.forEach((key, i) => {
    (obj as any)[key] = row[i] ?? "";
  });
  obj.rowIndex = rowIndex;
  return obj;
}

function knowledgeToRow(chunk: Partial<KnowledgeChunk>): string[] {
  return KNOWLEDGE_COLUMNS.map((key) => (chunk[key] ?? "") as string);
}

function isMissingRangeError(err: unknown, tabName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { message?: string; errors?: Array<{ message?: string }> };
  const needle = `Unable to parse range: ${tabName}!`;
  if (typeof anyErr.message === "string" && anyErr.message.includes(needle)) {
    return true;
  }
  return Boolean(anyErr.errors?.some((e) => typeof e?.message === "string" && e.message.includes(needle)));
}

async function ensureTabWithHeader(tabName: string, header: string[]): Promise<void> {
  const sheets = getClient();
  const spreadsheetId = getSheetId();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  const existing = meta.data.sheets?.find((s) => s.properties?.title === tabName);
  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:${String.fromCharCode(64 + header.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });
}

async function ensureKnowledgeTab(): Promise<void> {
  await ensureTabWithHeader(KNOWLEDGE_TAB, KNOWLEDGE_COLUMNS as string[]);
}

/** Fetches every complaint row. rowIndex on each result is 0-based within the data. */
export async function getAllComplaints(): Promise<Complaint[]> {
  if (!hasGoogleCredentials()) {
    return [...mockComplaints];
  }

  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${COMPLAINTS_TAB}!A2:M`,
  });
  const rows = res.data.values ?? [];
  return rows.map((row, i) => rowToComplaint(row as string[], i));
}

export async function getComplaintsByFlat(flatNo: string): Promise<Complaint[]> {
  const all = await getAllComplaints();
  return all
    .filter((c) => c.flat_no.trim().toLowerCase() === flatNo.trim().toLowerCase())
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export async function getComplaintById(id: string): Promise<Complaint | null> {
  const all = await getAllComplaints();
  return all.find((c) => c.id === id) ?? null;
}

export async function appendComplaint(complaint: Complaint): Promise<void> {
  if (!hasGoogleCredentials()) {
    mockComplaints.push({ ...complaint, rowIndex: mockComplaints.length });
    return;
  }

  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${COMPLAINTS_TAB}!A:M`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [complaintToRow(complaint)] },
  });
}

/** Looks up a tab's numeric sheetId (gid), needed for row-delete requests. */
async function getTabGid(sheets: sheets_v4.Sheets, tabName: string): Promise<number> {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: getSheetId(),
    fields: "sheets.properties",
  });
  const tab = res.data.sheets?.find((s) => s.properties?.title === tabName);
  if (tab?.properties?.sheetId == null) {
    throw new Error(`Tab not found in spreadsheet: ${tabName}`);
  }
  return tab.properties.sheetId;
}

/** Deletes every complaint row for a given flat. Used to clean up e2e test data. Returns the count removed. */
export async function deleteComplaintsByFlat(flatNo: string): Promise<number> {
  if (!hasGoogleCredentials()) {
    const before = mockComplaints.length;
    mockComplaints = mockComplaints
      .filter((c) => c.flat_no.trim().toLowerCase() !== flatNo.trim().toLowerCase())
      .map((c, i) => ({ ...c, rowIndex: i }));
    return before - mockComplaints.length;
  }

  const all = await getAllComplaints();
  const matches = all.filter(
    (c) => c.flat_no.trim().toLowerCase() === flatNo.trim().toLowerCase()
  );
  if (matches.length === 0) return 0;

  const sheets = getClient();
  const gid = await getTabGid(sheets, COMPLAINTS_TAB);

  // Delete bottom-up within the batch so earlier deletions don't shift the
  // row indices later requests in the same call still need to reference.
  const rowIndices = matches
    .map((c) => (c as any).rowIndex as number)
    .sort((a, b) => b - a);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: rowIndices.map((dataRowIndex) => ({
        deleteDimension: {
          range: {
            sheetId: gid,
            dimension: "ROWS",
            startIndex: dataRowIndex + 1, // +1: header row occupies index 0
            endIndex: dataRowIndex + 2,
          },
        },
      })),
    },
  });

  return matches.length;
}

/** Patches specific columns of a complaint row, identified by its id. */
export async function updateComplaintFields(
  id: string,
  updates: Partial<Complaint>
): Promise<Complaint> {
  const all = await getAllComplaints();
  const target = all.find((c) => c.id === id);
  if (!target) throw new Error(`Complaint not found: ${id}`);

  const merged: Complaint = { ...target, ...updates };

  if (!hasGoogleCredentials()) {
    const idx = mockComplaints.findIndex((c) => c.id === id);
    if (idx !== -1) {
      mockComplaints[idx] = { ...merged, rowIndex: idx };
    }
    return merged;
  }

  const sheets = getClient();
  const sheetRow = (target as any).rowIndex + 2;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${COMPLAINTS_TAB}!A${sheetRow}:M${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [complaintToRow(merged)] },
  });

  return merged;
}

/** Fetches all owner rows. */
export async function getAllOwners(): Promise<Owner[]> {
  if (!hasGoogleCredentials()) {
    return [...mockOwners];
  }

  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${OWNERS_TAB}!A2:D`,
  });
  const rows = res.data.values ?? [];
  return rows.map((row, i) => rowToOwner(row as string[], i));
}

/** Fetches all knowledge chunks rows. */
export async function getAllKnowledgeChunks(): Promise<KnowledgeChunk[]> {
  if (!hasGoogleCredentials()) {
    return [...mockKnowledge];
  }

  const sheets = getClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: `${KNOWLEDGE_TAB}!A2:I`,
    });
    const rows = res.data.values ?? [];
    return rows.map((row, i) => rowToKnowledge(row as string[], i));
  } catch (err) {
    if (!isMissingRangeError(err, KNOWLEDGE_TAB)) {
      throw err;
    }
    await ensureKnowledgeTab();
    return [];
  }
}

/** Appends one or more knowledge chunks. */
export async function appendKnowledgeChunks(chunks: KnowledgeChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  if (!hasGoogleCredentials()) {
    const start = mockKnowledge.length;
    mockKnowledge.push(
      ...chunks.map((chunk, idx) => ({
        ...chunk,
        rowIndex: start + idx,
      }))
    );
    return;
  }

  const sheets = getClient();
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: `${KNOWLEDGE_TAB}!A:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: chunks.map((chunk) => knowledgeToRow(chunk)),
      },
    });
  } catch (err) {
    if (!isMissingRangeError(err, KNOWLEDGE_TAB)) {
      throw err;
    }
    await ensureKnowledgeTab();
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSheetId(),
      range: `${KNOWLEDGE_TAB}!A:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: chunks.map((chunk) => knowledgeToRow(chunk)),
      },
    });
  }
}

/** Lists knowledge documents derived from grouped chunk rows. */
export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const chunks = await getAllKnowledgeChunks();
  const byDoc = new Map<string, KnowledgeDocument>();

  for (const chunk of chunks) {
    const existing = byDoc.get(chunk.document_id);
    if (!existing) {
      byDoc.set(chunk.document_id, {
        document_id: chunk.document_id,
        source_title: chunk.source_title,
        source_type: chunk.source_type,
        tags: chunk.tags,
        chunk_count: 1,
        created_at: chunk.created_at,
        created_by: chunk.created_by,
      });
      continue;
    }
    existing.chunk_count += 1;
  }

  return [...byDoc.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Deletes all knowledge chunks for a document id. Returns removed row count. */
export async function deleteKnowledgeDocumentById(documentId: string): Promise<number> {
  if (!documentId.trim()) return 0;

  if (!hasGoogleCredentials()) {
    const before = mockKnowledge.length;
    mockKnowledge = mockKnowledge
      .filter((k) => k.document_id !== documentId)
      .map((k, i) => ({ ...k, rowIndex: i }));
    return before - mockKnowledge.length;
  }

  const all = await getAllKnowledgeChunks();
  const matches = all.filter((k) => k.document_id === documentId);
  if (matches.length === 0) return 0;

  const sheets = getClient();
  const gid = await getTabGid(sheets, KNOWLEDGE_TAB);
  const rowIndices = matches
    .map((k) => (k as any).rowIndex as number)
    .sort((a, b) => b - a);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: rowIndices.map((dataRowIndex) => ({
        deleteDimension: {
          range: {
            sheetId: gid,
            dimension: "ROWS",
            startIndex: dataRowIndex + 1,
            endIndex: dataRowIndex + 2,
          },
        },
      })),
    },
  });

  return matches.length;
}

export async function getOwnerByFlat(flatNo: string): Promise<Owner | null> {
  const owners = await getAllOwners();
  return (
    owners.find((o) => o.flat_no.trim().toLowerCase() === flatNo.trim().toLowerCase()) ??
    null
  );
}

/** Sets the PIN (hash) for a flat. */
export async function setOwnerPin(flatNo: string, pinHash: string): Promise<void> {
  const owner = await getOwnerByFlat(flatNo);
  if (!owner) throw new Error(`Unknown flat: ${flatNo}`);

  if (!hasGoogleCredentials()) {
    const idx = mockOwners.findIndex(
      (o) => o.flat_no.trim().toLowerCase() === flatNo.trim().toLowerCase()
    );
    if (idx !== -1) {
      mockOwners[idx].pin = pinHash;
    }
    return;
  }

  const sheets = getClient();
  const sheetRow = owner.rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${OWNERS_TAB}!C${sheetRow}:C${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[pinHash]] },
  });
}

/** Clears the PIN for a flat (Admin reset). */
export async function resetOwnerPin(flatNo: string): Promise<void> {
  await setOwnerPin(flatNo, "");
}

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
  // RAW, not USER_ENTERED: admin-typed free text must be stored verbatim. A
  // flat_no like "3/4" would otherwise be parsed as a date and a phone like
  // "0987654321" would lose its leading zero — and flat_no is the immutable
  // join key against Complaints.
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `${OWNERS_TAB}!A:D`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [ownerToRow(owner)] },
  });

  const fetched = await getOwnerByFlat(flatNo);
  if (!fetched) {
    throw new Error(`Failed to retrieve created owner row for flat: ${flatNo}`);
  }
  return fetched;
}

/**
 * Updates owner_name and/or phone for a flat. Both fields are optional: only the
 * columns explicitly present in `updates` are written, so a caller editing one
 * field can never clobber a concurrent edit to the other. Never reads or writes
 * the pin column.
 */
export async function updateOwnerDetails(
  flatNo: string,
  updates: { owner_name?: string; phone?: string }
): Promise<Owner> {
  const owner = await getOwnerByFlat(flatNo);
  if (!owner) throw new Error(`Unknown flat: ${flatNo}`);

  const updatingName = updates.owner_name !== undefined;
  const updatingPhone = updates.phone !== undefined;

  const merged: Owner = {
    ...owner,
    owner_name: updatingName ? updates.owner_name!.trim() : owner.owner_name,
    phone: updatingPhone ? updates.phone!.trim() : owner.phone,
  };

  if (!updatingName && !updatingPhone) {
    return merged;
  }

  if (!hasGoogleCredentials()) {
    const idx = mockOwners.findIndex(
      (o) => o.flat_no.trim().toLowerCase() === flatNo.trim().toLowerCase()
    );
    if (idx !== -1) {
      mockOwners[idx] = {
        ...mockOwners[idx],
        ...(updatingName ? { owner_name: merged.owner_name } : {}),
        ...(updatingPhone ? { phone: merged.phone } : {}),
      };
    }
    return merged;
  }

  const sheets = getClient();
  const sheetRow = owner.rowIndex + 2;
  const nameRange = `${OWNERS_TAB}!B${sheetRow}:B${sheetRow}`;
  const phoneRange = `${OWNERS_TAB}!D${sheetRow}:D${sheetRow}`;

  // RAW so admin-typed text (e.g. a phone with a leading zero) is stored verbatim.
  if (updatingName && updatingPhone) {
    // One batched call: both columns land together or not at all, and it costs
    // a single round-trip instead of two.
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: nameRange, values: [[merged.owner_name]] },
          { range: phoneRange, values: [[merged.phone]] },
        ],
      },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: updatingName ? nameRange : phoneRange,
      valueInputOption: "RAW",
      requestBody: {
        values: [[updatingName ? merged.owner_name : merged.phone]],
      },
    });
  }

  return merged;
}
