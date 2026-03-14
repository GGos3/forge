import { describe, expect, it } from "vitest";
import type { 
  FileNode, 
  FileTreeRoot, 
  ExplorerContext,
  FileTreeProvider 
} from "../file-node";
import type { 
  SshProfile, 
  ConnectionStatus, 
  SshConnection 
} from "../connection";
import type { 
  EditorBuffer, 
  EditorState,
  EditorLanguage 
} from "../editor";

describe("file-node types", () => {
  it("exports FileNode with correct shape", () => {
    const fileNode: FileNode = {
      name: "test.ts",
      path: "/home/user/project/src/test.ts",
      type: "file",
      size: 1024,
      modified: Date.now(),
      permissions: 0o644,
    };
    
    expect(fileNode.name).toBe("test.ts");
    expect(fileNode.type).toBe("file");
    expect(fileNode.children).toBeUndefined();
  });

  it("supports FileNode with children for directories", () => {
    const dirNode: FileNode = {
      name: "src",
      path: "/home/user/project/src",
      type: "directory",
      size: 0,
      modified: Date.now(),
      permissions: 0o755,
      children: [],
      isExpanded: false,
    };
    
    expect(dirNode.children).toBeDefined();
    expect(dirNode.type).toBe("directory");
  });

  it("exports FileTreeRoot with local provider", () => {
    const root: FileTreeRoot = {
      rootPath: "/home/user/project",
      provider: "local",
      nodes: [],
    };
    
    expect(root.provider).toBe("local");
    expect(root.connectionId).toBeUndefined();
  });

  it("exports FileTreeRoot with remote provider", () => {
    const root: FileTreeRoot = {
      rootPath: "/home/remote/project",
      provider: "remote",
      connectionId: "conn-123",
      nodes: [],
    };
    
    expect(root.provider).toBe("remote");
    expect(root.connectionId).toBe("conn-123");
  });

  it("exports ExplorerContext with expandedPaths Set", () => {
    const context: ExplorerContext = {
      root: null,
      selectedPath: null,
      expandedPaths: new Set(["/path/to/dir"]),
    };
    
    expect(context.expandedPaths.has("/path/to/dir")).toBe(true);
  });

  it("supports discriminated union for FileNode type", () => {
    const fileNode: FileNode = {
      name: "test.ts",
      path: "/test.ts",
      type: "file",
      size: 100,
      modified: 0,
      permissions: 0o644,
    };
    
    if (fileNode.type === "file") {
      expect(fileNode.size).toBeDefined();
    }
    
    if (fileNode.type === "directory") {
      expect(fileNode.children).toBeDefined();
    }
  });
});

describe("connection types", () => {
  it("exports SshProfile with password auth", () => {
    const profile: SshProfile = {
      id: "profile-1",
      name: "My Server",
      host: "192.168.1.100",
      port: 22,
      username: "admin",
      authMethod: "password",
    };
    
    expect(profile.authMethod).toBe("password");
    expect(profile.keyPath).toBeUndefined();
  });

  it("exports SshProfile with key auth", () => {
    const profile: SshProfile = {
      id: "profile-2",
      name: "Key Server",
      host: "server.example.com",
      port: 22,
      username: "deploy",
      authMethod: "key",
      keyPath: "/home/user/.ssh/id_rsa",
      group: "production",
      color: "#7c5bf5",
    };
    
    expect(profile.authMethod).toBe("key");
    expect(profile.keyPath).toBe("/home/user/.ssh/id_rsa");
    expect(profile.group).toBe("production");
  });

  it("exports SshProfile with agent auth", () => {
    const profile: SshProfile = {
      id: "profile-3",
      name: "Agent Server",
      host: "localhost",
      port: 2222,
      username: "user",
      authMethod: "agent",
    };
    
    expect(profile.authMethod).toBe("agent");
  });

  it("exports ConnectionStatus as discriminated union", () => {
    const statuses: ConnectionStatus[] = [
      "disconnected",
      "connecting",
      "connected",
      "error",
    ];
    
    expect(statuses).toContain("connected");
    expect(statuses).toContain("error");
  });

  it("exports SshConnection with connected status", () => {
    const profile: SshProfile = {
      id: "p1",
      name: "Test",
      host: "test.com",
      port: 22,
      username: "user",
      authMethod: "password",
    };
    
    const connection: SshConnection = {
      profile,
      status: "connected",
    };
    
    expect(connection.status).toBe("connected");
    expect(connection.error).toBeUndefined();
  });

  it("exports SshConnection with error status", () => {
    const profile: SshProfile = {
      id: "p1",
      name: "Test",
      host: "test.com",
      port: 22,
      username: "user",
      authMethod: "password",
    };
    
    const connection: SshConnection = {
      profile,
      status: "error",
      error: "Connection refused",
    };
    
    expect(connection.status).toBe("error");
    expect(connection.error).toBe("Connection refused");
  });
});

describe("editor types", () => {
  it("exports EditorBuffer with local provider", () => {
    const buffer: EditorBuffer = {
      filePath: "/home/user/project/src/main.ts",
      content: "console.log('hello');",
      originalContent: "console.log('hello');",
      isDirty: false,
      language: "typescript",
      isReadOnly: false,
      provider: "local",
    };
    
    expect(buffer.isDirty).toBe(false);
    expect(buffer.provider).toBe("local");
  });

  it("exports EditorBuffer with remote provider", () => {
    const buffer: EditorBuffer = {
      filePath: "/remote/src/main.py",
      content: "print('hello')",
      originalContent: "print('hello')",
      isDirty: false,
      language: "python",
      isReadOnly: false,
      provider: "remote",
    };
    
    expect(buffer.provider).toBe("remote");
  });

  it("tracks dirty state correctly", () => {
    const buffer: EditorBuffer = {
      filePath: "/test.ts",
      content: "modified content",
      originalContent: "original content",
      isDirty: true,
      language: "typescript",
      isReadOnly: false,
      provider: "local",
    };
    
    expect(buffer.isDirty).toBe(true);
    expect(buffer.content).not.toBe(buffer.originalContent);
  });

  it("supports read-only buffers", () => {
    const buffer: EditorBuffer = {
      filePath: "/etc/passwd",
      content: "root:x:0:0:root:/root:/bin/bash",
      originalContent: "root:x:0:0:root:/root:/bin/bash",
      isDirty: false,
      language: "plaintext",
      isReadOnly: true,
      provider: "local",
    };
    
    expect(buffer.isReadOnly).toBe(true);
  });

  it("exports EditorState with null activeBuffer", () => {
    const state: EditorState = {
      activeBuffer: null,
      recentFiles: [],
    };
    
    expect(state.activeBuffer).toBeNull();
    expect(state.recentFiles).toHaveLength(0);
  });

  it("exports EditorState with active buffer and recent files", () => {
    const buffer: EditorBuffer = {
      filePath: "/test.ts",
      content: "",
      originalContent: "",
      isDirty: false,
      language: "typescript",
      isReadOnly: false,
      provider: "local",
    };
    
    const state: EditorState = {
      activeBuffer: buffer,
      recentFiles: ["/test.ts", "/main.ts", "/utils.ts"],
    };
    
    expect(state.activeBuffer).toBeDefined();
    expect(state.recentFiles).toHaveLength(3);
  });

  it("supports all EditorLanguage variants", () => {
    const languages: EditorLanguage[] = [
      "javascript",
      "typescript",
      "python",
      "rust",
      "html",
      "css",
      "json",
      "markdown",
      "plaintext",
    ];
    
    expect(languages).toContain("typescript");
    expect(languages).toContain("rust");
  });
});

describe("type exports are importable without circular dependencies", () => {
  it("can use FileNode with EditorBuffer path references", () => {
    const fileNode: FileNode = {
      name: "main.ts",
      path: "/project/src/main.ts",
      type: "file",
      size: 500,
      modified: Date.now(),
      permissions: 0o644,
    };
    
    const buffer: EditorBuffer = {
      filePath: fileNode.path,
      content: "const x = 1;",
      originalContent: "const x = 1;",
      isDirty: false,
      language: "typescript",
      isReadOnly: false,
      provider: "local",
    };
    
    expect(buffer.filePath).toBe(fileNode.path);
    expect(fileNode.type).toBe("file");
  });

  it("editor.ts can import FileTreeProvider from file-node.ts", () => {
    const buffer: EditorBuffer = {
      filePath: "/test.ts",
      content: "",
      originalContent: "",
      isDirty: false,
      language: "typescript",
      isReadOnly: false,
      provider: "local" as FileTreeProvider,
    };
    
    expect(buffer.provider).toBe("local");
  });
});
