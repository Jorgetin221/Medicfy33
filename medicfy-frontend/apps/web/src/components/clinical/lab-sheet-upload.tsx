"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";

// Capa 1 (v2.5) — "Debe estar en un espacio más estratégico..." no
// aplica aquí (eso fue Resumen objetivo); esto vive junto a
// LabAnalytesPanel en la pestaña Resultados. La "regla de oro" del
// usuario: ningún valor se guarda sin revisión campo por campo — este
// componente nunca llama a nada que escriba en lab_result_analytes
// directamente; solo /review lo hace, del lado del servidor.

interface Candidate {
  id: string;
  analyteNameRaw: string;
  valueRaw: string;
  unitRaw: string | null;
  referenceMinPrinted: string | number | null;
  referenceMaxPrinted: string | number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

interface Extraction {
  id: string;
  status: "EXTRACTING" | "REVIEW_PENDING" | "ACCEPTED" | "FAILED";
  candidates: Candidate[];
}

interface ReviewRow {
  candidateId: string;
  included: boolean;
  analyteName: string;
  value: string;
  unit: string;
  referenceMin: string;
  referenceMax: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  confirmedLowConfidence: boolean;
}

type Phase = "idle" | "uploading" | "review" | "submitting" | "accepted" | "error";

function toReviewRows(candidates: Candidate[]): ReviewRow[] {
  return candidates.map((c) => ({
    candidateId: c.id,
    included: true,
    analyteName: c.analyteNameRaw,
    value: c.valueRaw,
    unit: c.unitRaw ?? "",
    referenceMin: c.referenceMinPrinted !== null ? String(c.referenceMinPrinted) : "",
    referenceMax: c.referenceMaxPrinted !== null ? String(c.referenceMaxPrinted) : "",
    confidence: c.confidence,
    confirmedLowConfidence: false,
  }));
}

export function LabSheetUpload({
  patientId,
  accessToken,
  onAccepted,
}: {
  patientId: string;
  accessToken: string;
  onAccepted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [measuredAt, setMeasuredAt] = useState("");
  const [labName, setLabName] = useState("");
  const [error, setError] = useState<unknown>(null);

  function applyExtraction(extraction: Extraction) {
    setExtractionId(extraction.id);
    if (extraction.status === "REVIEW_PENDING") {
      setRows(toReviewRows(extraction.candidates));
      setPhase("review");
    } else if (extraction.status === "FAILED") {
      setPhase("error");
    }
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPhase("uploading");
    try {
      const extraction = await apiUpload<Extraction>(`/lab-sheet-extractions/patients/${patientId}`, file, { accessToken });
      applyExtraction(extraction);
    } catch (err) {
      setError(err);
      setPhase("error");
    }
  }

  async function handleRetry() {
    if (!extractionId) return;
    setError(null);
    setPhase("uploading");
    try {
      const extraction = await apiFetch<Extraction>(`/lab-sheet-extractions/patients/${patientId}/${extractionId}/retry`, {
        method: "POST",
        accessToken,
      });
      applyExtraction(extraction);
    } catch (err) {
      setError(err);
      setPhase("error");
    }
  }

  function updateRow(candidateId: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.candidateId === candidateId ? { ...r, ...patch } : r)));
  }

  const lowConfidenceUnconfirmed = rows.some(
    (r) => r.included && r.confidence === "LOW" && !r.confirmedLowConfidence
  );

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!extractionId) return;
    setError(null);
    setPhase("submitting");
    try {
      await apiFetch(`/lab-sheet-extractions/patients/${patientId}/${extractionId}/review`, {
        method: "POST",
        accessToken,
        body: {
          measuredAt,
          ...(labName.trim() ? { labName: labName.trim() } : {}),
          candidates: rows.map((r) => ({
            candidateId: r.candidateId,
            included: r.included,
            ...(r.included
              ? {
                  analyteName: r.analyteName,
                  value: Number(r.value),
                  unit: r.unit,
                  ...(r.referenceMin.trim() ? { referenceMin: Number(r.referenceMin) } : {}),
                  ...(r.referenceMax.trim() ? { referenceMax: Number(r.referenceMax) } : {}),
                  ...(r.confidence === "LOW" ? { confirmedLowConfidence: r.confirmedLowConfidence } : {}),
                }
              : {}),
          })),
        },
      });
      setPhase("accepted");
      onAccepted();
    } catch (err) {
      setError(err);
      setPhase("review");
    }
  }

  function reset() {
    setPhase("idle");
    setExtractionId(null);
    setRows([]);
    setMeasuredAt("");
    setLabName("");
    setError(null);
  }

  return (
    <section aria-label="Lectura automática de hoja de laboratorio" className="rounded-md border border-gray-300 p-3">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Subir hoja de laboratorio</h2>

      {phase === "idle" && (
        <label className="flex min-h-11 w-fit cursor-pointer items-center rounded-md border border-brand-700 px-3 text-base font-medium text-brand-700">
          Elegir archivo (imagen o PDF)
          <input type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => void handleFileSelected(e)} />
        </label>
      )}

      {phase === "uploading" && <p className="text-base text-gray-700">Extrayendo los valores de la hoja…</p>}

      {phase === "error" && (
        <div className="flex flex-col gap-2">
          {error ? <ErrorState error={error} /> : <p className="text-base text-gray-700">No se pudo leer la hoja.</p>}
          <div className="flex gap-3">
            {extractionId && (
              <Button type="button" variant="secondary" onClick={() => void handleRetry()} className="min-h-11">
                Reintentar
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={reset} className="min-h-11">
              Subir otra hoja
            </Button>
          </div>
          <p className="text-sm text-gray-500">O agrega los analitos manualmente en &quot;+ Agregar analito&quot;, abajo.</p>
        </div>
      )}

      {(phase === "review" || phase === "submitting") && (
        <form onSubmit={(e) => void handleSubmitReview(e)} className="flex flex-col gap-3">
          {/* Leyenda fija — nunca descartable mientras se revisa (petición explícita del usuario). */}
          <div className="sticky top-0 rounded-md border border-warn-600 bg-warn-50 p-2 text-base text-gray-900">
            Los valores fueron extraídos automáticamente y pueden contener errores de lectura. Verifique cada
            resultado contra la hoja original antes de aceptarlo.
          </div>

          {error ? <ErrorState error={error} /> : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FieldWrapper label="Fecha del estudio" htmlFor="sheet-measured-at">
              <TextInput id="sheet-measured-at" type="date" required value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label="Laboratorio (opcional)" htmlFor="sheet-lab-name">
              <TextInput id="sheet-lab-name" value={labName} onChange={(e) => setLabName(e.target.value)} />
            </FieldWrapper>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-gray-300 text-left text-sm text-gray-500">
                  <th className="p-2">Incluir</th>
                  <th className="p-2">Analito</th>
                  <th className="p-2">Valor</th>
                  <th className="p-2">Unidad</th>
                  <th className="p-2">Ref. mín.</th>
                  <th className="p-2">Ref. máx.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.candidateId}
                    className={row.confidence === "LOW" ? "border-b border-warn-600 bg-warn-50" : "border-b border-gray-200"}
                  >
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        className="h-6 w-6"
                        checked={row.included}
                        onChange={(e) => updateRow(row.candidateId, { included: e.target.checked })}
                        aria-label={`Incluir ${row.analyteName}`}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        value={row.analyteName}
                        onChange={(e) => updateRow(row.candidateId, { analyteName: e.target.value })}
                        aria-label="Nombre del analito"
                      />
                      {row.confidence === "LOW" && (
                        <label className="mt-1 flex items-center gap-1 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={row.confirmedLowConfidence}
                            onChange={(e) => updateRow(row.candidateId, { confirmedLowConfidence: e.target.checked })}
                          />
                          Confianza baja — confirmo este valor tras verlo en la hoja
                        </label>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        type="number"
                        step="any"
                        value={row.value}
                        onChange={(e) => updateRow(row.candidateId, { value: e.target.value })}
                        aria-label="Valor"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput value={row.unit} onChange={(e) => updateRow(row.candidateId, { unit: e.target.value })} aria-label="Unidad" />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        type="number"
                        step="any"
                        value={row.referenceMin}
                        onChange={(e) => updateRow(row.candidateId, { referenceMin: e.target.value })}
                        aria-label="Referencia mínima"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        type="number"
                        step="any"
                        value={row.referenceMax}
                        onChange={(e) => updateRow(row.candidateId, { referenceMax: e.target.value })}
                        aria-label="Referencia máxima"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button type="submit" isLoading={phase === "submitting"} disabled={lowConfidenceUnconfirmed || !measuredAt}>
              Aceptar valores revisados
            </Button>
            <Button type="button" variant="secondary" onClick={reset} className="min-h-11">
              Cancelar
            </Button>
          </div>
          {lowConfidenceUnconfirmed && (
            <p className="text-sm text-gray-700">Confirma cada fila de confianza baja antes de aceptar.</p>
          )}
        </form>
      )}

      {phase === "accepted" && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-gray-900">Valores aceptados y agregados al expediente.</p>
          <Button type="button" variant="secondary" onClick={reset} className="min-h-11 w-fit">
            Subir otra hoja
          </Button>
        </div>
      )}
    </section>
  );
}
