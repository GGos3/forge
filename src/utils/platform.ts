export type ForgePlatform = "macos" | "windows" | "linux" | "unknown";

type NavigatorLike = {
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    platform?: string;
  };
};

type ShortcutEventLike = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

type PaneFocusDirection = "up" | "down" | "left" | "right";

function browserNavigator(): NavigatorLike | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator as NavigatorLike;
}

function normalizePlatform(value: string | undefined): ForgePlatform {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("mac")) {
    return "macos";
  }

  if (normalized.includes("win")) {
    return "windows";
  }

  if (normalized.includes("linux") || normalized.includes("x11")) {
    return "linux";
  }

  return "unknown";
}

function matchesLetterKey(event: ShortcutEventLike, key: string): boolean {
  return event.key.toLowerCase() === key;
}

function hasPrimaryModifier(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  if (platform === "macos") {
    return event.metaKey && !event.ctrlKey && !event.altKey;
  }

  return event.ctrlKey && !event.metaKey && !event.altKey;
}

export function getCurrentPlatform(navigatorLike: NavigatorLike | undefined = browserNavigator()): ForgePlatform {
  const platformSources = [
    navigatorLike?.userAgentData?.platform,
    navigatorLike?.platform,
    navigatorLike?.userAgent,
  ];

  for (const source of platformSources) {
    const detected = normalizePlatform(source);
    if (detected !== "unknown") {
      return detected;
    }
  }

  return "unknown";
}

export function isMacPlatform(platform: ForgePlatform): boolean {
  return platform === "macos";
}

export function matchesVerticalSplitShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  if (isMacPlatform(platform)) {
    return hasPrimaryModifier(event, platform) && !event.shiftKey && matchesLetterKey(event, "d");
  }

  return event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && matchesLetterKey(event, "d");
}

export function matchesHorizontalSplitShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  if (isMacPlatform(platform)) {
    return hasPrimaryModifier(event, platform) && event.shiftKey && matchesLetterKey(event, "d");
  }

  return event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && matchesLetterKey(event, "e");
}

export function matchesClosePaneShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  if (isMacPlatform(platform)) {
    return hasPrimaryModifier(event, platform) && !event.shiftKey && matchesLetterKey(event, "w");
  }

  return event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && matchesLetterKey(event, "w");
}

export function matchesNewTabShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  return hasPrimaryModifier(event, platform) && !event.shiftKey && matchesLetterKey(event, "t");
}

export function matchesCloseTabShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  return hasPrimaryModifier(event, platform) && !event.shiftKey && matchesLetterKey(event, "w");
}

export function matchesNextTabShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  if (isMacPlatform(platform)) {
    return hasPrimaryModifier(event, platform) && event.shiftKey && matchesLetterKey(event, "]");
  }
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === "Tab";
}

export function matchesPrevTabShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  if (isMacPlatform(platform)) {
    return hasPrimaryModifier(event, platform) && event.shiftKey && matchesLetterKey(event, "[");
  }
  return event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && event.key === "Tab";
}

export function getTabIndexFromShortcut(event: ShortcutEventLike, platform: ForgePlatform): number | null {
  const usesTabIndexShortcut = isMacPlatform(platform)
    ? hasPrimaryModifier(event, platform) && !event.shiftKey
    : event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey;

  if (!usesTabIndexShortcut || !/^[1-9]$/.test(event.key)) {
    return null;
  }

  return Number(event.key) - 1;
}

export function matchesToggleSidebarShortcut(event: ShortcutEventLike, platform: ForgePlatform): boolean {
  return hasPrimaryModifier(event, platform) && !event.shiftKey && matchesLetterKey(event, "b");
}

export function getPaneFocusDirection(event: ShortcutEventLike): PaneFocusDirection | null {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
    return null;
  }

  switch (event.key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

export function getNewTabShortcutLabel(platform: ForgePlatform): string {
  return `${isMacPlatform(platform) ? "Cmd" : "Ctrl"}+T`;
}

export function getCloseTabShortcutLabel(platform: ForgePlatform): string {
  return `${isMacPlatform(platform) ? "Cmd" : "Ctrl"}+W`;
}

/**
 * Check if global keyboard shortcuts should be handled.
 * Returns false when terminal, editor, or other input elements have focus.
 */
export function shouldHandleGlobalShortcuts(): boolean {
  const activeElement = document.activeElement;
  
  if (!activeElement) {
    return true;
  }

  const tagName = activeElement.tagName.toLowerCase();
  
  // Don't handle shortcuts when input elements have focus
  if (tagName === "input" || tagName === "textarea") {
    return false;
  }

  // Don't handle shortcuts when contenteditable elements have focus
  if (activeElement.getAttribute("contenteditable") === "true") {
    return false;
  }

  // Don't handle shortcuts when CodeMirror editor has focus
  if (activeElement.classList.contains("cm-content") || 
      activeElement.closest(".cm-editor")) {
    return false;
  }

  return true;
}
