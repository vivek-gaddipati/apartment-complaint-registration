import { expect, test } from "@playwright/test";

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

function waitForKnowledgePost(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/admin/knowledge") && res.request().method() === "POST"
  );
}

function waitForKnowledgeDelete(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/admin/knowledge") && res.request().method() === "DELETE"
  );
}

test.describe.serial("Admin knowledge base flow", () => {
  test("admin can upload and delete a knowledge document", async ({ page }) => {
    const stamp = Date.now();
    const title = `E2E Knowledge Guide ${stamp}`;

    await loginAsAdmin(page);
    await page.getByRole("link", { name: /knowledge base/i }).click();
    await expect(page).toHaveURL(/\/admin\/assistant/);

    await page.getByPlaceholder("Society handbook 2026").fill(title);
    await page.getByPlaceholder("parking, security, visitor").fill("e2e,knowledge");

    await page.locator('input[type="file"]').setInputFiles({
      name: `e2e-knowledge-${stamp}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Visitor parking is allowed in P1 to P8 between 6 AM and 10 PM. Security desk should log overnight guests.",
        "utf8"
      ),
    });

    const uploadResponse = waitForKnowledgePost(page);
    await page.getByRole("button", { name: /upload document/i }).click();
    expect((await uploadResponse).status()).toBe(200);

    const row = page.locator("tr", { hasText: title });
    await expect(row).toBeVisible();

    const deleteResponse = waitForKnowledgeDelete(page);
    await row.getByRole("button", { name: "Delete" }).click();
    expect((await deleteResponse).status()).toBe(200);
    await expect(row).toHaveCount(0);
  });
});