import { expect, test } from "@playwright/test";
import { dispatchShortcut, expectTerminalText, focusPane, gotoForge, openNewTab, runCommand, visiblePaneWrappers } from "./helpers/forge";

test("keeps split-pane and tab state isolated across an end-to-end flow", async ({ page }) => {
  await gotoForge(page);

  await runCommand(page, 'echo "left-pane"');
  await dispatchShortcut(page, { ctrlKey: true, shiftKey: true, key: "D" });
  await expect(visiblePaneWrappers(page)).toHaveCount(2);

  await runCommand(page, 'echo "right-pane"', 1);
  await expectTerminalText(page, 1, "right-pane");

  await openNewTab(page, "bash");
  await runCommand(page, 'echo "second-tab"');
  await expectTerminalText(page, 0, "second-tab");

  await page.locator(".forge-tab").first().click();
  await expect(page.locator(".forge-tab").first()).toHaveAttribute("data-active", "true");
  await expect(visiblePaneWrappers(page)).toHaveCount(2);

  await focusPane(page, 0);
  await expect(visiblePaneWrappers(page).nth(0)).toHaveAttribute("data-focused", "true");

  await focusPane(page, 1);
  await expectTerminalText(page, 1, "right-pane");
});
