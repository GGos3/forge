import { Component, For } from "solid-js";
import { VsFiles, VsRemote, VsCode, VsCloudUpload, VsPlug, VsSettingsGear } from "solid-icons/vs";
import { sidebarStore, type SidebarSection } from "../stores/sidebar";

interface NavItem {
  id: SidebarSection;
  icon: Component<{ size: number }>;
  label: string;
}

const navItems: NavItem[] = [
  { id: "explorer", icon: VsFiles, label: "Explorer" },
  { id: "connections", icon: VsRemote, label: "Connections" },
  { id: "snippets", icon: VsCode, label: "Snippets" },
  { id: "transfers", icon: VsCloudUpload, label: "Transfers" },
  { id: "portforward", icon: VsPlug, label: "Port Forwarding" },
  { id: "settings", icon: VsSettingsGear, label: "Settings" },
];

const NavRail: Component = () => {
  return (
    <nav class="forge-nav-rail" data-testid="nav-rail">
      <div class="forge-nav-rail__items">
        <For each={navItems}>
          {(item) => (
            <button
              class="forge-nav-rail__button"
              classList={{ "forge-nav-rail__button--active": sidebarStore.activeSection === item.id && sidebarStore.isPanelOpen }}
              data-testid={`nav-${item.id}`}
              title={item.label}
              onClick={() => sidebarStore.setSection(item.id)}
            >
              <item.icon size={22} />
            </button>
          )}
        </For>
      </div>
    </nav>
  );
};

export default NavRail;
