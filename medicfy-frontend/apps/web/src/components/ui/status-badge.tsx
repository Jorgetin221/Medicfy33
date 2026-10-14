"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";

// EstadoCita (§3.5 del doc de UX): "Etiqueta de estado con icono +
// texto". Reemplaza el STATUS_LABELS/STATUS_COLORS que antes vivía
// duplicado dentro de app/agenda/page.tsx — un dato, un lugar.
export type AppointmentStatus =
  | "PENDING_PAYMENT"
  | "SCHEDULED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_PATIENT"
  | "CANCELLED_BY_DOCTOR"
  | "NO_SHOW";

// La etiqueta sale del diccionario; el ícono y el color no cambian con
// el idioma. §5: el color nunca comunica solo — ícono + texto siempre.
const STATUS_CONFIG: Record<AppointmentStatus, { labelKey: MessageKey; icon: string; className: string }> = {
  PENDING_PAYMENT: { labelKey: "ui.cita.PENDING_PAYMENT", icon: "⏳", className: "border-warn-600 text-warn-600" },
  SCHEDULED: { labelKey: "ui.cita.SCHEDULED", icon: "○", className: "border-gray-500 text-gray-700" },
  CONFIRMED: { labelKey: "ui.cita.CONFIRMED", icon: "✓", className: "border-success-600 text-success-600" },
  IN_PROGRESS: { labelKey: "ui.cita.IN_PROGRESS", icon: "▶", className: "border-brand-700 text-brand-700" },
  COMPLETED: { labelKey: "ui.cita.COMPLETED", icon: "✓", className: "border-success-600 text-success-600" },
  CANCELLED_BY_PATIENT: { labelKey: "ui.cita.CANCELLED_BY_PATIENT", icon: "✕", className: "border-danger-600 text-danger-600" },
  CANCELLED_BY_DOCTOR: { labelKey: "ui.cita.CANCELLED_BY_DOCTOR", icon: "✕", className: "border-danger-600 text-danger-600" },
  NO_SHOW: { labelKey: "ui.cita.NO_SHOW", icon: "✕", className: "border-danger-600 text-danger-600" },
};

export function EstadoCita({ status, className }: { status: AppointmentStatus; className?: string }) {
  const t = useT();
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium",
        config.className,
        className
      )}
    >
      <span aria-hidden="true">{config.icon}</span>
      {t(config.labelKey)}
    </span>
  );
}
