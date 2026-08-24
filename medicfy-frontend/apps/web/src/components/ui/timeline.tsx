import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Timeline (§3.5 y §8.2 del doc de UX): "elemento de firma del
// producto" — línea de tiempo vertical persistente del expediente.
// Primitivo puro, sin datos todavía; Expediente lo conecta a eventos
// reales (consulta, receta, orden, resultado, documento) en un pase
// posterior.
export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="relative flex flex-col gap-6 border-l border-gray-300 pl-6">{children}</ol>;
}

export function TimelineItem({
  date,
  label,
  critical,
  children,
}: {
  date: string;
  label: string;
  critical?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-[calc(1.5rem+5px)] top-1 h-[9px] w-[9px] rounded-full border-2 border-white",
          critical ? "bg-critical-600" : "bg-brand-700"
        )}
      />
      <p className="text-sm text-gray-500">{date}</p>
      <p className="text-base font-medium text-gray-900">{label}</p>
      {children && <div className="mt-1 text-base text-gray-700">{children}</div>}
    </li>
  );
}
