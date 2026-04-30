import { tv, type VariantProps } from "tailwind-variants";
import { type HTMLAttributes } from "react";

const kbdVariants = tv({
  base: "border border-border/50 rounded leading-none font-sans text-muted-foreground/60",
  variants: {
    size: {
      xs: "text-[10px] px-1 py-0.5",
      sm: "text-xs px-1.5 py-0.5",
    },
  },
  defaultVariants: {
    size: "xs",
  },
});

interface KbdProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof kbdVariants> {}

export function Kbd({ className, size, children, ...props }: KbdProps) {
  return (
    <kbd className={kbdVariants({ size, className })} {...props}>
      {children}
    </kbd>
  );
}
