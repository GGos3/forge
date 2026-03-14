import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach } from "vitest";
import PortForwardPanel from "../PortForwardPanel";
import { portForwardStore } from "../../stores/portForward";

describe("PortForwardPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    portForwardStore._resetForTesting();
  });

  it("renders empty state when no rules", () => {
    render(() => <PortForwardPanel />);
    const emptyState = document.querySelector(".forge-connection-empty");
    expect(emptyState?.textContent).toContain("No port forwarding rules");
  });

  it("renders backend notice", () => {
    render(() => <PortForwardPanel />);
    expect(screen.getByTestId("portfwd-notice")).toBeTruthy();
  });

  it("opens editor when + button clicked", () => {
    render(() => <PortForwardPanel />);
    fireEvent.click(screen.getByTestId("btn-new-portfwd"));
    expect(screen.getByTestId("portfwd-editor")).toBeTruthy();
  });

  it("saves a new port forward rule", () => {
    render(() => <PortForwardPanel />);
    fireEvent.click(screen.getByTestId("btn-new-portfwd"));

    const localPortInput = screen.getByTestId("input-local-port") as HTMLInputElement;
    const remotePortInput = screen.getByTestId("input-remote-port") as HTMLInputElement;

    fireEvent.input(localPortInput, { target: { value: "8080" } });
    fireEvent.input(remotePortInput, { target: { value: "3000" } });
    fireEvent.click(screen.getByTestId("btn-save-portfwd"));

    expect(portForwardStore.rules).toHaveLength(1);
    expect(portForwardStore.rules[0].localPort).toBe(8080);
    expect(portForwardStore.rules[0].remotePort).toBe(3000);
  });

  it("deletes a rule", () => {
    portForwardStore.add({
      id: "r1",
      profileId: "p1",
      direction: "local",
      localPort: 8080,
      remoteHost: "localhost",
      remotePort: 3000,
      enabled: true,
    });

    render(() => <PortForwardPanel />);
    expect(screen.getByTestId("portfwd-r1")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-delete-portfwd-r1"));
    expect(portForwardStore.rules).toHaveLength(0);
  });

  it("toggles rule enabled state", () => {
    portForwardStore.add({
      id: "r1",
      profileId: "p1",
      direction: "local",
      localPort: 8080,
      remoteHost: "localhost",
      remotePort: 3000,
      enabled: true,
    });

    render(() => <PortForwardPanel />);
    fireEvent.click(screen.getByTestId("btn-toggle-r1"));
    expect(portForwardStore.rules[0].enabled).toBe(false);
  });

  it("cancels editor without saving", () => {
    render(() => <PortForwardPanel />);
    fireEvent.click(screen.getByTestId("btn-new-portfwd"));
    expect(screen.getByTestId("portfwd-editor")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-cancel-portfwd"));
    expect(screen.queryByTestId("portfwd-editor")).toBeNull();
    expect(portForwardStore.rules).toHaveLength(0);
  });
});
