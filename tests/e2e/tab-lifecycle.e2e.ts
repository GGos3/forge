import { expect, test } from "@playwright/test";
import { expectTerminalText, gotoForge, openNewTab, runCommand } from "./helpers/forge";

test("creates, switches, and closes tabs while preserving terminal state", async ({ page }) => {
  await gotoForge(page);

  await runCommand(page, 'echo "tab-one"');
  await expectTerminalText(page, 0, "tab-one");

  await openNewTab(page, "bash");
  await runCommand(page, 'echo "tab-two"');
  await expectTerminalText(page, 0, "tab-two");

  await page.locator(".forge-tab").first().click();
  await expectTerminalText(page, 0, "tab-one");

  await page.locator(".forge-tab").nth(1).click();
  await expectTerminalText(page, 0, "tab-two");

  await page.locator('[data-testid^="close-tab-"]').nth(1).click();
  await expect(page.locator(".forge-tab")).toHaveCount(1);
});
