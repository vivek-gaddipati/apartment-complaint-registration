import { expect, test } from "@playwright/test";
import { TEST_FLAT, resetOwnerPin, signInOwner } from "./helpers";

const PIN = "4821";

test.describe.serial("Owner assistant flow", () => {
  test("owner sees latest assistant answers at the top of chat", async ({ page, request }) => {
    await resetOwnerPin(request, TEST_FLAT);
    await signInOwner(page, TEST_FLAT, PIN);

    await page.getByRole("link", { name: "Ask Society Assistant" }).click();
    await expect(page).toHaveURL(/\/owner\/assistant/);

    const input = page.getByPlaceholder("Example: What are the visitor entry timings?");

    await input.fill("What are visitor entry timings?");
    await page.getByRole("button", { name: "Ask Assistant" }).click();

    // Wait for first reply to be added.
    await expect(page.getByTestId("chat-turn")).toHaveCount(3);
    await expect(page.getByTestId("chat-turn").first().getByTestId("chat-role")).toHaveText("Assistant");

    const secondQuestion = "Is overnight guest entry allowed?";
    await input.fill(secondQuestion);
    await page.getByRole("button", { name: "Ask Assistant" }).click();

    // Intro + (2 user + 2 assistant) = 5 turns.
    await expect(page.getByTestId("chat-turn")).toHaveCount(5);

    const turns = page.getByTestId("chat-turn");
    const latestTurn = turns.first();
    const latestRole = latestTurn.getByTestId("chat-role");
    await expect(latestRole).toHaveText("Assistant");
    await expect(latestTurn.getByTestId("chat-text")).toContainText(/guest|entry|knowledge|policy|document/i);

    const secondLatestTurn = turns.nth(1);
    await expect(secondLatestTurn.getByTestId("chat-role")).toHaveText("You");
    await expect(secondLatestTurn.getByTestId("chat-text")).toContainText(secondQuestion);
  });
});