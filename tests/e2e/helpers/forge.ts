import { expect, type Locator, type Page } from "@playwright/test";

const PROMPT_TEXT = "forge-e2e$";

type ShortcutPayload = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export async function gotoForge(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await expect(visiblePaneWrappers(page)).toHaveCount(1);
  await expectTerminalReady(page, 0);
}

function activeTabPanel(page: Page): Locator {
  return page.locator(".forge-tab-panel:visible");
}

export function visiblePaneWrappers(page: Page): Locator {
  return activeTabPanel(page).locator(".forge-pane-terminal-wrapper");
}

export function visibleTerminalPanes(page: Page): Locator {
  return activeTabPanel(page).getByTestId("terminal-pane");
}

export async function expectTerminalReady(page: Page, index = 0): Promise<void> {
  await expect(visibleTerminalPanes(page).nth(index)).toBeVisible();
  await expectTerminalText(page, index, PROMPT_TEXT);
}

export async function focusPane(page: Page, index = 0): Promise<void> {
  const pane = visiblePaneWrappers(page).nth(index);
  await pane.click({ position: { x: 24, y: 24 } });
  await expect(pane).toHaveAttribute("data-focused", "true");
}

export async function runCommand(page: Page, command: string, index = 0): Promise<void> {
  await focusPane(page, index);
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

export async function dispatchShortcut(page: Page, init: ShortcutPayload): Promise<void> {
  await page.evaluate((eventInit: ShortcutPayload) => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...eventInit,
      })
    );
  }, init);
}

export async function openNewTab(page: Page, shell: string = "bash"): Promise<void> {
  await page.getByTestId("new-tab-button").click();
  await expect(page.getByTestId("new-tab-dialog")).toBeVisible();
  await page.getByTestId(`shell-option-${shell}`).click();
  await expect(page.locator(".forge-tab")).toHaveCount(2);
  await expectTerminalReady(page, 0);
}

export async function expectTerminalText(page: Page, index: number, expectedText: string): Promise<void> {
  await expect.poll(async () => readTerminalText(page, index)).toContain(expectedText);
}

export async function readTerminalText(page: Page, index = 0): Promise<string> {
  return visiblePaneWrappers(page)
    .nth(index)
    .evaluate((node: Element) => {
      const terminalSurface = node.querySelector('[data-testid="terminal-surface"]');
      if (!terminalSurface) {
        return "";
      }

      const renderedRows = Array.from(terminalSurface.querySelectorAll(".xterm-rows")).map((row) =>
        row instanceof HTMLElement ? row.innerText : (row.textContent ?? "")
      );
      const text = renderedRows.length > 0
        ? renderedRows.join(" ")
        : terminalSurface instanceof HTMLElement
          ? terminalSurface.innerText
          : (terminalSurface.textContent ?? "");

      return text.replace(/\s+/g, " ").trim();
    });
}
