import { test } from "@playwright/test";
import { expectTerminalText, gotoForge, runCommand } from "./helpers/forge";

test("executes terminal commands and streams output", async ({ page }) => {
  await gotoForge(page);

  await runCommand(page, 'echo "forge-terminal-io"');
  await expectTerminalText(page, 0, "forge-terminal-io");

  await runCommand(page, "pwd");
  await expectTerminalText(page, 0, "/home/ggos3/workspace/github.com/ggos3/forge");
});
