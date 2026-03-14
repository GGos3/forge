import { expect, test } from "@playwright/test";
import {
  captureEvidence,
  fixtureRoot,
  getExplorerNode,
  invokeMock,
  openLocalFixtureRoot,
  remoteFixtureRoot,
  saveConnectionProfile,
  setPendingHostKeyVerification,
  toggleExplorer,
} from "./helpers/explorer-helpers";
import { gotoForge } from "./helpers/forge";

test("explorer toggles from the header close button and shortcut", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  await expect(page.getByTestId("sidebar-panel")).toBeVisible();
  await toggleExplorer(page);
  await expect(page.getByTestId("sidebar-panel")).toHaveCount(0);

  await toggleExplorer(page);
  await expect(page.getByTestId("sidebar-panel")).toBeVisible();
  await captureEvidence(page, "task24-explorer-toggle-shortcut");
});

test("explorer empty state opens the local fixture root", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  await expect(page.getByTestId("explorer-no-root-empty-state")).toBeVisible();
  await page.getByTestId("explorer-empty-open-folder-btn").click();

  await expect(page.getByTestId("explorer-root-path-placeholder")).toHaveText(fixtureRoot);
  await expect(getExplorerNode(page, `${fixtureRoot}/src`)).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/README.md`)).toBeVisible();
  await captureEvidence(page, "task24-explorer-empty-state-open-folder");
});

test("explorer expands and collapses local directories with mouse clicks", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await getExplorerNode(page, `${fixtureRoot}/src`).click();
  await expect(getExplorerNode(page, `${fixtureRoot}/src/main.ts`)).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/src/utils`)).toBeVisible();
  await captureEvidence(page, "task24-explorer-expand-collapse-expanded");

  await getExplorerNode(page, `${fixtureRoot}/src`).click();
  await expect(getExplorerNode(page, `${fixtureRoot}/src/main.ts`)).toHaveCount(0);
  await expect(getExplorerNode(page, `${fixtureRoot}/src/utils`)).toHaveCount(0);
});

test("connection manager edits and deletes mock-backed SSH profiles", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  const profile = await saveConnectionProfile(page, {
    name: "Editable SSH",
    host: "edit.example.test",
    port: 22,
    username: "forge",
    authMethod: "key",
    keyPath: "~/.ssh/id_ed25519",
  });

  await page.getByTestId(`btn-edit-${profile.id}`).click();
  await expect(page.getByTestId("connection-manager-dialog")).toBeVisible();
  await expect(page.getByTestId("input-host")).toHaveValue("edit.example.test");
  await expect(page.getByTestId("select-auth")).toHaveValue("key");
  await expect(page.getByTestId("input-key")).toHaveValue("~/.ssh/id_ed25519");

  await page.getByTestId("input-host").fill("updated.example.test");
  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("connection-manager-dialog")).toHaveCount(0);

  const profiles = await invokeMock<Array<{ id: string; host: string }>>(page, "list_connections");
  expect(profiles).toContainEqual(expect.objectContaining({ id: profile.id, host: "updated.example.test" }));
  await captureEvidence(page, "task24-connection-manager-edit-profile");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId(`btn-delete-${profile.id}`).click();
  await expect(page.getByTestId(`connection-item-${profile.id}`)).toHaveCount(0);
});

test("explorer shows local git, symlink, permission, and keyboard-navigation flows", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  await expect(page.getByTestId("explorer-no-root-empty-state")).toBeVisible();
  await openLocalFixtureRoot(page);

  await expect(page.getByTestId("explorer-root-path-placeholder")).toHaveText(fixtureRoot);
  await expect(page.getByText("EXPLORER (LOCAL)")).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/.hidden-dir`)).toHaveCount(0);

  await expect(getExplorerNode(page, `${fixtureRoot}/README.md`).locator('.forge-git-badge[data-status="modified"]')).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/src`).locator('.forge-git-badge[data-status="staged"]')).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/readonly.txt`).locator('.forge-git-badge[data-status="untracked"]')).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/docs-link`).locator('[aria-label="symlink"]')).toBeVisible();
  await expect(getExplorerNode(page, `${fixtureRoot}/forbidden-dir`).locator('[aria-label="Permission denied"]')).toBeVisible();

  await page.locator(".forge-file-tree").focus();
  await page.keyboard.press("ArrowDown");
  await expect(getExplorerNode(page, `${fixtureRoot}/src`)).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("ArrowRight");
  await expect(getExplorerNode(page, `${fixtureRoot}/src/main.ts`)).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(getExplorerNode(page, `${fixtureRoot}/src/utils`)).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("ArrowDown");
  await expect(getExplorerNode(page, `${fixtureRoot}/src/main.ts`)).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("inline-editor")).toBeVisible();
  await expect(page.getByTestId("inline-editor-language")).toHaveText("TypeScript");
});

test("explorer surfaces directory expansion errors for inaccessible mock nodes", async ({ page }) => {
  await gotoForge(page);
  await openLocalFixtureRoot(page);

  await getExplorerNode(page, `${fixtureRoot}/forbidden-dir`).click();

  await expect(page.getByTestId("explorer-error-banner")).toHaveText(
    `Unknown directory: ${fixtureRoot}/forbidden-dir`
  );
});

test("explorer connects to a remote workspace and resets after disconnect", async ({ page }) => {
  await gotoForge(page);
  await toggleExplorer(page);

  const profile = await saveConnectionProfile(page, {
    name: "Fixture SSH",
    host: "example.test",
    port: 22,
    username: "forge",
    authMethod: "agent",
  });

  await page.getByTestId(`connection-item-${profile.id}`).click();

  await expect(page.getByText("EXPLORER (REMOTE)")).toBeVisible();
  await expect(page.getByTestId("explorer-root-path-placeholder")).toHaveText("forge@example.test:22/");
  await expect(getExplorerNode(page, `${remoteFixtureRoot}/src`)).toBeVisible();
  await expect(getExplorerNode(page, `${remoteFixtureRoot}/README.md`).locator(".forge-git-badge")).toHaveCount(0);

  await page.getByTitle("Disconnect").click();

  await expect(page.getByTestId("explorer-error-banner")).toHaveText(
    "SSH connection lost. Reconnect and reopen the remote workspace."
  );
  await expect(page.getByTestId("explorer-no-root-empty-state")).toBeVisible();
});

test("explorer host-key dialog covers first-use and mismatch prompts", async ({ page }) => {
  await gotoForge(page);

  await setPendingHostKeyVerification(page, {
    id: "verify-1",
    host: "first-use.test",
    port: 22,
    key_type: "ssh-ed25519",
    fingerprint: "SHA256:first-use-fingerprint",
    mode: "first-use",
  });

  await expect(page.getByTestId("host-key-verification-dialog")).toBeVisible();
  await expect(page.getByTestId("dialog-title")).toHaveText("🔐 New Host Key");
  await expect(page.getByTestId("first-use-prompt")).toBeVisible();
  await expect(page.getByTestId("fingerprint")).toHaveText("SHA256:first-use-fingerprint");
  await page.getByTestId("btn-allow").click();
  await expect(page.getByTestId("host-key-verification-dialog")).toHaveCount(0);

  await setPendingHostKeyVerification(page, {
    id: "verify-2",
    host: "mismatch.test",
    port: 2222,
    key_type: "ecdsa-sha2-nistp256",
    fingerprint: "SHA256:mismatch-fingerprint",
    mode: "mismatch",
  });

  await expect(page.getByTestId("host-key-verification-dialog")).toBeVisible();
  await expect(page.getByTestId("mismatch-warning")).toBeVisible();
  await expect(page.getByTestId("mismatch-prompt")).toBeVisible();
  await expect(page.getByTestId("btn-deny")).toHaveText("Decline (Unsafe)");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("host-key-verification-dialog")).toHaveCount(0);
});
