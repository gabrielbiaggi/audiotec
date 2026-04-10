/**
 * ProButton — Utilitarian button for Pro Audio interfaces.
 *
 * Design rationale:
 * - NO e-commerce padding or rounded-full corners
 * - Matte, flat appearance with subtle border
 * - Active/pressed state lights up the accent color
 * - px-4 py-2 for comfortable touch targets, rounded-md for subtle softness
 * - Disabled state dims opacity — no cursor-pointer
 */

interface ProButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Active/engaged state — lights up the button */
  active?: boolean;
  /** Color accent when active */
  accent?: "primary" | "danger" | "success" | "warning";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Icon-only mode (square) */
  icon?: boolean;
  title?: string;
  className?: string;
}

const ACCENT_MAP = {
  primary: { active: "border-[#00e5ff]/50 text-[#00e5ff] bg-[#00e5ff]/10", hover: "hover:border-[#00e5ff]/30 hover:text-[#00e5ff]" },
  danger:  { active: "border-red-500/50 text-red-400 bg-red-500/10", hover: "hover:border-red-500/30 hover:text-red-400" },
  success: { active: "border-green-500/50 text-green-400 bg-green-500/10", hover: "hover:border-green-500/30 hover:text-green-400" },
  warning: { active: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10", hover: "hover:border-yellow-500/30 hover:text-yellow-400" },
} as const;

const SIZE_MAP = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
} as const;

export default function ProButton({
  children,
  onClick,
  disabled = false,
  active = false,
  accent = "primary",
  size = "md",
  icon = false,
  title,
  className = "",
}: ProButtonProps) {
  const colors = ACCENT_MAP[accent];
  const sizeClass = icon
    ? size === "sm" ? "w-7 h-7" : size === "lg" ? "w-11 h-11" : "w-9 h-9"
    : SIZE_MAP[size];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        inline-flex items-center justify-center gap-1.5
        font-sans font-semibold tracking-wide rounded-md
        border border-zinc-700/50 text-zinc-400
        transition-all duration-100
        ${active ? colors.active : colors.hover}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
        ${sizeClass}
        ${className}
      `}
    >
      {children}
    </button>
  );
}
