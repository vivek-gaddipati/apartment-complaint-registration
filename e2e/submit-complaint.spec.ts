import { test, expect } from "@playwright/test";
import { TEST_FLAT, resetOwnerPin, signInOwner } from "./helpers";

const PIN = "4821";

test.describe("Submit complaint flow", () => {
  test.beforeAll(async ({ request }) => {
    await resetOwnerPin(request, TEST_FLAT);
  });

  test.beforeEach(async ({ page }) => {
    await signInOwner(page, TEST_FLAT, PIN);
  });

  test("owner can submit a complaint and see it appear as Open", async ({ page }) => {
    const description = `E2E test complaint ${Date.now()}`;

    await page.getByRole("link", { name: "Submit New Complaint" }).click();
    await expect(page).toHaveURL(/\/owner\/submit/);

    await page.getByRole("button", { name: "Plumbing" }).click();
    await page.getByPlaceholder(/Describe the issue in detail/).fill(description);
    await page.getByRole("button", { name: "Submit Complaint Ticket →" }).click();

    await expect(page.getByText("Complaint Registered!")).toBeVisible();
    const ticketId = await page.locator("span.font-mono").innerText();
    expect(ticketId.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Back to My Complaints →" }).click();
    await expect(page).toHaveURL(/\/owner\/dashboard/);

    const complaintCard = page.locator("li", { hasText: description });
    await expect(complaintCard).toBeVisible();
    await expect(complaintCard.getByText("Open", { exact: true })).toBeVisible();
    await expect(complaintCard.getByText("Plumbing", { exact: true })).toBeVisible();
  });

  test("category selection auto-suggests a priority", async ({ page }) => {
    await page.getByRole("link", { name: "Submit New Complaint" }).click();
    await page.getByRole("button", { name: "Security" }).click();
    await expect(page.getByText("Auto-suggested priority:")).toBeVisible();
  });
});
