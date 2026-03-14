import { expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { dispatchShortcut } from "./forge";

export const fixtureRoot = "/home/ggos3/workspace/github.com/ggos3/forge/tests/fixtures/explorer/project-root";
export const remoteFixtureRoot = "/remote/project-root";

type MockInvoker = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

export interface ConnectionProfileInput {
  name: string;
  host: string;
  port?: number;
  username: string;
  authMethod?: "password" | "key" | "agent";
  keyPath?: string;
}

export interface ConnectionProfileRecord extends ConnectionProfileInput {
  id: string;
  port: number;
  authMethod: "password" | "key" | "agent";
}

const evidenceRoot = join(process.cwd(), ".sisyphus", "evidence", "final-qa");

function attributeSelector(attribute: string, value: string): string {
  return `[${attribute}=${JSON.stringify(value)}]`;
}

function explorerNodeSelector(path: string): string {
  return [
    attributeSelector("data-path", path),
    attributeSelector("data-node-path", path),
    attributeSelector("data-explorer-path", path),
  ].join(", ");
}

export async function toggleExplorer(page: Page): Promise<void> {
  await dispatchShortcut(page, { key: "b", ctrlKey: true });
}

export async function invokeMock<T>(page: Page, command: string, args?: Record<string, unknown>): Promise<T> {
  return page.evaluate(
    async ({ commandName, payload }) => {
      const bridge = (window as Window & { __forgeE2eTauriMock?: MockInvoker }).__forgeE2eTauriMock;
      if (!bridge) {
        throw new Error("Mock bridge was not registered");
      }

      return bridge.invoke<T>(commandName, payload);
    },
    { commandName: command, payload: args }
  );
}

export async function emitMockEvent(page: Page, event: string, payload?: Record<string, unknown>): Promise<void> {
  await invokeMock(page, "__mock_emit_event", { event, payload });
}

export async function setPendingHostKeyVerification(
  page: Page,
  payload: Record<string, unknown> | null
): Promise<void> {
  await invokeMock(page, "__mock_set_host_key_verification", { payload });
}

export async function captureEvidence(page: Page, fileName: string): Promise<string> {
  mkdirSync(evidenceRoot, { recursive: true });
  const sanitizedName = fileName.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
  const outputPath = join(evidenceRoot, `${sanitizedName}.png`);
  await page.screenshot({ path: outputPath, fullPage: true });
  return outputPath;
}

export function getExplorerNode(page: Page, path: string): Locator {
  return page.locator(explorerNodeSelector(path)).first();
}

export async function openLocalFixtureRoot(page: Page): Promise<void> {
  if (!(await page.getByTestId("sidebar-panel").isVisible().catch(() => false))) {
    await toggleExplorer(page);
  }

  await expect(page.getByTestId("sidebar-panel")).toBeVisible();
  const emptyStateButton = page.getByTestId("explorer-empty-open-folder-btn");

  if (await emptyStateButton.isVisible().catch(() => false)) {
    await emptyStateButton.click();
  } else {
    await page.getByTestId("explorer-open-folder-btn").click();
  }

  await expect(getExplorerNode(page, `${fixtureRoot}/src`)).toBeVisible();
}

export async function saveConnectionProfile(
  page: Page,
  profile: ConnectionProfileInput
): Promise<ConnectionProfileRecord> {
  await expect(page.getByTestId("sidebar-panel")).toBeVisible();

  await page.getByTestId("nav-connections").click();
  await page.getByTestId("btn-new-connection").click();
  await expect(page.getByTestId("connection-manager-dialog")).toBeVisible();

  await page.getByTestId("input-name").fill(profile.name);
  await page.getByTestId("input-host").fill(profile.host);
  await page.getByTestId("input-port").fill(String(profile.port ?? 22));
  await page.getByTestId("input-username").fill(profile.username);
  await page.getByTestId("select-auth").selectOption(profile.authMethod ?? "agent");

  if ((profile.authMethod ?? "agent") === "key") {
    await page.getByTestId("input-key").fill(profile.keyPath ?? "");
  }

  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("connection-manager-dialog")).toHaveCount(0);

  const profiles = await invokeMock<ConnectionProfileRecord[]>(page, "list_connections");
  const savedProfile = profiles.find(
    (candidate) =>
      candidate.name === profile.name &&
      candidate.host === profile.host &&
      candidate.username === profile.username
  );

  expect(savedProfile).toBeDefined();
  await expect(page.getByTestId(`connection-item-${savedProfile!.id}`)).toBeVisible();
  return savedProfile!;
}

export async function expandNode(page: Page, path: string): Promise<void> {
  const node = getExplorerNode(page, path);
  await expect(node).toBeVisible();

  const toggle = node
    .locator(
      '[data-testid="explorer-node-toggle"], [data-action="toggle-node"], button[aria-label*="Expand"], button[aria-label*="Collapse"]'
    )
    .first();

  if (await toggle.count()) {
    await expect(toggle).toBeVisible();
    await toggle.click();
    return;
  }

  await node.click();
}

export async function selectFile(page: Page, path: string): Promise<void> {
  const node = getExplorerNode(page, path);
  await expect(node).toBeVisible();
  await node.click();
}

export async function waitForEditor(page: Page): Promise<Locator> {
  const editor = page.locator('[data-testid="explorer-editor"], .cm-editor').first();
  await expect(editor).toBeVisible();
  return editor;
}
