import { test, expect } from "@playwright/test";
import { TEST_FLAT, resetOwnerPin, signInOwner } from "./helpers";

const PIN = "4821";

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

test.describe("Admin dashboard flow", () => {
  test("rejects an incorrect password", async ({ page }) => {
    await page.goto("/admin");
    await page.getByPlaceholder("Enter management password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign In to Admin Dashboard →" }).click();
    await expect(page.getByText("Incorrect password.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("logs in and sees the complaints table", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("heading", { name: "Admin Operations" })).toBeVisible();
    await expect(page.getByText("Total Tickets", { exact: true })).toBeVisible();
  });

  test("can update a complaint's status inline and it persists on refresh", async ({
    page,
    request,
  }) => {
    // Seed a fresh complaint to edit, via the owner flow, so this test doesn't
    // depend on pre-existing rows in the real Sheet.
    await resetOwnerPin(request, TEST_FLAT);
    await signInOwner(page, TEST_FLAT, PIN);
    const description = `E2E admin-edit target ${Date.now()}`;
    await page.getByRole("link", { name: "Submit New Complaint" }).click();
    await page.getByRole("button", { name: "Electrical" }).click();
    await page.getByPlaceholder(/Describe the issue in detail/).fill(description);
    await page.getByRole("button", { name: "Submit Complaint Ticket →" }).click();
    await expect(page.getByText("Complaint Registered!")).toBeVisible();

    await loginAsAdmin(page);
    await page.getByPlaceholder(/Search flat, category, keyword/).fill(description);

    const row = page.locator("tr", { hasText: description });
    await expect(row).toBeVisible();
    await row.locator("select").first().selectOption("In Progress");
    await expect(page.getByText("Complaint updated.")).toBeVisible();

    await page.reload();
    await page.getByPlaceholder(/Search flat, category, keyword/).fill(description);
    const rowAfterReload = page.locator("tr", { hasText: description });
    await expect(rowAfterReload.locator("select").first()).toHaveValue("In Progress");
  });
});
