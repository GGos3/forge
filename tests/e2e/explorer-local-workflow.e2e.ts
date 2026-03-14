import { expect, test } from "@playwright/test";
import { gotoForge } from "./helpers/forge";
import { expandNode, selectFile, toggleExplorer } from "./helpers/explorer-helpers";

const fixtureRoot = "/home/ggos3/workspace/github.com/ggos3/forge/tests/fixtures/explorer/project-root";

test("local explorer browse open and save workflow uses IPC path", async ({ page }) => {
  await gotoForge(page);

  await toggleExplorer(page);
  await expect(page.getByTestId("explorer-sidebar")).toBeVisible();

  await page.getByTestId("explorer-open-folder-btn").click();
  await expect(page.locator('[data-path="' + `${fixtureRoot}/src` + '"]')).toBeVisible();

  await expandNode(page, `${fixtureRoot}/src`);
  await expect(page.locator('[data-path="' + `${fixtureRoot}/src/main.ts` + '"]')).toBeVisible();

  await selectFile(page, `${fixtureRoot}/src/main.ts`);
  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(0);

  await page.locator('[data-testid="inline-editor-surface"] .cm-content').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("// e2e save");
  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(1);

  await page.keyboard.press("Control+s");
  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(0);
});
