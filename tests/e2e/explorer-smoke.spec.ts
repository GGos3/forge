import { expect, test } from "@playwright/test";
import { gotoForge } from "./helpers/forge";
import { fixtureRoot, invokeMock } from "./helpers/explorer-helpers";

test("explorer mocks expose local, remote, git, and connection flows", async ({ page }) => {
  await gotoForge(page);
  await page.waitForFunction(() => Boolean((window as Window & { __forgeE2eTauriMock?: unknown }).__forgeE2eTauriMock));

  const localNodes = await invokeMock<Array<{ name: string; type: string }>>(page, "list_directory", {
    root: fixtureRoot,
    path: fixtureRoot,
    show_hidden: true,
  });

  expect(localNodes.map((node) => node.name)).toEqual(
    expect.arrayContaining([
      ".hidden-dir",
      "forbidden-dir",
      "src",
      ".gitignore",
      "binary.png",
      "docs-link",
      "large-file.log",
      "latin1.txt",
      "README.md",
      "readonly.txt",
    ])
  );
  expect(localNodes.filter((node) => node.type === "directory")).toHaveLength(3);

  const mainFile = await invokeMock<{
    content: string;
    is_binary: boolean;
    encoding: string;
  }>(page, "read_file", {
    path: `${fixtureRoot}/src/main.ts`,
  });

  expect(mainFile.is_binary).toBe(false);
  expect(mainFile.encoding).toBe("utf-8");
  expect(mainFile.content).toContain('return greet("forge")');

  const binaryFile = await invokeMock<{ is_binary: boolean; size: number }>(page, "read_file", {
    path: `${fixtureRoot}/binary.png`,
  });
  expect(binaryFile.is_binary).toBe(true);
  expect(binaryFile.size).toBe(8);

  const readonlyFile = await invokeMock<{ is_read_only: boolean }>(page, "read_file", {
    path: `${fixtureRoot}/readonly.txt`,
  });
  expect(readonlyFile.is_read_only).toBe(true);

  const oversizedFile = await invokeMock<{ size: number }>(page, "read_file", {
    path: `${fixtureRoot}/large-file.log`,
  });
  expect(oversizedFile.size).toBeGreaterThan(5 * 1024 * 1024);

  const unsupportedEncoding = await invokeMock<{ is_unsupported_encoding: boolean }>(page, "read_file", {
    path: `${fixtureRoot}/latin1.txt`,
  });
  expect(unsupportedEncoding.is_unsupported_encoding).toBe(true);

  await invokeMock(page, "write_file", {
    path: `${fixtureRoot}/README.md`,
    content: "Updated from smoke test\n",
  });
  const updatedReadme = await invokeMock<{ content: string }>(page, "read_file", {
    path: `${fixtureRoot}/README.md`,
  });
  expect(updatedReadme.content).toBe("Updated from smoke test\n");

  const profile = {
    id: "fixture-ssh-profile",
    name: "Fixture SSH",
    host: "example.test",
    port: 22,
    username: "forge",
    authMethod: "agent",
    group: "fixtures",
  };

  await invokeMock(page, "save_connection", { profile });
  const savedProfiles = await invokeMock<Array<{ id: string }>>(page, "list_connections");
  expect(savedProfiles).toEqual([expect.objectContaining({ id: profile.id })]);

  const connectionStatus = await invokeMock<{ connectionId: string }>(page, "connect_ssh", { profile });
  expect(connectionStatus.connectionId).toBe("connection-1");

  const remoteNodes = await invokeMock<Array<{ path: string }>>(page, "list_remote_directory", {
    connection_id: connectionStatus.connectionId,
    path: "/remote/project-root",
    show_hidden: true,
  });
  expect(remoteNodes.map((node) => node.path)).toContain("/remote/project-root/src");

  await invokeMock(page, "write_remote_file", {
    connection_id: connectionStatus.connectionId,
    path: "/remote/project-root/src/utils/helper.ts",
    content: "export const remoteHelper = () => 'ok';\n",
  });
  const remoteFile = await invokeMock<{ content: string }>(page, "read_remote_file", {
    connection_id: connectionStatus.connectionId,
    path: "/remote/project-root/src/utils/helper.ts",
  });
  expect(remoteFile.content).toContain("remoteHelper");

  const gitStatus = await invokeMock<Record<string, string>>(page, "get_git_status", {
    repo_root: fixtureRoot,
  });
  expect(gitStatus).toMatchObject({
    "README.md": "Modified",
    "src/main.ts": "Staged",
    "readonly.txt": "Untracked",
  });

  await invokeMock(page, "disconnect_ssh", { connection_id: connectionStatus.connectionId });
  await invokeMock(page, "delete_connection", { id: profile.id });
  await expect(invokeMock<Array<unknown>>(page, "list_connections")).resolves.toHaveLength(0);
});
