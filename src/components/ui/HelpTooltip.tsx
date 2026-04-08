import { useState, useRef, useEffect } from "react";
import { TOOLTIPS, type TooltipDef } from "../../data/tooltips";

interface HelpTooltipProps {
  /** Key into the TOOLTIPS dictionary */
  tooltipKey: string;
  /** Optional: override position alignment */
  align?: "left" | "right" | "center";
}

/**
 * HelpTooltip — contextual `?` icon that shows educational cards on hover.
 * Designed for beginner sound technicians — language is simple and practical.
 */
export default function HelpTooltip({ tooltipKey, align = "left" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltip: TooltipDef | undefined = TOOLTIPS[tooltipKey];

  // Close on outside click
  const containerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!tooltip) return null;

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
      setExpanded(false);
    }, 300);
  };

  const alignClass = align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="w-3.5 h-3.5 rounded-full bg-bg-elevated border border-border-default
                   text-text-dim text-[8px] font-bold leading-none flex items-center justify-center
                   hover:text-accent hover:border-accent/40 transition-colors cursor-help"
        onClick={() => setOpen((p) => !p)}
        aria-label={`Ajuda: ${tooltip.title}`}
      >
        ?
      </button>

      {open && (
        <div
          className={`help-tooltip absolute z-50 top-full mt-1.5 ${alignClass}
                      w-64 bg-bg-elevated border border-border-default rounded-lg
                      shadow-lg shadow-black/40 p-3`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <p className="text-[10px] font-bold text-accent mb-1 tracking-wide uppercase">
            {tooltip.title}
          </p>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {tooltip.short}
          </p>

          {tooltip.detail && (
            <>
              {expanded ? (
                <p className="text-[10px] text-text-dim leading-relaxed mt-2 border-t border-border-subtle pt-2">
                  {tooltip.detail}
                </p>
              ) : (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-[9px] text-accent/70 hover:text-accent mt-1.5 transition-colors"
                >
                  Saiba mais...
                </button>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
