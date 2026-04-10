/**
 * SectionLabel — Atomic section divider for Pro Audio panels.
 *
 * Replaces nested boxes with elegant typography-based hierarchy.
 * Uses uppercase font-sans with wide tracking — the "pro audio way"
 * to separate sections without borders or backgrounds.
 */

interface SectionLabelProps {
  children: React.ReactNode;
  /** Optional right-aligned action or badge */
  action?: React.ReactNode;
  className?: string;
}

export default function SectionLabel({ children, action, className = "" }: SectionLabelProps) {
  return (
    <div className={`flex items-center justify-between px-3 pt-4 pb-1.5 ${className}`}>
      <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {children}
      </span>
      {action}
    </div>
  );
}
