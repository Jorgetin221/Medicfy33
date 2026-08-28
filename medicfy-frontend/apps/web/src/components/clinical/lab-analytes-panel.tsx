"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api-client";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { VitalLineChart } from "@/components/clinical/resultados-charts";
import { VITAL_RANGE_LABEL, VITAL_RANGE_TILE_CLASS, type VitalRangeStatus } from "@/lib/vital-ranges";

interface LabAnalyteRecord {
  id: string;
  analyteName: string;
  loincCode: string | null;
  value: string | number;
  unit: string;
  referenceMin: string | number | null;
  referenceMax: string | number | null;
  measuredAt: string;
  reviewedAt: string | null;
}

const ANALYTE_LINE_COLOR = "var(--brand-700)";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(new Date(iso));
}

// Mismo cálculo que vital-ranges.ts (bajo/alto/normal), pero contra el
// rango de referencia DEL PROPIO ANALITO en vez de una tabla por edad
// — así lo pide el prompt 42A.
function analyteStatus(value: number, min: number | null, max: number | null): VitalRangeStatus {
  if (min === null && max === null) return "unknown";
  if (min !== null && value < min) return "low";
  if (max !== null && value > max) return "high";
  return "normal";
}

function AddAnalyteForm({ patientId, accessToken, onCreated }: { patientId: string; accessToken: string; onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [analyteName, setAnalyteName] = useState("");
  const [loincCode, setLoincCode] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [referenceMin, setReferenceMin] = useState("");
  const [referenceMax, setReferenceMax] = useState("");
  const [measuredAt, setMeasuredAt] = useState("");

  function resetForm() {
    setAnalyteName("");
    setLoincCode("");
    setValue("");
    setUnit("");
    setReferenceMin("");
    setReferenceMax("");
    setMeasuredAt("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/lab-analytes/patients/${patientId}`, {
        method: "POST",
        accessToken,
        body: {
          analyteName,
          loincCode: loincCode.trim() || undefined,
          value: Number(value),
          unit,
          referenceMin: referenceMin.trim() ? Number(referenceMin) : undefined,
          referenceMax: referenceMax.trim() ? Number(referenceMax) : undefined,
          measuredAt,
        },
      });
      resetForm();
      setIsOpen(false);
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="secondary" onClick={() => setIsOpen(true)}>
        + Agregar analito
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-md border border-gray-300 p-4" noValidate>
      {error ? <ErrorState error={error} /> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FieldWrapper label="Analito" htmlFor="analyte-name">
          <TextInput id="analyte-name" required value={analyteName} onChange={(e) => setAnalyteName(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Código LOINC (opcional)" htmlFor="analyte-loinc">
          <TextInput id="analyte-loinc" value={loincCode} onChange={(e) => setLoincCode(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Fecha de la medición" htmlFor="analyte-measured-at">
          <TextInput id="analyte-measured-at" type="date" required value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Valor" htmlFor="analyte-value">
          <TextInput id="analyte-value" type="number" step="any" required value={value} onChange={(e) => setValue(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Unidad" htmlFor="analyte-unit">
          <TextInput id="analyte-unit" required value={unit} onChange={(e) => setUnit(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Ref. mínima (opcional)" htmlFor="analyte-ref-min">
          <TextInput id="analyte-ref-min" type="number" step="any" value={referenceMin} onChange={(e) => setReferenceMin(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Ref. máxima (opcional)" htmlFor="analyte-ref-max">
          <TextInput id="analyte-ref-max" type="number" step="any" value={referenceMax} onChange={(e) => setReferenceMax(e.target.value)} />
        </FieldWrapper>
      </div>
      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting}>
          Guardar analito
        </Button>
        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// Fase 5 · Prompt 42A: "Resultados de laboratorio como analitos
// ESTRUCTURADOS ... NO como un PDF adjunto ni como número de orden."
// Sección "Laboratorio" dentro de la pestaña Resultados existente,
// junto a — no en lugar de — "Signos vitales" (ResultadosCharts).
export function LabAnalytesPanel({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const [analytes, setAnalytes] = useState<LabAnalyteRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<LabAnalyteRecord[]>(`/lab-analytes/patients/${patientId}`, { accessToken })
      .then(setAnalytes)
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(load, [load]);

  async function markReviewed(analyteId: string) {
    setError(null);
    setReviewingId(analyteId);
    try {
      await apiFetch(`/lab-analytes/patients/${patientId}/${analyteId}/review`, { method: "POST", accessToken });
      load();
    } catch (err) {
      setError(err);
    } finally {
      setReviewingId(null);
    }
  }

  if (error && !analytes) return <ErrorState error={error} onRetry={load} />;
  if (!analytes) return <LoadingState label="Cargando analitos…" />;

  const groups = new Map<string, LabAnalyteRecord[]>();
  for (const a of analytes) {
    const list = groups.get(a.analyteName) ?? [];
    list.push(a);
    groups.set(a.analyteName, list);
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorState error={error} /> : null}
      {groups.size === 0 ? (
        <EmptyState title="Sin analitos capturados" description="Agrega un valor de laboratorio para empezar a graficar su tendencia." />
      ) : (
        Array.from(groups.entries()).map(([analyteName, entries]) => {
          const sorted = [...entries].sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());
          const latest = sorted[sorted.length - 1];
          if (!latest) return null;
          const min = latest.referenceMin === null ? null : Number(latest.referenceMin);
          const max = latest.referenceMax === null ? null : Number(latest.referenceMax);
          const status = analyteStatus(Number(latest.value), min, max);
          const statusLabel = VITAL_RANGE_LABEL[status];

          return (
            <Card key={analyteName}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {analyteName} {latest.loincCode ? <span className="font-normal text-gray-500">(LOINC {latest.loincCode})</span> : null}
                  </h4>
                  <p className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-base font-medium text-gray-900 ${VITAL_RANGE_TILE_CLASS[status]}`}>
                    {latest.value} {latest.unit}
                    {statusLabel ? <span aria-hidden="true">·</span> : null}
                    {statusLabel}
                  </p>
                  <p className="text-sm text-gray-500">
                    Medido {formatMxDate(latest.measuredAt)}
                    {latest.reviewedAt ? ` · revisado ${formatMxDate(latest.reviewedAt)}` : ""}
                  </p>
                </div>
                {!latest.reviewedAt ? (
                  <Button type="button" variant="secondary" isLoading={reviewingId === latest.id} onClick={() => void markReviewed(latest.id)} className="min-h-11 px-3 text-sm">
                    Marcar como revisado
                  </Button>
                ) : null}
              </div>
              {sorted.length >= 2 ? (
                <div className="mt-3">
                  <VitalLineChart
                    title={`Tendencia — ${analyteName}`}
                    unit={latest.unit}
                    series={[{ name: analyteName, color: ANALYTE_LINE_COLOR, points: sorted.map((e) => ({ x: new Date(e.measuredAt).getTime(), y: Number(e.value) })) }]}
                    {...(min !== null && max !== null ? { band: { min, max, label: "Rango de referencia" } } : {})}
                  />
                </div>
              ) : null}
            </Card>
          );
        })
      )}
      <AddAnalyteForm patientId={patientId} accessToken={accessToken} onCreated={load} />
    </div>
  );
}
