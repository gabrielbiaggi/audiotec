/**
 * MonoDisplay — Atomic component for displaying audio data with high-contrast
 * monospaced numerics. Inspired by hardware LED/LCD readouts.
 *
 * Design rationale:
 * - font-mono text-lg/text-xl → numerics MUST be large and readable at a glance
 * - High-contrast color (cyan, green, white) on near-black background
 * - Label uses font-sans text-xs uppercase tracking-wider for elegant hierarchy
 * - No border/box nesting — flat, clean, information-dense
 */

interface MonoDisplayProps {
  /** The numeric or string value to display prominently */
  value: string;
  /** Unit suffix (e.g., "Hz", "dB", "ms") */
  unit?: string;
  /** Small uppercase label above the value */
  label?: string;
  /** Text color for the value — defaults to accent cyan */
  color?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional className */
  className?: string;
}

const SIZE_MAP = {
  sm: { value: "text-sm", unit: "text-[10px]", label: "text-[9px]" },
  md: { value: "text-base", unit: "text-xs", label: "text-[10px]" },
  lg: { value: "text-xl", unit: "text-sm", label: "text-xs" },
} as const;

export default function MonoDisplay({
  value,
  unit,
  label,
  color = "text-[#00e5ff]",
  size = "md",
  className = "",
}: MonoDisplayProps) {
  const s = SIZE_MAP[size];
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <span className={`font-sans ${s.label} uppercase tracking-wider text-zinc-500 mb-0.5`}>
          {label}
        </span>
      )}
      <span className={`font-mono ${s.value} ${color} leading-none tabular-nums`}>
        {value}
        {unit && (
          <span className={`${s.unit} text-zinc-500 ml-1`}>{unit}</span>
        )}
      </span>
    </div>
  );
}
