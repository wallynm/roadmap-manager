import { cn } from "@/lib/utils";

interface LabelChipProps {
  label: string;
  color?: string;
  onRemove?: () => void;
  size?: "sm" | "md";
}

export function LabelChip({ label, color, onRemove, size = "sm" }: LabelChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      )}
      style={color ? { borderColor: color, color } : undefined}
    >
      {color && (
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:text-destructive">
          ×
        </button>
      )}
    </span>
  );
}
