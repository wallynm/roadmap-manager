import { tv, type VariantProps } from "tailwind-variants";
import { type HTMLAttributes } from "react";

export const badgeVariants = tv({
  base: "inline-flex items-center gap-1 font-medium shrink-0",
  variants: {
    variant: {
      default: "bg-secondary text-muted-foreground",
      primary: "bg-primary/15 text-primary",
      amber:   "bg-amber-500/15 text-amber-400",
      red:     "bg-red-500/15 text-red-400",
      green:   "bg-emerald-500/15 text-emerald-400",
    },
    size: {
      xs: "text-[10px] px-1.5 py-0.5 rounded-full",
      sm: "text-xs px-2 py-0.5 rounded-full",
    },
    square: {
      true: "rounded",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "xs",
  },
});

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, square, children, ...props }: BadgeProps) {
  return (
    <span className={badgeVariants({ variant, size, square, className })} {...props}>
      {children}
    </span>
  );
}
