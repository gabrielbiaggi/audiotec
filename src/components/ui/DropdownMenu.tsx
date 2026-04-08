import { useState, useRef, useEffect } from "react";

interface DropdownMenuProps {
  label: string;
  children: React.ReactNode;
}

/**
 * DropdownMenu — button that opens a dropdown panel below.
 * Used in ControlBar to group secondary controls (FFT/Win/Avg).
 */
export default function DropdownMenu({ label, children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold
                     tracking-wide transition-colors
                     ${open
                       ? "bg-accent/15 text-accent border-accent/30"
                       : "text-text-dim border-border-default hover:text-text-secondary hover:bg-bg-elevated"
                     }`}
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="dropdown-menu absolute bottom-full mb-1 left-0 z-50
                        bg-bg-elevated border border-border-default rounded-lg
                        shadow-lg shadow-black/40 p-2 min-w-[200px]">
          {children}
        </div>
      )}
    </div>
  );
}
