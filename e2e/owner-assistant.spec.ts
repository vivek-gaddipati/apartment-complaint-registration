import { expect, test } from "@playwright/test";
import { TEST_FLAT, resetOwnerPin, signInOwner } from "./helpers";

const PIN = "4821";

test.describe.serial("Owner assistant flow", () => {
  test("owner sees latest assistant answers at the top of chat", async ({ page, request }) => {
    await resetOwnerPin(request, TEST_FLAT);
    await signInOwner(page, TEST_FLAT, PIN);

    await page.getByRole("link", { name: "Ask Society Assistant" }).click();
    await expect(page).toHaveURL(/\/owner\/assistant/);
    expect(new URL(page.url()).hostname).toBe("localhost");
    await expect(page.getByTestId("assistant-intro")).toContainText(
      "Ask me about society rules, visitor policy, parking, and other handbook topics."
    );
    await expect(page.getByTestId("assistant-chat")).not.toContainText(
      "Ask me about society rules, visitor policy, parking, and other handbook topics."
    );
    await expect(page.getByTestId("assistant-question-box")).toContainText("Ask a policy question");

    const sectionOrder = await page.evaluate(() => {
      const intro = document.querySelector('[data-testid="assistant-intro"]');
      const questionBox = document.querySelector('[data-testid="assistant-question-box"]');
      const chat = document.querySelector('[data-testid="assistant-chat"]');
      if (!intro || !questionBox || !chat) return "missing";
      const introBeforeQuestion = Boolean(
        intro.compareDocumentPosition(questionBox) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const questionBeforeChat = Boolean(
        questionBox.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      return introBeforeQuestion && questionBeforeChat ? "correct" : "wrong";
    });
    expect(sectionOrder).toBe("correct");

    const questions = [
      "What are visitor entry timings?",
      "Is overnight guest entry allowed?",
      "What are the parking rules for visitors?",
    ];
    const answers = [
      "Visitor entry timings are available in the resident policy documents.",
      "Overnight guest entry is covered by the visitor entry policy documents.",
      "Visitor parking rules are listed in the parking policy documents.",
    ];

    await page.route("**/api/owner/assistant", async (route) => {
      const request = route.request().postDataJSON() as { question?: string };
      const answerIndex = Math.max(0, questions.indexOf(request.question || ""));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          answer: answers[answerIndex],
          sources: ["Visitor Policy.pdf (section 1)"],
        }),
      });
    });

    const input = page.getByPlaceholder("Example: What are the visitor entry timings?");

    for (const [index, question] of questions.entries()) {
      await input.fill(question);
      await expect(input).toHaveValue(question);
      await page.getByTestId("ask-assistant-button").click();
      await expect(page.getByTestId("chat-turn")).toHaveCount((index + 1) * 2);
      await expect(page.getByTestId("chat-turn").nth(1).getByTestId("chat-text")).toContainText(question);
    }

    // Three user turns + three assistant turns; intro lives in its own box.
    await expect(page.getByTestId("chat-turn")).toHaveCount(6);

    const turns = page.getByTestId("chat-turn");
    const expectedOrder = [
      { role: "Assistant", text: answers[2] },
      { role: "You", text: questions[2] },
      { role: "Assistant", text: answers[1] },
      { role: "You", text: questions[1] },
      { role: "Assistant", text: answers[0] },
      { role: "You", text: questions[0] },
    ];

    for (const [index, expected] of expectedOrder.entries()) {
      await expect(turns.nth(index).getByTestId("chat-role")).toHaveText(expected.role);
      await expect(turns.nth(index).getByTestId("chat-text")).toContainText(expected.text);
    }
  });
});