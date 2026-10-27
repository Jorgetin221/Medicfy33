"use client";

import type { ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// CLAUDE.md §5: "Cada pantalla necesita sus cuatro estados: vacío,
// cargando, error y sin conexión." These four are shared across every
// Sprint 5c screen so the four states are consistent, not
// reimplemented per-screen.

export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return (
    <div role="status" className="flex min-h-[120px] items-center justify-center gap-2 text-gray-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-700" aria-hidden="true" />
      <span>{label ?? t("common.estados.cargando")}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  // CLAUDE.md / M.7: "Estado vacío con salida. Nunca 'No hay datos'.
  // Siempre qué significa + una acción." Cuando esa acción vive en la
  // misma pantalla (un botón "Agregar" justo arriba, un selector de
  // filtro), `description` sola ya cumple la regla y `action` se omite.
  // Cuando la salida requiere navegar a otra pantalla, `action` la trae
  // aquí mismo en vez de dejar al usuario a adivinar la ruta.
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 p-8 text-center">
      <p className="text-base font-medium text-gray-700">{title}</p>
      {description && <p className="text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// Un error de red (offline/servidor caído) es su propio estado, no un
// mensaje genérico de error — distinción explícita, no adivinada.
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const isOffline = error instanceof ApiError && error.code === "NETWORK_ERROR";
  // El texto de un ApiError viene del servidor, que ya responde en el
  // idioma pedido por Accept-Language (ver api-client.ts). Solo el
  // respaldo para un error que no es ApiError se traduce aquí.
  const message = error instanceof ApiError ? error.message : t("ui.estados.errorInesperado");

  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-danger-600 bg-white p-4">
      <p className="flex items-center gap-2 text-base font-medium text-danger-600">
        <span aria-hidden="true">{isOffline ? "📡" : "⚠"}</span>
        {isOffline ? t("ui.estados.sinConexion") : t("ui.estados.algoSalioMal")}
      </p>
      <p className="text-base text-gray-700">{message}</p>
      {/* B-12: área táctil mínima 44×44 px. */}
      {onRetry && (
        <button type="button" onClick={onRetry} className="min-h-11 w-fit text-base font-medium text-brand-700 underline">
          {t("common.acciones.reintentar")}
        </button>
      )}
    </div>
  );
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={cn("rounded-lg border border-gray-300 bg-white p-6 shadow-card", className)}>
      {children}
    </div>
  );
}
