import type { ReactNode } from "react";
import { ApiError } from "@/lib/api-client";

// CLAUDE.md §5: "Cada pantalla necesita sus cuatro estados: vacío,
// cargando, error y sin conexión." These four are shared across every
// Sprint 5c screen so the four states are consistent, not
// reimplemented per-screen.

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[120px] items-center justify-center gap-2 text-gray-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-700" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 p-8 text-center">
      <p className="text-base font-medium text-gray-700">{title}</p>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
  );
}

// Un error de red (offline/servidor caído) es su propio estado, no un
// mensaje genérico de error — distinción explícita, no adivinada.
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const isOffline = error instanceof ApiError && error.code === "NETWORK_ERROR";
  const message = error instanceof ApiError ? error.message : "Ocurrió un error inesperado.";

  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-danger-600 bg-white p-4">
      <p className="flex items-center gap-2 text-base font-medium text-danger-600">
        <span aria-hidden="true">{isOffline ? "📡" : "⚠"}</span>
        {isOffline ? "Sin conexión" : "Algo salió mal"}
      </p>
      <p className="text-base text-gray-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-sm font-medium text-brand-700 underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-gray-300 bg-white p-6 shadow-card ${className ?? ""}`}>{children}</div>;
}
