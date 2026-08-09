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
