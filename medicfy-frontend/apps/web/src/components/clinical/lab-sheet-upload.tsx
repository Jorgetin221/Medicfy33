"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";

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
  const t = useT();
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
    <section aria-label={t("clinico.hojaLab.seccion")} className="rounded-md border border-gray-300 p-3">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("clinico.hojaLab.titulo")}</h2>

      {phase === "idle" && (
        <label className="flex min-h-11 w-fit cursor-pointer items-center rounded-md border border-brand-700 px-3 text-base font-medium text-brand-700">
          {t("clinico.hojaLab.elegirArchivo")}
          <input type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => void handleFileSelected(e)} />
        </label>
      )}

      {phase === "uploading" && <p className="text-base text-gray-700">{t("clinico.hojaLab.extrayendo")}</p>}

      {phase === "error" && (
        <div className="flex flex-col gap-2">
          {error ? <ErrorState error={error} /> : <p className="text-base text-gray-700">{t("clinico.hojaLab.noSePudoLeer")}</p>}
          <div className="flex gap-3">
            {extractionId && (
              <Button type="button" variant="secondary" onClick={() => void handleRetry()} className="min-h-11">
                {t("common.acciones.reintentar")}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={reset} className="min-h-11">
              {t("clinico.hojaLab.subirOtra")}
            </Button>
          </div>
          <p className="text-sm text-gray-500">{t("clinico.hojaLab.agregaManual")}</p>
        </div>
      )}

      {(phase === "review" || phase === "submitting") && (
        <form onSubmit={(e) => void handleSubmitReview(e)} className="flex flex-col gap-3">
          {/* Leyenda fija — nunca descartable mientras se revisa (petición explícita del usuario). */}
          <div className="sticky top-0 rounded-md border border-warn-600 bg-warn-50 p-2 text-base text-gray-900">
            {t("clinico.hojaLab.avisoLectura")}
          </div>

          {error ? <ErrorState error={error} /> : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FieldWrapper label={t("clinico.hojaLab.fechaEstudio")} htmlFor="sheet-measured-at">
              <TextInput id="sheet-measured-at" type="date" required value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.hojaLab.laboratorio")} htmlFor="sheet-lab-name">
              <TextInput id="sheet-lab-name" value={labName} onChange={(e) => setLabName(e.target.value)} />
            </FieldWrapper>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b border-gray-300 text-left text-sm text-gray-500">
                  <th className="p-2">{t("clinico.hojaLab.incluir")}</th>
                  <th className="p-2">{t("clinico.analitos.analito")}</th>
                  <th className="p-2">{t("clinico.analitos.valor")}</th>
                  <th className="p-2">{t("clinico.analitos.unidad")}</th>
                  <th className="p-2">{t("clinico.hojaLab.refMin")}</th>
                  <th className="p-2">{t("clinico.hojaLab.refMax")}</th>
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
                        aria-label={t("clinico.hojaLab.incluirFila", { analito: row.analyteName })}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        value={row.analyteName}
                        onChange={(e) => updateRow(row.candidateId, { analyteName: e.target.value })}
                        aria-label={t("clinico.hojaLab.nombreAnalito")}
                      />
                      {row.confidence === "LOW" && (
                        <label className="mt-1 flex items-center gap-1 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={row.confirmedLowConfidence}
                            onChange={(e) => updateRow(row.candidateId, { confirmedLowConfidence: e.target.checked })}
                          />
                          {t("clinico.hojaLab.confianzaBaja")}
                        </label>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        type="number"
                        step="any"
                        value={row.value}
                        onChange={(e) => updateRow(row.candidateId, { value: e.target.value })}
                        aria-label={t("clinico.analitos.valor")}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput value={row.unit} onChange={(e) => updateRow(row.candidateId, { unit: e.target.value })} aria-label={t("clinico.analitos.unidad")} />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        type="number"
                        step="any"
                        value={row.referenceMin}
                        onChange={(e) => updateRow(row.candidateId, { referenceMin: e.target.value })}
                        aria-label={t("clinico.hojaLab.referenciaMinima")}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <TextInput
                        type="number"
                        step="any"
                        value={row.referenceMax}
                        onChange={(e) => updateRow(row.candidateId, { referenceMax: e.target.value })}
                        aria-label={t("clinico.hojaLab.referenciaMaxima")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button type="submit" isLoading={phase === "submitting"} disabled={lowConfidenceUnconfirmed || !measuredAt}>
              {t("clinico.hojaLab.aceptarValores")}
            </Button>
            <Button type="button" variant="secondary" onClick={reset} className="min-h-11">
              {t("common.acciones.cancelar")}
            </Button>
          </div>
          {lowConfidenceUnconfirmed && (
            <p className="text-sm text-gray-700">{t("clinico.hojaLab.confirmaFilas")}</p>
          )}
        </form>
      )}

      {phase === "accepted" && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-gray-900">{t("clinico.hojaLab.aceptados")}</p>
          <Button type="button" variant="secondary" onClick={reset} className="min-h-11 w-fit">
            {t("clinico.hojaLab.subirOtra")}
          </Button>
        </div>
      )}
    </section>
  );
}
