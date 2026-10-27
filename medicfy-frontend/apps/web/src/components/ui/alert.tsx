import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Aviso (§3.5 del doc de UX). El color nunca comunica solo — icono +
// texto siempre (§3.2.1), consistente con la regla ya aplicada en
// ErrorState/FieldWrapper.
//
// A-23: "critico" (rojo) es SOLO seguridad del paciente — alergia,
// interacción grave, bandera roja, medicamento controlado. Un fallo
// del sistema ("no se pudo emitir") usa "error", con el tono de
// --danger, para que el rojo siga significando peligro.
type AlertVariant = "info" | "exito" | "advertencia" | "error" | "critico";

const VARIANT_STYLES: Record<AlertVariant, { border: string; bg: string; text: string; icon: string }> = {
  info: { border: "border-brand-700", bg: "bg-brand-100", text: "text-brand-900", icon: "ℹ" },
  exito: { border: "border-success-600", bg: "bg-success-50", text: "text-success-600", icon: "✓" },
  advertencia: { border: "border-warn-600", bg: "bg-warn-50", text: "text-warn-600", icon: "⚠" },
  error: { border: "border-danger-600", bg: "bg-danger-50", text: "text-danger-600", icon: "✕" },
  critico: { border: "border-critical-600", bg: "bg-critical-50", text: "text-critical-600", icon: "⚠" },
};

export function Aviso({
  variant,
  title,
  children,
  className,
}: {
  variant: AlertVariant;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const styles = VARIANT_STYLES[variant];
  return (
    <div role={variant === "critico" || variant === "error" ? "alert" : "status"} className={cn("rounded-md border p-4", styles.border, styles.bg, className)}>
      <p className={cn("flex items-center gap-2 text-base font-medium", styles.text)}>
        <span aria-hidden="true">{styles.icon}</span>
        {title}
      </p>
      {children && <div className="mt-1 text-base text-gray-700">{children}</div>}
    </div>
  );
}
