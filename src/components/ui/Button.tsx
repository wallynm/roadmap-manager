import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";
import { Loader2 } from "lucide-react";

export const buttonVariants = tv({
  base: "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  variants: {
    variant: {
      primary:     "bg-primary/20 text-primary hover:bg-primary/30",
      solid:       "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary:   "text-muted-foreground hover:text-foreground hover:bg-accent",
      ghost:       "hover:bg-accent text-foreground",
      success:     "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
      warning:     "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
      danger:      "bg-red-500/20 text-red-400 hover:bg-red-500/30",
      info:        "bg-sky-500/20 text-sky-400 hover:bg-sky-500/30",
      destructive: "hover:bg-destructive/20 text-destructive",
      // tab: used for pill-shaped tab switchers (use `active` prop to highlight)
      tab:         "rounded-full text-muted-foreground hover:text-foreground hover:bg-accent",
      // add: full-width, centered, muted bg — for inline "Add item" buttons
      add:         "w-full bg-secondary/60 hover:bg-secondary text-muted-foreground/50 hover:text-muted-foreground rounded-lg",
    },
    size: {
      icon: "p-1 rounded",
      xs:   "px-2 py-0.5 text-[11px] rounded",
      sm:   "px-2.5 py-1 text-xs rounded",
      md:   "px-3 py-1.5 text-sm rounded",
      lg:   "px-4 py-2 text-sm rounded",
    },
    active: {
      true: "",
    },
    fullWidth: {
      true: "w-full",
    },
  },
  compoundVariants: [
    // tab active state
    { variant: "tab", active: true, class: "bg-secondary text-foreground" },
    // secondary active state (for view switcher buttons)
    { variant: "secondary", active: true, class: "bg-secondary text-foreground" },
    // primary active state (for filter/sort triggers with active filter)
    { variant: "primary", active: true, class: "bg-primary/15 text-primary" },
  ],
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, active, fullWidth, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, active: active ?? undefined, fullWidth: fullWidth ?? undefined }), className)}
        disabled={disabled ?? loading}
        {...props}
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
