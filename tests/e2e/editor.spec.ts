import { expect, test } from "@playwright/test";
import {
  captureEvidence,
  expandNode,
  fixtureRoot,
  getExplorerNode,
  invokeMock,
  openLocalFixtureRoot,
  remoteFixtureRoot,
  saveConnectionProfile,
  selectFile,
  toggleExplorer,
  emitMockEvent,
} from "./helpers/explorer-helpers";
import { gotoForge } from "./helpers/forge";

test("editor saves local files with the keyboard shortcut", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await expandNode(page, `${fixtureRoot}/src`);
  await expandNode(page, `${fixtureRoot}/src/utils`);
  await selectFile(page, `${fixtureRoot}/src/utils/helper.ts`);

  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await page.locator('[data-testid="inline-editor-surface"] .cm-content').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("export const savedThroughShortcut = true;");

  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(1);
  await page.keyboard.press("Control+s");
  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(0);

  const savedFile = await invokeMock<{ content: string }>(page, "read_file", {
    root: fixtureRoot,
    path: "src/utils/helper.ts",
  });
  expect(savedFile.content).toContain("savedThroughShortcut");
  await captureEvidence(page, "task24-editor-keyboard-save");
});

test("editor shows markdown metadata in breadcrumbs and status bar", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await selectFile(page, `${fixtureRoot}/README.md`);

  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect(page.getByTestId("inline-editor-language")).toHaveText("Markdown");
  await expect(page.locator(".forge-editor-breadcrumbs")).toContainText("README.md");
  await expect(page.locator(".forge-editor-status")).toContainText("79 B");
  await expect(page.locator(".forge-editor-status")).toContainText("Saved");
  await captureEvidence(page, "task24-editor-markdown-metadata");
});

test("editor close keeps the explorer workspace visible", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await expandNode(page, `${fixtureRoot}/src`);
  await selectFile(page, `${fixtureRoot}/src/main.ts`);
  await expect(page.getByTestId("inline-editor")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("inline-editor")).toHaveCount(0);
  await expect(page.getByTestId("explorer-sidebar")).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/src/main.ts`)).toBeVisible();
  await captureEvidence(page, "task24-editor-close-keeps-explorer");
});

test("remote editor keeps visible content after the SSH connection drops", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  const profile = await saveConnectionProfile(page, {
    name: "Remote Disconnect Viewer",
    host: "disconnect.example.test",
    port: 22,
    username: "forge",
    authMethod: "agent",
  });

  await page.getByTestId(`connection-item-${profile.id}`).click();
  await expect(page.getByText("EXPLORER (REMOTE)")).toBeVisible();

  await expandNode(page, `${remoteFixtureRoot}/src`);
  await expandNode(page, `${remoteFixtureRoot}/src/utils`);
  await selectFile(page, `${remoteFixtureRoot}/src/utils/helper.ts`);

  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect(page.locator('[data-testid="inline-editor-surface"] .cm-content')).toContainText("Hello");

  await emitMockEvent(page, "ssh-connection-lifecycle", {
    status: "disconnected",
    profileId: profile.id,
    connectionId: "connection-1",
    reason: "Mock disconnect for visibility test",
  });

  await expect(page.locator(".forge-editor-connection-lost-badge")).toBeVisible();
  await expect(page.locator(".forge-editor-read-only-badge")).toBeVisible();
  await expect(page.locator('[data-testid="inline-editor-surface"] .cm-content')).toContainText("Hello");
  await captureEvidence(page, "task24-editor-remote-disconnect-visible-content");
});

test("editor saves local files, updates status, and reopens persisted mock content", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await expandNode(page, `${fixtureRoot}/src`);
  await expandNode(page, `${fixtureRoot}/src/utils`);
  await selectFile(page, `${fixtureRoot}/src/utils/helper.ts`);

  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect(page.getByTestId("inline-editor-language")).toHaveText("TypeScript");
  await expect(page.locator(".forge-editor-status")).toContainText("Saved");

  await page.locator('[data-testid="inline-editor-surface"] .cm-content').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("export const savedThroughButton = true;");

  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(1);
  await expect(page.locator(".forge-editor-status")).toContainText("Unsaved changes");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".forge-editor-dirty-dot")).toHaveCount(0);
  await expect(page.locator(".forge-editor-status")).toContainText("Saved");

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("inline-editor")).toHaveCount(0);

  await selectFile(page, `${fixtureRoot}/src/utils/helper.ts`);
  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect
    .poll(() => page.locator('[data-testid="inline-editor-surface"] .cm-content').textContent())
    .toContain("savedThroughButton");

  const savedFile = await invokeMock<{ content: string }>(page, "read_file", {
    root: fixtureRoot,
    path: "src/utils/helper.ts",
  });
  expect(savedFile.content).toContain("savedThroughButton");
});

test("editor handles read-only, binary, oversized, unsupported-encoding, and broken-symlink files", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await selectFile(page, `${fixtureRoot}/readonly.txt`);
  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect(page.locator(".forge-editor-read-only-badge")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("inline-editor")).toHaveCount(0);

  await selectFile(page, `${fixtureRoot}/binary.png`);
  await expect(page.getByTestId("explorer-error-banner")).toHaveText("Binary file — cannot edit (8 bytes).");

  await openLocalFixtureRoot(page);
  await selectFile(page, `${fixtureRoot}/large-file.log`);
  await expect(page.getByTestId("explorer-error-banner")).toHaveText("File too large (6.00 MB). Maximum: 5MB.");

  await openLocalFixtureRoot(page);
  await selectFile(page, `${fixtureRoot}/latin1.txt`);
  await expect(page.getByTestId("explorer-error-banner")).toHaveText(
    "Unsupported encoding. Only UTF-8 text files can be edited."
  );

  await openLocalFixtureRoot(page);
  await selectFile(page, `${fixtureRoot}/docs-link`);
  await expect(page.getByTestId("explorer-error-banner")).toHaveText(`Unknown file: ${fixtureRoot}/docs-link`);
});

test("editor saves remote files and becomes read-only after a dropped SSH connection", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  const profile = await saveConnectionProfile(page, {
    name: "Remote Editor",
    host: "remote-editor.test",
    port: 22,
    username: "forge",
    authMethod: "agent",
  });

  await page.getByTestId(`connection-item-${profile.id}`).click();
  await expect(page.getByText("EXPLORER (REMOTE)")).toBeVisible();

  await expandNode(page, `${remoteFixtureRoot}/src`);
  await expandNode(page, `${remoteFixtureRoot}/src/utils`);
  await selectFile(page, `${remoteFixtureRoot}/src/utils/helper.ts`);

  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await page.locator('[data-testid="inline-editor-surface"] .cm-content').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("export const remoteSaved = true;");
  await page.getByRole("button", { name: "Save" }).click();

  const remoteFile = await invokeMock<{ content: string }>(page, "read_remote_file", {
    connection_id: "connection-1",
    path: `${remoteFixtureRoot}/src/utils/helper.ts`,
  });
  expect(remoteFile.content).toContain("remoteSaved");

  await emitMockEvent(page, "ssh-connection-lifecycle", {
    status: "disconnected",
    profileId: profile.id,
    connectionId: "connection-1",
    reason: "Mock network drop",
  });

  await expect(page.locator(".forge-editor-connection-lost-badge")).toBeVisible();
  await expect(page.locator(".forge-editor-read-only-badge")).toBeVisible();
  await expect(page.locator(".forge-editor-status")).toContainText("Connection lost (read-only)");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
});
