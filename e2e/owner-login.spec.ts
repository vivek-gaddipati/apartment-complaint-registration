import { test, expect } from "@playwright/test";
import { TEST_FLAT, resetOwnerPin, createPinAndSignIn, signInWithPin, signOutOwner } from "./helpers";

const PIN = "4821";

// Serial: each test builds on the PIN state left behind by the previous one,
// mirroring the real lifecycle of a flat's PIN (unset -> set -> verified).
test.describe.serial("Owner PIN login flow", () => {
  test.beforeAll(async ({ request }) => {
    await resetOwnerPin(request, TEST_FLAT);
  });

  test("first-time visitor is prompted to create a PIN", async ({ page }) => {
    await createPinAndSignIn(page, TEST_FLAT, PIN);
    await expect(page.getByRole("heading", { name: "Tester Tester" })).toBeVisible();
    await expect(page.getByText(`Flat ${TEST_FLAT}`)).toBeVisible();
    await signOutOwner(page);
  });

  test("returning owner can sign in with the PIN they just set", async ({ page }) => {
    await signInWithPin(page, TEST_FLAT, PIN);
    await expect(page).toHaveURL(/\/owner\/dashboard/);
    await expect(page.getByRole("heading", { name: "Tester Tester" })).toBeVisible();
    await signOutOwner(page);
  });

  test("wrong PIN is rejected and does not sign the owner in", async ({ page }) => {
    await signInWithPin(page, TEST_FLAT, "0000");
    await expect(page.getByText("Incorrect PIN.")).toBeVisible();
    await expect(page).toHaveURL(/\/owner$/);
  });

  test("PIN set on first visit is still valid after a fresh page load (regression: was resetting every login)", async ({
    page,
  }) => {
    await signInWithPin(page, TEST_FLAT, PIN);
    await expect(page).toHaveURL(/\/owner\/dashboard/);
  });
});
