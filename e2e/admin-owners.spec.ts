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

// Fixed test flat, reused across runs — there is deliberately no delete
// capability, so the suite must never accumulate rows. The create test below
// branches on whether the row already exists and asserts the real outcome of
// the create attempt either way (created, or rejected as a duplicate).
const TEST_CRUD_FLAT = "TEST-CRUD-001";

/** Resolves the next POST /api/admin/owners response — deterministic save signal. */
function waitForOwnersPost(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/admin/owners") && res.request().method() === "POST"
  );
}

test.describe.serial("Admin owner CRUD flow", () => {
  test("admin can add a new owner, and a duplicate flat is rejected", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manage Owners" }).click();
    await expect(page).toHaveURL(/\/admin\/owners/);

    // The list is server-rendered, so once any row is painted the table is complete.
    await expect(page.locator("tbody tr").first()).toBeVisible();
    const row = page.locator("tbody tr", { hasText: TEST_CRUD_FLAT });
    const alreadyExisted = (await row.count()) > 0;

    await page.getByPlaceholder("e.g. H-101").fill(TEST_CRUD_FLAT);
    await page.getByPlaceholder("Owner full name").fill("CRUD Test Owner");
    await page.getByPlaceholder("Phone").fill("9999999999");

    const createResponse = waitForOwnersPost(page);
    await page.getByRole("button", { name: "+ Add Owner" }).click();
    const createStatus = (await createResponse).status();

    const addError = page.getByTestId("add-owner-error");
    if (alreadyExisted) {
      // Duplicate flat numbers must be rejected server-side, not silently added.
      expect(createStatus).toBe(400);
      await expect(addError).toBeVisible();
      await expect(addError).toContainText(/already exists/i);
    } else {
      expect(createStatus).toBe(200);
      await expect(addError).toHaveCount(0);
      // The form only clears once the server confirms the create.
      await expect(page.getByPlaceholder("e.g. H-101")).toHaveValue("");
    }

    // Exactly one row for the flat, either way — never a duplicate.
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
  });

  test("admin can edit an existing owner's name and phone, and it persists on reload", async ({
    page,
  }) => {
    // Unique values per run: an edit that matches the stored value is a no-op,
    // which would make this test silently untrue on the second run onwards.
    const stamp = String(Date.now()).slice(-9);
    const updatedName = `Updated CRUD Owner ${stamp}`;
    // Leading zero on purpose: the write must be RAW, not number-coerced.
    const updatedPhone = `0${stamp}`;

    await loginAsAdmin(page);
    await page.goto("/admin/owners");
    await page.getByPlaceholder("🔍 Search flat or owner name...").fill(TEST_CRUD_FLAT);

    const row = page.locator("tbody tr", { hasText: TEST_CRUD_FLAT });
    await expect(row).toBeVisible();

    const nameInput = row.locator("input").nth(0);
    await nameInput.fill(updatedName);
    await nameInput.blur();
    await expect(page.getByText(`Updated Flat ${TEST_CRUD_FLAT}.`)).toBeVisible();

    // Editing only the phone must not carry the name along, so the name saved
    // above has to survive this second, independent save.
    const phoneSaved = waitForOwnersPost(page);
    const phoneInput = row.locator("input").nth(1);
    await phoneInput.fill(updatedPhone);
    await phoneInput.blur();
    expect((await phoneSaved).status()).toBe(200);

    await page.reload();
    await page.getByPlaceholder("🔍 Search flat or owner name...").fill(TEST_CRUD_FLAT);
    const rowAfterReload = page.locator("tbody tr", { hasText: TEST_CRUD_FLAT });
    await expect(rowAfterReload.locator("input").nth(0)).toHaveValue(updatedName);
    await expect(rowAfterReload.locator("input").nth(1)).toHaveValue(updatedPhone);
  });

  test("flat_no has no edit control and there is no delete button on the page", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/owners");
    await page.getByPlaceholder("🔍 Search flat or owner name...").fill(TEST_CRUD_FLAT);

    const row = page.locator("tbody tr", { hasText: TEST_CRUD_FLAT });
    await expect(row).toBeVisible();
    // Only 2 inputs per row: owner_name and phone. flat_no is plain text, not an input.
    await expect(row.locator("input")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
  });
});
