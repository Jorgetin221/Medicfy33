"use client";

import { useCallback, useEffect, useState } from "react";
import { ASSISTANT_PASSES, type AssistantPass, type AssistantReading } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/alert";

// Fase 8 · Prompt 53 — "La pestaña Asistente" (docs/medicfy-58-prompts.md,
// Bloque 9). Primera versión: dispara los 4 pases y MUESTRA la lectura
// completa, en el orden que pide el prompt (banderas rojas primero,
// diferenciales después de "qué falta"). Deliberadamente NO incluye
// todavía las acciones Aceptar/Descartar/Preguntar por elemento — eso
// necesita su propio diseño (cómo "aceptar un diferencial" se integra
// con el flujo de diagnóstico CIE-10 existente) y queda para un
// siguiente incremento, no silenciado.
type PassOutcome =
  | { kind: "ok"; reading: AssistantReading; readingId: string; createdAt: string }
  | { kind: "unavailable"; reason: "TIMEOUT" | "NOT_CONFIGURED" | "PROVIDER_ERROR" | "INVALID_OUTPUT" | "SPEND_CAP_REACHED" }
  | { kind: "cancelled" };

interface StoredReading {
  id: string;
  pase: AssistantPass;
  reading: AssistantReading;
  createdAt: string;
}

const PASS_LABEL: Record<AssistantPass, string> = {
  SUBJETIVO: "Leer subjetivo",
  OBJETIVO: "Leer objetivo",
  ANALISIS: "Leer análisis",
  CIERRE: "Revisión de cierre",
};

const UNAVAILABLE_MESSAGE: Record<Exclude<PassOutcome, { kind: "ok" } | { kind: "cancelled" }>["reason"], string> = {
  TIMEOUT: "El asistente no respondió a tiempo. La consulta sigue igual — puedes intentar de nuevo.",
  NOT_CONFIGURED: "El asistente no está configurado en este entorno todavía.",
  PROVIDER_ERROR: "Hubo un error al conectar con el asistente. Intenta de nuevo.",
  INVALID_OUTPUT: "El asistente no generó una lectura válida esta vez. Intenta de nuevo.",
  SPEND_CAP_REACHED: "Se alcanzó el tope de uso del asistente para esta consulta.",
};

const URGENCY_LABEL: Record<string, string> = { inmediata: "Inmediata", misma_consulta: "Misma consulta", seguimiento: "Seguimiento" };
const PROBABILITY_LABEL: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };

function fuenteFor(reading: AssistantReading, fuenteId: string | null): string | null {
  if (!fuenteId) return null;
  return reading.fuentes.find((f) => f.id === fuenteId)?.fuente ?? null;
}

export function AsistenteTab({ encounterId, accessToken }: { encounterId: string; accessToken: string }) {
  const [readings, setReadings] = useState<StoredReading[] | null>(null);
  const [pending, setPending] = useState<AssistantPass | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<StoredReading[]>(`/records/encounters/${encounterId}/assistant/passes`, { accessToken });
      setReadings(list);
    } catch {
      setReadings([]);
    }
  }, [encounterId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runPass(pase: AssistantPass) {
    setPending(pase);
    setError(null);
    try {
      const outcome = await apiFetch<PassOutcome>(`/records/encounters/${encounterId}/assistant/passes`, {
        method: "POST",
        accessToken,
        body: { pase },
      });
      if (outcome.kind === "ok") {
        await load();
      } else if (outcome.kind === "unavailable") {
        setError(UNAVAILABLE_MESSAGE[outcome.reason]);
      } else {
        setError("Se canceló el pase anterior.");
      }
    } catch {
      setError("No se pudo contactar al asistente. Intenta de nuevo.");
    } finally {
      setPending(null);
    }
  }

  const latest = readings && readings.length > 0 ? readings[readings.length - 1] : undefined;
  const reading = latest?.reading;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm text-gray-700">
          El Segundo Lector lee lo capturado y señala qué mirar — nunca diagnostica ni sustituye tu juicio clínico.
        </p>
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_PASSES.map((pase) => (
            <Button
              key={pase}
              type="button"
              variant="secondary"
              disabled={pending !== null}
              onClick={() => void runPass(pase)}
              className="min-h-11 text-sm"
            >
              {pending === pase ? "Leyendo…" : PASS_LABEL[pase]}
            </Button>
          ))}
        </div>
        {pending && <p className="mt-2 text-sm text-gray-500">Esto puede tardar hasta 2-3 minutos — el asistente lee todo el contexto disponible.</p>}
      </div>

      {error && <Aviso variant="advertencia" title={error} />}

      {!reading && !pending && readings !== null && (
        <p className="text-sm text-gray-500">Sin lecturas todavía. Dispara un pase cuando tengas algo capturado.</p>
      )}

      {reading && (
        <div className="flex flex-col gap-4">
          {reading.banderas_rojas.length > 0 && (
            <div className="flex flex-col gap-2">
              {reading.banderas_rojas.map((b) => (
                <Aviso key={b.id} variant="critico" title={`${b.hallazgo} — ${URGENCY_LABEL[b.urgencia] ?? b.urgencia}`}>
                  <p>
                    <strong>Por qué importa:</strong> {b.por_que_importa}
                  </p>
                  <p>
                    <strong>Qué hacer:</strong> {b.que_hacer}
                  </p>
                </Aviso>
              ))}
            </div>
          )}

          {reading.resumen && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Resumen</h4>
              <p className="text-base text-gray-900">{reading.resumen}</p>
            </div>
          )}

          {(reading.falta_por_preguntar.length > 0 || reading.falta_por_explorar.length > 0) && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Qué falta</h4>
              <ul className="flex flex-col gap-2">
                {reading.falta_por_preguntar.map((p) => (
                  <li key={p.id} className="rounded-md border border-gray-300 p-2 text-sm">
                    <p className="font-medium text-gray-900">Preguntar: {p.pregunta}</p>
                    <p className="text-gray-500">{p.para_que}</p>
                  </li>
                ))}
                {reading.falta_por_explorar.map((m) => (
                  <li key={m.id} className="rounded-md border border-gray-300 p-2 text-sm">
                    <p className="font-medium text-gray-900">Explorar: {m.maniobra}</p>
                    <p className="text-gray-500">{m.para_que}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reading.diferenciales.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Diferenciales</h4>
              <ul className="flex flex-col gap-2">
                {reading.diferenciales.map((d) => (
                  <li key={d.id} className="rounded-md border border-gray-300 p-3">
                    <p className="flex items-center justify-between gap-2">
                      <span className="text-base font-medium text-gray-900">
                        {d.diagnostico}
                        {d.codigo_sugerido ? ` (${d.codigo_sugerido})` : ""}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        Probabilidad {PROBABILITY_LABEL[d.probabilidad_relativa] ?? d.probabilidad_relativa}
                      </span>
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-medium text-brand-700">Ver detalle</summary>
                      <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <p className="font-medium text-gray-700">A favor</p>
                          <ul className="list-disc pl-5 text-gray-700">
                            {d.a_favor.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-gray-700">En contra</p>
                          <ul className="list-disc pl-5 text-gray-700">
                            {d.en_contra.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                        {d.que_lo_confirmaria.length > 0 && (
                          <div>
                            <p className="font-medium text-gray-700">Qué lo confirmaría</p>
                            <ul className="list-disc pl-5 text-gray-700">
                              {d.que_lo_confirmaria.map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.que_lo_descartaria.length > 0 && (
                          <div>
                            <p className="font-medium text-gray-700">Qué lo descartaría</p>
                            <ul className="list-disc pl-5 text-gray-700">
                              {d.que_lo_descartaria.map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(reading.estudios_sugeridos.length > 0 || reading.plan_sugerido.length > 0) && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Estudios y plan sugeridos</h4>
              <ul className="flex flex-col gap-2">
                {reading.estudios_sugeridos.map((e) => (
                  <li key={e.id} className="rounded-md border border-gray-300 p-2 text-sm">
                    <p className="font-medium text-gray-900">{e.estudio}</p>
                    <p className="text-gray-500">{e.para_que}</p>
                    <p className="text-gray-500">Cambia la conducta si: {e.cambia_la_conducta_si}</p>
                  </li>
                ))}
                {reading.plan_sugerido.map((p) => {
                  const fuente = fuenteFor(reading, p.fuente_id);
                  return (
                    <li key={p.id} className={`rounded-md border p-2 text-sm ${fuente ? "border-gray-300" : "border-gray-200 bg-gray-50"}`}>
                      <p className={fuente ? "font-medium text-gray-900" : "font-medium text-gray-500"}>{p.intervencion}</p>
                      {p.precaucion && <p className="text-gray-500">Precaución: {p.precaucion}</p>}
                      <p className="mt-1 text-xs text-gray-400">{fuente ? `Fuente: ${fuente}` : "Sin respaldo verificable"}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {reading.no_puedo_saber.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">No puedo saber</h4>
              <ul className="list-disc pl-5 text-sm text-gray-700">
                {reading.no_puedo_saber.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-gray-200 pt-2 text-xs text-gray-400">
            Confianza: {Math.round(reading.meta.confianza_global * 100)}% — {reading.meta.por_que_esa_confianza}
          </p>
        </div>
      )}
    </div>
  );
}
