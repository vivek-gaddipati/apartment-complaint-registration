import { APIRequestContext, Page, expect } from "@playwright/test";

export const TEST_FLAT = "TEST-001";

function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    throw new Error(
      "ADMIN_PASSWORD is not set — e2e tests need it to reset the test flat's PIN via the admin API."
    );
  }
  return pw;
}

/** Logs in as admin and clears the given flat's PIN, so it's back in "first-time setup" state. */
export async function resetOwnerPin(request: APIRequestContext, flatNo: string) {
  const login = await request.post("/api/admin/login", {
    data: { password: adminPassword() },
  });
  expect(login.ok(), "admin login should succeed with ADMIN_PASSWORD from .env.local").toBeTruthy();

  const reset = await request.post("/api/admin/owners", {
    data: { flat_no: flatNo, action: "reset_pin" },
  });
  expect(reset.ok(), `reset_pin should succeed for ${flatNo}`).toBeTruthy();
}

async function enterFlatNumber(page: Page, flatNo: string) {
  await page.goto("/owner");
  const flatInput = page.getByPlaceholder("e.g. B-402 or A-101");
  await flatInput.fill(flatNo);
  await expect(flatInput).toHaveValue(flatNo);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/owner/check-flat") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Continue →" }).click(),
  ]);
}

/** Drives the owner login UI through first-time PIN setup and lands on the dashboard. */
export async function createPinAndSignIn(page: Page, flatNo: string, pin: string) {
  await enterFlatNumber(page, flatNo);

  await expect(page.getByText("First-Time Setup:")).toBeVisible();
  const pinInputs = page.locator('input[type="password"]');
  await pinInputs.nth(0).fill(pin);
  await pinInputs.nth(1).fill(pin);
  await page.getByRole("button", { name: "Set PIN & Enter Portal" }).click();

  await expect(page).toHaveURL(/\/owner\/dashboard/);
}

/** Drives the owner login UI through the returning-user PIN check (no confirm field). */
export async function signInWithPin(page: Page, flatNo: string, pin: string) {
  await enterFlatNumber(page, flatNo);

  await expect(page.getByText("Enter your 4-digit security PIN")).toBeVisible();
  await page.locator('input[type="password"]').fill(pin);
  await page.getByRole("button", { name: "Sign In to Dashboard" }).click();
}

/** Gets an owner signed in regardless of whether the flat's PIN is already set. */
export async function signInOwner(page: Page, flatNo: string, pin: string) {
  await enterFlatNumber(page, flatNo);

  const pinInputs = page.locator('input[type="password"]');
  await pinInputs.first().waitFor();
  const isFirstTime = (await pinInputs.count()) === 2;

  if (isFirstTime) {
    await pinInputs.nth(0).fill(pin);
    await pinInputs.nth(1).fill(pin);
    await page.getByRole("button", { name: "Set PIN & Enter Portal" }).click();
  } else {
    await pinInputs.first().fill(pin);
    await page.getByRole("button", { name: "Sign In to Dashboard" }).click();
  }
  await expect(page).toHaveURL(/\/owner\/dashboard/);
}

export async function signOutOwner(page: Page) {
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL("/");
}
