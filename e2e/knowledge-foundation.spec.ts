import { expect, test } from "@playwright/test";

const GOOGLE_ENV_KEYS = [
  "GOOGLE_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
] as const;

test.describe.serial("Knowledge foundation storage helpers", () => {
  let originalEnv: Record<string, string | undefined> = {};

  test.beforeAll(() => {
    for (const key of GOOGLE_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  test.afterAll(() => {
    for (const key of GOOGLE_ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  test("can append, list, and delete knowledge document chunks", async () => {
    const stamp = Date.now();
    const documentId = `e2e-doc-${stamp}`;
    const title = `E2E Resident Guide ${stamp}`;

    const {
      appendKnowledgeChunks,
      deleteKnowledgeDocumentById,
      getAllKnowledgeChunks,
      listKnowledgeDocuments,
    } = await import("../src/lib/sheets");

    const beforeChunks = await getAllKnowledgeChunks();

    await appendKnowledgeChunks([
      {
        id: `e2e-chunk-a-${stamp}`,
        document_id: documentId,
        source_title: title,
        source_type: "pdf",
        page_hint: "1",
        chunk_text: "Visitor parking is allowed in slots P1 to P8 from 6 AM to 10 PM.",
        tags: "parking,visitor",
        created_at: new Date().toISOString(),
        created_by: "e2e",
      },
      {
        id: `e2e-chunk-b-${stamp}`,
        document_id: documentId,
        source_title: title,
        source_type: "pdf",
        page_hint: "2",
        chunk_text: "Security gate closes at 11 PM and opens at 5 AM for emergency access only.",
        tags: "security,timings",
        created_at: new Date().toISOString(),
        created_by: "e2e",
      },
    ]);

    const docs = await listKnowledgeDocuments();
    const doc = docs.find((d) => d.document_id === documentId);
    expect(doc, "newly appended document should appear in grouped document list").toBeDefined();
    expect(doc?.source_title).toBe(title);
    expect(doc?.chunk_count).toBe(2);

    const allChunks = await getAllKnowledgeChunks();
    const inserted = allChunks.filter((c) => c.document_id === documentId);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].source_type).toBe("pdf");
    expect(inserted[0].page_hint).toBeTruthy();

    const removed = await deleteKnowledgeDocumentById(documentId);
    expect(removed).toBe(2);

    const afterChunks = await getAllKnowledgeChunks();
    expect(afterChunks.filter((c) => c.document_id === documentId)).toHaveLength(0);
    expect(afterChunks.length).toBe(beforeChunks.length);
  });
});
