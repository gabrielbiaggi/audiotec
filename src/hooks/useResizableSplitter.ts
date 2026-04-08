import { useCallback, useRef, useState } from "react";

/**
 * useResizableSplitter — drag-to-resize split ratio between two panels.
 *
 * Returns `ratio` (0-1, top/left panel fraction), a ref for the drag handle,
 * and mouse event handlers that work on the parent container.
 */
export function useResizableSplitter(
  initialRatio = 0.65,
  min = 0.2,
  max = 0.8,
  direction: "vertical" | "horizontal" = "vertical",
) {
  const [ratio, setRatio] = useState(initialRatio);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio: number;
      if (direction === "vertical") {
        newRatio = (ev.clientY - rect.top) / rect.height;
      } else {
        newRatio = (ev.clientX - rect.left) / rect.width;
      }
      setRatio(Math.min(max, Math.max(min, newRatio)));
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = direction === "vertical" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }, [direction, min, max]);

  return { ratio, containerRef, onMouseDown };
}
