import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import DropZoneOverlay from "./DropZoneOverlay";

describe("DropZoneOverlay", () => {
  it("renders nothing when activeZone is null", () => {
    const { container } = render(() => <DropZoneOverlay activeZone={null} />);
    expect(container.querySelector(".forge-drop-zone-overlay")).toBeNull();
  });

  it("renders overlay with all 4 zones when activeZone is set", () => {
    const { getByTestId } = render(() => <DropZoneOverlay activeZone="top" />);
    expect(getByTestId("drop-zone-overlay")).toBeTruthy();
    expect(getByTestId("drop-zone-top")).toBeTruthy();
    expect(getByTestId("drop-zone-bottom")).toBeTruthy();
    expect(getByTestId("drop-zone-left")).toBeTruthy();
    expect(getByTestId("drop-zone-right")).toBeTruthy();
  });

  it("marks only the active zone with data-active=true", () => {
    const { getByTestId } = render(() => <DropZoneOverlay activeZone="left" />);
    expect(getByTestId("drop-zone-left").getAttribute("data-active")).toBe("true");
    expect(getByTestId("drop-zone-top").getAttribute("data-active")).toBe("false");
    expect(getByTestId("drop-zone-right").getAttribute("data-active")).toBe("false");
    expect(getByTestId("drop-zone-bottom").getAttribute("data-active")).toBe("false");
  });
});
