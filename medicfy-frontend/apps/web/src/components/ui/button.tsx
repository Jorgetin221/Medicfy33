import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// CLAUDE.md §5: área táctil mínima 44×44 px.
//
// Gramática de las cuatro variantes — el rojo sólido nunca está en reposo.
//
// §5 reserva el rojo a alertas de seguridad del paciente, pero `--danger-600`
// y `--critical-600` son el mismo #b3261e (ver globals.css: "la separación es
// de gobernanza de uso, no de matiz visual"). Esa gobernanza vive en el código
// y el médico solo ve color: mientras "Quitar" y "Cancelar" fueran superficies
// rojas llenas, el rojo aparecía una docena de veces por jornada en acciones
// rutinarias y dejaba de alertar de nada.
//
//   primary     — la acción que la pantalla existe para provocar. Una por vista.
//   secondary   — acciones de apoyo.
//   destructive — destructivo EN REPOSO (en una lista, una tarjeta, un
//                 formulario): contorno y texto, sin relleno. 6.5:1 sobre
//                 blanco, WCAG 2.2 AA con margen.
//   danger      — relleno rojo. Solo DESPUÉS de que el usuario pidió la acción
//                 destructiva: dentro de un paso de confirmación ya abierto, o
//                 en revocaciones administrativas irreversibles. Cada uso lleva
//                 comentario que lo justifica.
//
// El color no es el único portador de significado (§5): la etiqueta de texto
// nombra siempre la consecuencia ("Cancelar cita", "Quitar").
const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
  {
    variants: {
      variant: {
        primary: "bg-brand-700 text-white hover:bg-brand-900",
        secondary: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-100",
        destructive: "border border-danger-600 bg-white text-danger-600 hover:bg-danger-50",
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
