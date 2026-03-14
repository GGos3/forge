import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach } from "vitest";
import SettingsPanel from "../SettingsPanel";

describe("SettingsPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("renders settings panel with terminal section", () => {
    render(() => <SettingsPanel />);
    expect(screen.getByTestId("settings-panel")).toBeTruthy();
  });

  it("renders font family input with default value", () => {
    render(() => <SettingsPanel />);
    const input = screen.getByTestId("setting-font-family") as HTMLInputElement;
    expect(input.value).toBe("JetBrains Mono");
  });

  it("saves settings to localStorage on change", () => {
    render(() => <SettingsPanel />);

    const fontSizeInput = screen.getByTestId("setting-font-size") as HTMLInputElement;
    fireEvent.input(fontSizeInput, { target: { value: "16" } });

    const stored = localStorage.getItem("forge-settings");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as { fontSize: number };
    expect(parsed.fontSize).toBe(16);
  });

  it("renders and saves app color theme", () => {
    render(() => <SettingsPanel />);

    const select = screen.getByTestId("setting-color-theme") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "green" } });

    const stored = localStorage.getItem("forge-settings");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as { colorTheme: string };
    expect(parsed.colorTheme).toBe("green");
  });

  it("shows saved indicator after changing a setting", async () => {
    render(() => <SettingsPanel />);

    const cursorSelect = screen.getByTestId("setting-cursor-style") as HTMLSelectElement;
    fireEvent.change(cursorSelect, { target: { value: "bar" } });

    expect(screen.getByTestId("settings-saved")).toBeTruthy();
  });

  it("renders about section", () => {
    render(() => <SettingsPanel />);
    const about = document.querySelector(".forge-settings-about__name");
    expect(about?.textContent).toContain("Forge Terminal");
  });
});
