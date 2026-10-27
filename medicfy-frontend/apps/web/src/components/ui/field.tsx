import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// CLAUDE.md §5: texto clínico-adyacente mínimo 16px (text-base ya
// vale 16px por el token de §9.1); área táctil 44px; el color nunca
// es el único portador de significado — el error siempre trae texto,
// el borde rojo es un refuerzo, no la señal completa.
//
// Los selectores [&::-webkit-*-spin-button] y [&[type=number]] quitan
// el control nativo del sistema operativo (las flechitas) en inputs
// numéricos — se ve distinto en cada navegador/OS y no es parte del
// diseño; el valor sigue siendo editable con teclado y rueda del mouse.
const fieldControlClass =
  "min-h-[44px] w-full rounded-md border bg-white px-3 text-base text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&[type=number]]:[appearance:textfield]";

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  // Vitales (DOC-06): la etiqueta puede ser una o dos líneas según el
  // signo ("TA sistólica" vs "Frecuencia respiratoria"); sin reservar
  // el mismo alto, el valor numérico queda a distinta altura tarjeta a
  // tarjeta y la fila se ve despeinada.
  labelClassName?: string | undefined;
  children: React.ReactNode;
}

export function FieldWrapper({ label, htmlFor, error, hint, labelClassName, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className={cn("text-sm font-medium text-gray-700", labelClassName)}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-gray-500">{hint}</p>}
      {error && (
        <p role="alert" className="flex items-center gap-1 text-sm text-danger-600">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(fieldControlClass, error ? "border-danger-600" : "border-gray-300", className)}
      {...props}
    />
  )
);
TextInput.displayName = "TextInput";

// Consulta (DOC-06): campos largos de la nota (padecimiento actual,
// exploración, análisis, plan). resize-y en vez de none — una nota
// clínica larga sin poder agrandar el campo es peor UX que perder la
// consistencia visual exacta del alto fijo de fieldControlClass.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldControlClass, "min-h-[100px] resize-y py-2", error ? "border-danger-600" : "border-gray-300", className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const SelectInput = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(({ className, error, children, ...props }, ref) => (
  <div className="relative w-full">
    <select
      ref={ref}
      className={cn(
        fieldControlClass,
        "appearance-none pr-10",
        error ? "border-danger-600" : "border-gray-300",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  </div>
));
SelectInput.displayName = "SelectInput";
