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

  test("photo attachment offers camera capture when available", async ({ page }) => {
    await page.getByRole("link", { name: "Submit New Complaint" }).click();

    const photoInput = page.locator('input[type="file"]');
    await expect(photoInput).toHaveAttribute("accept", "image/*");
    await expect(photoInput).toHaveAttribute("capture", "environment");
  });

  test("owner can submit an anonymous complaint", async ({ page, request }) => {
    const description = `Anonymous E2E test complaint ${Date.now()}`;

    await page.getByRole("link", { name: "Submit New Complaint" }).click();
    await page.getByRole("button", { name: "Noise" }).click();
    await page.getByPlaceholder(/Describe the issue in detail/).fill(description);
    await page.getByRole("checkbox", { name: "Submit anonymously" }).check();
    await page.getByRole("button", { name: "Submit Complaint Ticket →" }).click();

    await expect(page.getByText("Complaint Registered!")).toBeVisible();

    const adminLogin = await request.post("/api/admin/login", {
      data: { password: process.env.ADMIN_PASSWORD },
    });
    expect(adminLogin.ok()).toBeTruthy();
    const complaintsResponse = await request.get("/api/admin/complaints");
    const { complaints } = await complaintsResponse.json();
    const complaint = complaints.find((item: { description: string }) => item.description === description);

    expect(complaint).toMatchObject({ flat_no: "", owner_name: "" });
  });
});
