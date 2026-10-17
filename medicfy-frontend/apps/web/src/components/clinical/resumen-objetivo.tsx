"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { flushEncounterDraft } from "@/lib/use-encounter-autosave";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { INTL_LOCALE } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/dictionaries";

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

const UNAVAILABLE_MESSAGE_KEY: Record<string, MessageKey> = {
  TIMEOUT: "clinico.resumenObjetivo.TIMEOUT",
  NOT_CONFIGURED: "clinico.resumenObjetivo.NOT_CONFIGURED",
  PROVIDER_ERROR: "clinico.resumenObjetivo.PROVIDER_ERROR",
  INVALID_OUTPUT: "clinico.resumenObjetivo.INVALID_OUTPUT",
};

export function ResumenObjetivo({ encounterId, accessToken }: { encounterId: string; accessToken: string }) {
  const { t, locale } = useI18n();
  const [resumen, setResumen] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      await flushEncounterDraft(encounterId);
      const outcome = await apiFetch<SummaryOutcome>(`/records/encounters/${encounterId}/assistant/summary`, {
        method: "POST",
        accessToken,
        body: {},
      });
      if (outcome.kind === "ok") {
        setResumen(outcome.resumen);
        setLastUpdated(new Date());
      } else if (outcome.kind === "unavailable") {
        const key = UNAVAILABLE_MESSAGE_KEY[outcome.reason];
        setError(key ? t(key) : t("clinico.resumenObjetivo.noDisponible"));
      } else {
        setError(t("clinico.resumenObjetivo.cancelado"));
      }
    } catch {
      setError(t("clinico.resumenObjetivo.sinContacto"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label={t("clinico.resumenObjetivo.etiquetaSeccion")} className="rounded-md border border-gray-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("clinico.resumenObjetivo.titulo")}</h2>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void generate()}
          disabled={loading}
          className="min-h-11 px-3 text-sm"
        >
          {loading ? t("clinico.resumenObjetivo.generando") : resumen ? t("clinico.resumenObjetivo.actualizar") : t("clinico.resumenObjetivo.generar")}
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-gray-500">{error}</p>}
      {resumen && !loading && (
        <>
          <p className="mt-2 text-base text-gray-900">{resumen}</p>
          {lastUpdated && (
            <p className="mt-1 text-xs text-gray-400">
              {t("clinico.resumenObjetivo.actualizadoA", {
                hora: lastUpdated.toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" }),
              })}
            </p>
          )}
        </>
      )}
      {!resumen && !loading && !error && (
        <p className="mt-1 text-sm text-gray-500">{t("clinico.resumenObjetivo.explicacion")}</p>
      )}
    </section>
  );
}
