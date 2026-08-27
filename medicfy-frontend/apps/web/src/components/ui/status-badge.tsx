import { cn } from "@/lib/utils";

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

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; icon: string; className: string }> = {
  PENDING_PAYMENT: { label: "Pago pendiente", icon: "⏳", className: "border-warn-600 text-warn-600" },
  SCHEDULED: { label: "Agendada", icon: "○", className: "border-gray-500 text-gray-700" },
  CONFIRMED: { label: "Confirmada", icon: "✓", className: "border-success-600 text-success-600" },
  IN_PROGRESS: { label: "En consulta", icon: "▶", className: "border-brand-700 text-brand-700" },
  COMPLETED: { label: "Completada", icon: "✓", className: "border-success-600 text-success-600" },
  CANCELLED_BY_PATIENT: { label: "Cancelada (paciente)", icon: "✕", className: "border-danger-600 text-danger-600" },
  CANCELLED_BY_DOCTOR: { label: "Cancelada (médico)", icon: "✕", className: "border-danger-600 text-danger-600" },
  NO_SHOW: { label: "No se presentó", icon: "✕", className: "border-danger-600 text-danger-600" },
};

export function EstadoCita({ status, className }: { status: AppointmentStatus; className?: string }) {
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
      {config.label}
    </span>
  );
}
