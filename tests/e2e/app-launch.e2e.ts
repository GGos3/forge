import { expect, test } from "@playwright/test";
import { gotoForge, expectTerminalText, visiblePaneWrappers } from "./helpers/forge";

test("launches with a tab bar and a live terminal", async ({ page }) => {
  await gotoForge(page);

  await expect(page.locator(".forge-tab")).toHaveCount(1);
  await expect(visiblePaneWrappers(page)).toHaveCount(1);
  await expectTerminalText(page, 0, "forge-e2e$");
});
