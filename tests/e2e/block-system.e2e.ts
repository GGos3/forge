import { expect, test } from "@playwright/test";
import { gotoForge, runCommand } from "./helpers/forge";

test("renders block actions for completed commands", async ({ page }) => {
  await gotoForge(page);

  await runCommand(page, 'echo "block-output"');

  const blocks = page.getByTestId("block-overlay").locator(".forge-block-divider");
  await expect(blocks).toHaveCount(1);
  await blocks.first().getByTitle("Copy Output").click();

  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("block-output");
});

test("marks non-zero exit blocks as errors", async ({ page }) => {
  await gotoForge(page);

  await runCommand(page, "false");

  const errorBlock = page.getByTestId("block-overlay").locator(".forge-block-divider").last();
  await expect(errorBlock).toHaveClass(/forge-block-error/);
});
