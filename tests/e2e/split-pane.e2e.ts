import { expect, test } from "@playwright/test";
import {
  dispatchShortcut,
  expectTerminalReady,
  focusPane,
  gotoForge,
  visiblePaneWrappers,
} from "./helpers/forge";

test("splits panes, moves focus, and resizes the divider", async ({ page }) => {
  await gotoForge(page);

  await focusPane(page, 0);
  await dispatchShortcut(page, { ctrlKey: true, shiftKey: true, key: "D" });

  await expect(visiblePaneWrappers(page)).toHaveCount(2);
  await expectTerminalReady(page, 1);
  await expect(visiblePaneWrappers(page).nth(1)).toHaveAttribute("data-focused", "true");

  await dispatchShortcut(page, { altKey: true, key: "ArrowLeft" });
  await expect(visiblePaneWrappers(page).nth(0)).toHaveAttribute("data-focused", "true");

  const divider = page.getByTestId("pane-divider");
  const before = await visiblePaneWrappers(page).nth(0).boundingBox();
  const dividerBox = await divider.boundingBox();
  if (!before || !dividerBox) {
    throw new Error("Pane geometry unavailable");
  }

  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 80, dividerBox.y + dividerBox.height / 2);
  await page.mouse.up();

  const after = await visiblePaneWrappers(page).nth(0).boundingBox();
  expect(after?.width).not.toBe(before.width);
});
