import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { search, openSearchPanel, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import type { EditorLanguage } from "../types/editor";

export interface InlineEditorProps {
  content: string;
  filePath: string;
  language?: EditorLanguage | string;
  isReadOnly: boolean;
  isConnectionLost?: boolean;
  isDirty?: boolean;
  onSave: (content: string) => void;
  onChange: (content: string) => void;
  onClose?: () => void;
}

const textEncoder = new TextEncoder();

const languageAliases: Record<string, EditorLanguage> = {
  css: "css",
  html: "html",
  htm: "html",
  javascript: "javascript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  plaintext: "plaintext",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  text: "plaintext",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  txt: "plaintext",
};

const languageLabels: Record<EditorLanguage, string> = {
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain Text",
  python: "Python",
  rust: "Rust",
  typescript: "TypeScript",
};

export function detectEditorLanguage(filePath: string): EditorLanguage {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".d.ts")) {
    return "typescript";
  }

  if (
    normalizedPath.endsWith(".jsx") ||
    normalizedPath.endsWith(".js") ||
    normalizedPath.endsWith(".mjs") ||
    normalizedPath.endsWith(".cjs")
  ) {
    return "javascript";
  }

  if (normalizedPath.endsWith(".py")) {
    return "python";
  }

  if (normalizedPath.endsWith(".rs")) {
    return "rust";
  }

  if (normalizedPath.endsWith(".html") || normalizedPath.endsWith(".htm")) {
    return "html";
  }

  if (normalizedPath.endsWith(".css")) {
    return "css";
  }

  if (normalizedPath.endsWith(".json")) {
    return "json";
  }

  if (normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown")) {
    return "markdown";
  }

  return "plaintext";
}

function resolveEditorLanguage(language: InlineEditorProps["language"], filePath: string): EditorLanguage {
  if (!language) {
    return detectEditorLanguage(filePath);
  }

  return languageAliases[language.toLowerCase()] ?? detectEditorLanguage(filePath);
}

type LanguageExtensionFactory = (filePath: string) => Extension;

const languageFactoryCache = new Map<EditorLanguage, LanguageExtensionFactory>();
const languageFactoryInflight = new Map<EditorLanguage, Promise<LanguageExtensionFactory>>();

async function loadLanguageExtensionFactory(language: EditorLanguage): Promise<LanguageExtensionFactory> {
  if (language === "plaintext") {
    return () => [];
  }

  const cachedFactory = languageFactoryCache.get(language);
  if (cachedFactory) {
    return cachedFactory;
  }

  const inflightFactory = languageFactoryInflight.get(language);
  if (inflightFactory) {
    return inflightFactory;
  }

  const factoryPromise = (async (): Promise<LanguageExtensionFactory> => {
    switch (language) {
      case "javascript":
      case "typescript": {
        const { javascript } = await import("@codemirror/lang-javascript");
        return (filePath) =>
          language === "typescript"
            ? javascript({ typescript: true, jsx: filePath.toLowerCase().endsWith(".tsx") })
            : javascript({ jsx: filePath.toLowerCase().endsWith(".jsx") });
      }
      case "python": {
        const { python } = await import("@codemirror/lang-python");
        return () => python();
      }
      case "rust": {
        const { rust } = await import("@codemirror/lang-rust");
        return () => rust();
      }
      case "html": {
        const { html } = await import("@codemirror/lang-html");
        return () => html();
      }
      case "css": {
        const { css } = await import("@codemirror/lang-css");
        return () => css();
      }
      case "json": {
        const { json } = await import("@codemirror/lang-json");
        return () => json();
      }
      case "markdown": {
        const { markdown } = await import("@codemirror/lang-markdown");
        return () => markdown();
      }
      default:
        return () => [];
    }
  })();

  languageFactoryInflight.set(language, factoryPromise);

  try {
    const factory = await factoryPromise;
    languageFactoryCache.set(language, factory);
    return factory;
  } finally {
    languageFactoryInflight.delete(language);
  }
}

async function getLanguageExtension(language: EditorLanguage, filePath: string): Promise<Extension> {
  const factory = await loadLanguageExtensionFactory(language);
  return factory(filePath);
}

function getInitialLanguageExtension(language: EditorLanguage, filePath: string): Extension {
  const cachedFactory = languageFactoryCache.get(language);
  return cachedFactory ? cachedFactory(filePath) : [];
}

function getStaticLanguageExtension(language: EditorLanguage): Extension {
  switch (language) {
    case "plaintext":
    default:
      return [];
  }
}

function splitPath(filePath: string): string[] {
  const segments = filePath.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments : ["Untitled"];
}

function formatFileSize(content: string): string {
  const size = textEncoder.encode(content).length;

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getCursorPosition(view: EditorView | null) {
  if (!view) {
    return { line: 1, column: 1 };
  }

  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);

  return {
    line: line.number,
    column: head - line.from + 1,
  };
}

const forgeEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--text-primary)",
      backgroundColor: "var(--editor-bg)",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.5",
    },
    ".cm-content": {
      padding: "8px 0",
      caretColor: "var(--text-primary)",
    },
    ".cm-line": {
      padding: "0 12px",
    },
    ".cm-gutters": {
      border: "none",
      backgroundColor: "var(--editor-gutter)",
      color: "var(--text-secondary)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--editor-line-highlight)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--editor-line-highlight)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(124, 91, 245, 0.35) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--text-primary)",
    },
  },
  { dark: true }
);

export default function InlineEditor(props: InlineEditorProps) {
  let editorHostRef: HTMLDivElement | undefined;
  let editorView: EditorView | null = null;
  let syncingFromProps = false;
  let languageRequestId = 0;

  const languageCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const [cursorPosition, setCursorPosition] = createSignal({ line: 1, column: 1 });

  const activeLanguage = createMemo(() => resolveEditorLanguage(props.language, props.filePath));
  const breadcrumbSegments = createMemo(() => splitPath(props.filePath));
  const fileSize = createMemo(() => formatFileSize(props.content));
  const statusLabel = createMemo(() => {
    if (props.isConnectionLost) {
      return "Connection lost (read-only)";
    }

    if (props.isReadOnly) {
      return "Read-only";
    }

    return props.isDirty ? "Unsaved changes" : "Saved";
  });

  const saveCurrentDocument = () => {
    if (!editorView || props.isReadOnly) {
      return;
    }

    props.onSave(editorView.state.doc.toString());
  };

  const destroyEditorView = () => {
    if (!editorView) {
      return;
    }

    editorView.destroy();
    editorView = null;
  };

  const reconfigureLanguageExtension = () => {
    if (!editorView) {
      return;
    }

    const requestId = ++languageRequestId;
    const language = activeLanguage();
    const filePath = props.filePath;

    void getLanguageExtension(language, filePath)
      .then((extension) => {
        if (!editorView || requestId !== languageRequestId) {
          return;
        }

        editorView.dispatch({
          effects: languageCompartment.reconfigure(extension),
        });
      })
      .catch(() => {
        if (!editorView || requestId !== languageRequestId) {
          return;
        }

        editorView.dispatch({
          effects: languageCompartment.reconfigure(getStaticLanguageExtension(language)),
        });
      });
  };

  onMount(() => {
    if (!editorHostRef) {
      return;
    }

    destroyEditorView();

    editorView = new EditorView({
      state: EditorState.create({
        doc: props.content,
        extensions: [
          basicSetup,
          search({ top: true }),
          oneDark,
          forgeEditorTheme,
          languageCompartment.of(getInitialLanguageExtension(activeLanguage(), props.filePath)),
          editableCompartment.of([
            EditorState.readOnly.of(props.isReadOnly),
            EditorView.editable.of(!props.isReadOnly),
          ]),
          keymap.of([
            {
              key: "Mod-f",
              preventDefault: true,
              run: (view) => openSearchPanel(view),
            },
            {
              key: "Mod-s",
              preventDefault: true,
              run: (view) => {
                if (props.isReadOnly) {
                  return true;
                }

                props.onSave(view.state.doc.toString());
                return true;
              },
            },
            ...searchKeymap,
          ]),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged && !syncingFromProps) {
              props.onChange(update.state.doc.toString());
            }

            if (update.docChanged || update.selectionSet) {
              setCursorPosition(getCursorPosition(update.view));
            }
          }),
        ],
      }),
      parent: editorHostRef,
    });

    setCursorPosition(getCursorPosition(editorView));
    reconfigureLanguageExtension();
  });

  createEffect(() => {
    if (!editorView) {
      return;
    }

    const nextContent = props.content;
    const currentContent = editorView.state.doc.toString();

    if (nextContent === currentContent) {
      return;
    }

    syncingFromProps = true;
    editorView.dispatch({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: nextContent,
      },
    });
    syncingFromProps = false;
    setCursorPosition(getCursorPosition(editorView));
  });

  createEffect(() => {
    if (!editorView) {
      return;
    }

    activeLanguage();
    props.filePath;
    reconfigureLanguageExtension();
  });

  createEffect(() => {
    if (!editorView) {
      return;
    }

    editorView.dispatch({
      effects: editableCompartment.reconfigure([
        EditorState.readOnly.of(props.isReadOnly),
        EditorView.editable.of(!props.isReadOnly),
      ]),
    });
  });

  onCleanup(() => {
    languageRequestId += 1;
    destroyEditorView();
  });

  return (
    <section class="forge-editor-panel" data-testid="inline-editor">
      <header class="forge-editor-header">
        <div class="forge-editor-breadcrumbs" title={props.filePath}>
          {breadcrumbSegments().map((segment, index) => (
            <>
              {index > 0 && <span class="forge-editor-breadcrumb-separator">&gt;</span>}
              <span class={index === breadcrumbSegments().length - 1 ? "forge-editor-breadcrumb-current" : undefined}>
                {segment}
              </span>
            </>
          ))}
        </div>
        <div class="forge-editor-header-meta">
          {props.isDirty && <span class="forge-editor-dirty-dot" aria-label="Unsaved changes" title="Unsaved changes" />}
          {props.isConnectionLost && <span class="forge-editor-connection-lost-badge">Connection lost</span>}
          {props.isReadOnly && <span class="forge-editor-read-only-badge">Read-only</span>}
        </div>
        <div class="forge-editor-actions">
          <button type="button" class="forge-editor-button" onClick={saveCurrentDocument} disabled={props.isReadOnly}>
            Save
          </button>
          <button type="button" class="forge-editor-button" onClick={() => props.onClose?.()}>
            Close
          </button>
        </div>
      </header>

      <div class="forge-editor-content">
        <div ref={editorHostRef} class="forge-inline-editor-surface" data-testid="inline-editor-surface" />
      </div>

      <footer class="forge-editor-status">
        <span>Ln {cursorPosition().line}, Col {cursorPosition().column}</span>
        <span data-testid="inline-editor-language">{languageLabels[activeLanguage()]}</span>
        <span>{fileSize()}</span>
        <span>{statusLabel()}</span>
      </footer>
    </section>
  );
}
