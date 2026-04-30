import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { type HTMLAttributes, type ReactNode } from "react";

const overlayVariants = tv({
  base: "fixed inset-0 flex bg-black/60 backdrop-blur-sm",
  variants: {
    align: {
      center: "items-center justify-center",
      top:    "items-start justify-center",
    },
    layer: {
      base:  "z-50",
      above: "z-[100]",
    },
  },
  defaultVariants: {
    align: "center",
    layer: "base",
  },
});

interface ModalOverlayProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof overlayVariants> {
  onClose?: () => void;
  children: ReactNode;
}

export function ModalOverlay({ className, align, layer, onClose, children, ...props }: ModalOverlayProps) {
  return (
    <div
      className={overlayVariants({ align, layer, className })}
      onClick={onClose}
      {...props}
    >
      {children}
    </div>
  );
}

// ── ModalPanel ─────────────────────────────────────────────────────────────

interface ModalPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ModalPanel({ className, children, ...props }: ModalPanelProps) {
  return (
    <div
      className={cn(
        "relative bg-card border border-border rounded-xl shadow-2xl",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}
