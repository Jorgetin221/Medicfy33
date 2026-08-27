import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// <details>/<summary> nativo — igual patrón que "Medicación crónica"
// en consulta-sidebar.tsx (teclado-accesible, sin JS de estado). Se
// generaliza aquí porque ahora lo usan varios bloques de la historia
// clínica (antecedentes-editor.tsx, historia-fase2.tsx) — no tenía
// sentido duplicar el marcado cuatro veces.
export function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={cn("group rounded-lg border border-gray-300 bg-white shadow-card", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-6 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-gray-900">{title}</span>
          {subtitle}
        </span>
        <span aria-hidden="true" className="shrink-0 text-gray-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-6 pb-6">{children}</div>
    </details>
  );
}
