import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// CLAUDE.md §5: área táctil mínima 44×44 px.
const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
  {
    variants: {
      variant: {
        primary: "bg-brand-700 text-white hover:bg-brand-900",
        secondary: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-100",
        danger: "bg-danger-600 text-white hover:opacity-90",
      },
    },
    defaultVariants: { variant: "primary" },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, isLoading, disabled, children, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant }), className)} disabled={disabled || isLoading} {...props}>
      {isLoading ? "Guardando…" : children}
    </button>
  )
);
Button.displayName = "Button";
