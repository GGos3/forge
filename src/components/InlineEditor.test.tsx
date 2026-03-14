import { render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import InlineEditor, { detectEditorLanguage } from "./InlineEditor";

if (typeof globalThis.ResizeObserver === "undefined") {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

if (typeof globalThis.requestAnimationFrame === "undefined") {
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0),
  });
}

if (typeof globalThis.cancelAnimationFrame === "undefined") {
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });
}

describe("InlineEditor", () => {
  it("detects editor language from supported file extensions", () => {
    expect(detectEditorLanguage("src/app.ts")).toBe("typescript");
    expect(detectEditorLanguage("src/component.jsx")).toBe("javascript");
    expect(detectEditorLanguage("scripts/build.py")).toBe("python");
    expect(detectEditorLanguage("src/main.rs")).toBe("rust");
    expect(detectEditorLanguage("README.md")).toBe("markdown");
    expect(detectEditorLanguage("notes.txt")).toBe("plaintext");
  });

  it("mounts CodeMirror and disposes its DOM on unmount", async () => {
    const { container, unmount } = render(() => (
      <InlineEditor
        content="const value = 1;"
        filePath="src/example.ts"
        isReadOnly={false}
        isDirty={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />
    ));

    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeTruthy());
    expect(screen.getByTestId("inline-editor-language").textContent).toBe("TypeScript");

    unmount();

    expect(document.body.querySelector(".cm-editor")).toBeNull();
  });

  it("shows connection-lost indication while remaining read-only", async () => {
    render(() => (
      <InlineEditor
        content="const value = 1;"
        filePath="src/example.ts"
        isReadOnly={true}
        isConnectionLost={true}
        isDirty={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />
    ));

    await waitFor(() => expect(screen.getByText("Connection lost")).toBeTruthy());
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.getByText("Connection lost (read-only)")).toBeTruthy();
  });

  it("does not leak CodeMirror DOM nodes across repeated mount/unmount", async () => {
    const cycles = 20;

    for (let i = 0; i < cycles; i += 1) {
      const { container, unmount } = render(() => (
        <InlineEditor
          content={`const value = ${i};`}
          filePath="src/example.ts"
          isReadOnly={false}
          isDirty={false}
          onChange={vi.fn()}
          onSave={vi.fn()}
        />
      ));

      await waitFor(() => expect(container.querySelector(".cm-editor")).toBeTruthy());
      unmount();
      expect(document.body.querySelector(".cm-editor")).toBeNull();
    }
  });

  it("mount/unmount cycles complete within performance budget", async () => {
    const cycles = 10;
    const start = performance.now();

    for (let i = 0; i < cycles; i += 1) {
      const { container, unmount } = render(() => (
        <InlineEditor
          content={`let n = ${i};`}
          filePath="src/example.ts"
          isReadOnly={false}
          isDirty={false}
          onChange={vi.fn()}
          onSave={vi.fn()}
        />
      ));

      await waitFor(() => expect(container.querySelector(".cm-editor")).toBeTruthy());
      unmount();
    }

    const durationMs = performance.now() - start;
    expect(durationMs).toBeLessThan(1000);
  });
});
