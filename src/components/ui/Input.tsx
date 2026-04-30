import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const inputVariants = tv({
  base: "bg-secondary/50 border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground/40 select-text rounded-lg",
  variants: {
    size: {
      xs: "px-2 py-1 text-xs",
      sm: "px-3 py-1.5 text-xs",
      md: "px-3 py-1.5 text-sm",
      lg: "px-3 py-2 text-sm",
    },
    numeric: {
      true: "text-right tabular-nums",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

type InputVariants = VariantProps<typeof inputVariants>;

// ── Input ──────────────────────────────────────────────────────────────────

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">, InputVariants {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, numeric, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputVariants({ size, numeric }), className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

// ── Select ─────────────────────────────────────────────────────────────────

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">, InputVariants {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, numeric, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(inputVariants({ size, numeric }), "text-muted-foreground", className)}
      {...props}
    />
  ),
);
Select.displayName = "Select";

// ── Textarea ───────────────────────────────────────────────────────────────

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size">, InputVariants {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, numeric, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(inputVariants({ size, numeric }), "resize-y", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
