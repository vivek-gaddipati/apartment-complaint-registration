import { deleteComplaintsByFlat } from "./src/lib/sheets";

// Duplicated from helpers.ts rather than imported: keeps this script's
// dependency graph minimal since it runs outside the normal test context.
const TEST_FLAT = "TEST-001";

export default async function globalTeardown() {
  const removed = await deleteComplaintsByFlat(TEST_FLAT);
  // eslint-disable-next-line no-console
  console.log(`[global-teardown] removed ${removed} test complaint row(s) for ${TEST_FLAT}`);
}
