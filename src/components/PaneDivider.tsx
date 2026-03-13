import { createSignal, onCleanup } from "solid-js";
import type { SplitDirection } from "../types/pane";

interface PaneDividerProps {
  direction: SplitDirection;
  ratio: number;
  onRatioChange: (ratio: number) => void;
}

export default function PaneDivider(props: PaneDividerProps) {
  let dividerRef: HTMLDivElement | undefined;
  const [isDragging, setIsDragging] = createSignal(false);

  // Store listener references for cleanup
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;

  const cleanupListeners = () => {
    if (handleMouseMove) {
      window.removeEventListener("mousemove", handleMouseMove);
      handleMouseMove = undefined;
    }
    if (handleMouseUp) {
      window.removeEventListener("mouseup", handleMouseUp);
      handleMouseUp = undefined;
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    if (!dividerRef || !dividerRef.parentElement) return;

    const parent = dividerRef.parentElement;
    
    // Set global cursor during drag
    document.body.style.cursor = props.direction === "vertical" ? "col-resize" : "row-resize";

    handleMouseMove = (moveEvent: MouseEvent) => {
      const parentRect = parent.getBoundingClientRect();
      let newRatio;
      
      if (props.direction === "vertical") {
        newRatio = (moveEvent.clientX - parentRect.left) / parentRect.width;
      } else {
        newRatio = (moveEvent.clientY - parentRect.top) / parentRect.height;
      }
      
      props.onRatioChange(newRatio);
    };

    handleMouseUp = () => {
      setIsDragging(false);
      cleanupListeners();
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  onCleanup(() => {
    // Clean up in case component unmounts while dragging
    cleanupListeners();
    setIsDragging(false);
    document.body.style.cursor = "";
  });

  return (
    <div
      ref={dividerRef}
      class={`forge-pane-divider forge-pane-divider-${props.direction}`}
      data-testid="pane-divider"
      data-dragging={isDragging()}
      onMouseDown={handleMouseDown}
    />
  );
}
