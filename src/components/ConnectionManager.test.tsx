import { render, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import ConnectionManager from "./ConnectionManager";
import { connectionStore } from "../stores/connection";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("ConnectionManager", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    connectionStore.profiles.forEach(p => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      void connectionStore.deleteProfile(p.id);
    });
  });

  it("renders new connection dialog", () => {
    const { getByText, getByTestId } = render(() => (
      <ConnectionManager profileId={null} onClose={() => {}} />
    ));

    expect(getByText("New Connection")).toBeTruthy();
    expect(getByTestId("input-name")).toBeTruthy();
    expect(getByTestId("input-host")).toBeTruthy();
  });

  it("validates empty fields without calling backend", async () => {
    const { getByTestId, getByText } = render(() => (
      <ConnectionManager profileId={null} onClose={() => {}} />
    ));

    fireEvent.click(getByTestId("btn-save"));

    await waitFor(() => {
      expect(getByText("Name is required")).toBeTruthy();
    });
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });

  it("saves a valid profile via save_connection command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();

    const { getByTestId } = render(() => (
      <ConnectionManager profileId={null} onClose={onClose} />
    ));

    fireEvent.input(getByTestId("input-name"), { target: { value: "Test Server" } });
    fireEvent.input(getByTestId("input-host"), { target: { value: "10.0.0.1" } });
    fireEvent.input(getByTestId("input-username"), { target: { value: "root" } });

    fireEvent.click(getByTestId("btn-save"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "save_connection",
      expect.objectContaining({ profile: expect.objectContaining({ name: "Test Server" }) })
    );
    expect(connectionStore.profiles.length).toBe(1);
    expect(connectionStore.profiles[0].name).toBe("Test Server");
  });

  it("shows error when backend save fails", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("disk full"));
    const onClose = vi.fn();

    const { getByTestId, getByText } = render(() => (
      <ConnectionManager profileId={null} onClose={onClose} />
    ));

    fireEvent.input(getByTestId("input-name"), { target: { value: "Fail Server" } });
    fireEvent.input(getByTestId("input-host"), { target: { value: "10.0.0.2" } });
    fireEvent.input(getByTestId("input-username"), { target: { value: "root" } });

    fireEvent.click(getByTestId("btn-save"));

    await waitFor(() => {
      expect(getByText("disk full")).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders group and password fields", () => {
    const { getByTestId } = render(() => (
      <ConnectionManager profileId={null} onClose={() => {}} />
    ));

    expect(getByTestId("input-group")).toBeTruthy();
    expect(getByTestId("input-password")).toBeTruthy();
  });

  it("saves profile with group field", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();

    const { getByTestId } = render(() => (
      <ConnectionManager profileId={null} onClose={onClose} />
    ));

    fireEvent.input(getByTestId("input-name"), { target: { value: "Grouped Server" } });
    fireEvent.input(getByTestId("input-host"), { target: { value: "10.0.0.3" } });
    fireEvent.input(getByTestId("input-username"), { target: { value: "admin" } });
    fireEvent.input(getByTestId("input-group"), { target: { value: "Production" } });

    fireEvent.click(getByTestId("btn-save"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "save_connection",
      expect.objectContaining({ profile: expect.objectContaining({ group: "Production" }) })
    );
  });

  it("test connection button calls test_connection and shows success", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);

    const { getByTestId, getByText } = render(() => (
      <ConnectionManager profileId={null} onClose={() => {}} />
    ));

    fireEvent.input(getByTestId("input-name"), { target: { value: "Test Server" } });
    fireEvent.input(getByTestId("input-host"), { target: { value: "10.0.0.4" } });
    fireEvent.input(getByTestId("input-username"), { target: { value: "root" } });

    fireEvent.click(getByTestId("btn-test"));

    await waitFor(() => {
      expect(getByText("Connection successful")).toBeTruthy();
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "test_connection",
      expect.objectContaining({ profile: expect.objectContaining({ host: "10.0.0.4" }) })
    );
  });

  it("test connection button shows error on failure", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("timeout"));

    const { getByTestId, getByText } = render(() => (
      <ConnectionManager profileId={null} onClose={() => {}} />
    ));

    fireEvent.input(getByTestId("input-name"), { target: { value: "Bad Server" } });
    fireEvent.input(getByTestId("input-host"), { target: { value: "10.0.0.5" } });
    fireEvent.input(getByTestId("input-username"), { target: { value: "root" } });

    fireEvent.click(getByTestId("btn-test"));

    await waitFor(() => {
      expect(getByText("timeout")).toBeTruthy();
    });
  });
});
