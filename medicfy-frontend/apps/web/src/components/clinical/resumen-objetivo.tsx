"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

// Fase 8 — "Resumen objetivo": a petición explícita del usuario
// (2026-09-02), "un espacio estratégico donde en cualquier momento de
// la consulta se pueda identificar" y "debe durar menos". Vive en
// Zona 1 (CLAUDE.md §6: "siempre visible, nunca detrás de una
// pestaña"), no en la pestaña Asistente — son dos funciones
// distintas: esto es un espejo objetivo y rápido de lo ya escrito;
// los diferenciales/banderas rojas siguen viviendo solo en la
// pestaña, donde el pipeline completo (más lento, con persistencia y
// tope de gasto) tiene sentido.
type SummaryOutcome =
  | { kind: "ok"; resumen: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "cancelled" };

const UNAVAILABLE_MESSAGE: Record<string, string> = {
  TIMEOUT: "No respondió a tiempo. Intenta de nuevo.",
  NOT_CONFIGURED: "El asistente no está configurado en este entorno.",
  PROVIDER_ERROR: "Hubo un error al conectar. Intenta de nuevo.",
  INVALID_OUTPUT: "No se pudo generar el resumen esta vez. Intenta de nuevo.",
};

export function ResumenObjetivo({ encounterId, accessToken }: { encounterId: string; accessToken: string }) {
  const [resumen, setResumen] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const outcome = await apiFetch<SummaryOutcome>(`/records/encounters/${encounterId}/assistant/summary`, {
        method: "POST",
        accessToken,
        body: {},
      });
      if (outcome.kind === "ok") {
        setResumen(outcome.resumen);
        setLastUpdated(new Date());
      } else if (outcome.kind === "unavailable") {
        setError(UNAVAILABLE_MESSAGE[outcome.reason] ?? "No disponible por ahora.");
      } else {
        setError("Se canceló. Intenta de nuevo.");
      }
    } catch {
      setError("No se pudo contactar al asistente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="Resumen objetivo de la consulta" className="rounded-md border border-gray-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Resumen objetivo</h2>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void generate()}
          disabled={loading}
          className="min-h-11 px-3 text-sm"
        >
          {loading ? "Generando…" : resumen ? "Actualizar" : "Generar"}
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-gray-500">{error}</p>}
      {resumen && !loading && (
        <>
          <p className="mt-2 text-base text-gray-900">{resumen}</p>
          {lastUpdated && (
            <p className="mt-1 text-xs text-gray-400">
              Actualizado {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </>
      )}
      {!resumen && !loading && !error && (
        <p className="mt-1 text-sm text-gray-500">Un espejo objetivo de lo que llevas escrito — nunca diagnostica.</p>
      )}
    </section>
  );
}
