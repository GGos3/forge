import { createStore } from "solid-js/store";

export type SidebarSection = "explorer" | "connections";

interface SidebarState {
  activeSection: SidebarSection;
  isPanelOpen: boolean;
  panelWidth: number;
}

const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 500;
const DEFAULT_PANEL_WIDTH = 260;

function clampWidth(width: number): number {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
}

const [state, setState] = createStore<SidebarState>({
  activeSection: "explorer",
  isPanelOpen: false,
  panelWidth: DEFAULT_PANEL_WIDTH,
});

export const sidebarStore = {
  get activeSection() {
    return state.activeSection;
  },
  get isPanelOpen() {
    return state.isPanelOpen;
  },
  get panelWidth() {
    return state.panelWidth;
  },

  setSection(section: SidebarSection) {
    if (state.activeSection === section && state.isPanelOpen) {
      setState("isPanelOpen", false);
    } else {
      setState({ activeSection: section, isPanelOpen: true });
    }
  },

  togglePanel() {
    setState("isPanelOpen", (open) => !open);
  },

  openPanel() {
    setState("isPanelOpen", true);
  },

  closePanel() {
    setState("isPanelOpen", false);
  },

  setPanelWidth(width: number) {
    setState("panelWidth", clampWidth(width));
  },

  _resetForTesting() {
    setState({
      activeSection: "explorer",
      isPanelOpen: false,
      panelWidth: DEFAULT_PANEL_WIDTH,
    });
  },
};
