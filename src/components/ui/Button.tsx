import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";
import { Loader2 } from "lucide-react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        primary:   "bg-primary/20 text-primary hover:bg-primary/30",
        solid:     "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "text-muted-foreground hover:text-foreground hover:bg-accent",
        ghost:     "hover:bg-accent text-foreground",
        success:   "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
        warning:   "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
        danger:    "bg-red-500/20 text-red-400 hover:bg-red-500/30",
        info:      "bg-sky-500/20 text-sky-400 hover:bg-sky-500/30",
        destructive: "hover:bg-destructive/20 text-destructive",
      },
      size: {
        icon: "p-1",
        sm:   "px-2.5 py-1 text-xs",
        md:   "px-3 py-1.5 text-sm",
        lg:   "px-4 py-2 text-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
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
