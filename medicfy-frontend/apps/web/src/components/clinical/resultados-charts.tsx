"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, expectArray } from "@/lib/api-client";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";

// Prompt 30 — gráficas de evolución (pestaña Resultados de la Zona 3).
// Leen EXCLUSIVAMENTE campos estructurados de vital_sign_sets — ni una
// cadena de texto se procesa. Forma: tendencia en el tiempo → línea
// (2px, marcadores ≥8px con anillo de superficie), banda de rango
// normal como lavado de fondo, ÚLTIMO punto destacado y con etiqueta
// directa; un eje por gráfica (nunca doble eje: peso/talla/IMC son
// gráficas separadas). Sistólica/diastólica: dos tonos de un mismo
// matiz (par relacionado) + leyenda + etiquetas directas, para no
// depender solo del color.

interface VitalsRow {
  recordedAt: string;
  bpSystolicMmHg: number | null;
  bpDiastolicMmHg: number | null;
  weightKg: string | number | null;
  heightCm: string | number | null;
  bmi: string | number | null;
  weightPercentile: string | number | null;
  percentileSource: string | null;
}

interface GrowthCurve {
  source: string;
  curve: { ageMonths: number; p3: number; p15: number; p50: number; p85: number; p97: number }[];
}

interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

const W = 320;
const H = 150;
const PAD = { left: 34, right: 10, top: 10, bottom: 18 };

function scale(points: { x: number; y: number }[][], band?: { min: number; max: number }) {
  const xs = points.flat().map((p) => p.x);
  const ys = points.flat().map((p) => p.y);
  if (band) ys.push(band.min, band.max);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const spanX = x1 - x0 || 1;
  const spanY = (y1 - y0 || 1) * 1.15;
  const yBase = y0 - (y1 - y0 || 1) * 0.075;
  return {
    x: (v: number) => PAD.left + ((v - x0) / spanX) * (W - PAD.left - PAD.right),
    y: (v: number) => H - PAD.bottom - ((v - yBase) / spanY) * (H - PAD.top - PAD.bottom),
  };
}

export function VitalLineChart({
  title,
  unit,
  series,
  band,
  referenceCurves,
}: {
  title: string;
  unit: string;
  series: Series[];
  // Banda de rango normal, pintada como lavado de fondo.
  band?: { min: number; max: number; label: string };
  // Pediatría: curvas de percentilas (P3..P97) como contexto gris.
  referenceCurves?: { label: string; points: { x: number; y: number }[] }[];
}) {
  // `tr` y no `t`: `t` ya es la función local que saca el timestamp
  // de una fila de signos vitales.
  const tr = useT();
  const nonEmpty = series.filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <Card>
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <p className="text-sm text-gray-500">{tr("clinico.graficas.sinDatos")}</p>
      </Card>
    );
  }
  const allPoints = [...nonEmpty.map((s) => s.points), ...(referenceCurves ?? []).map((c) => c.points)];
  const sc = scale(allPoints, band);

  return (
    <Card data-testid={`chart-${title}`}>
      <h4 className="text-sm font-semibold text-gray-900">
        {title} <span className="font-normal text-gray-500">({unit})</span>
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} a lo largo de las consultas`} className="w-full">
        {band ? (
          <rect
            x={PAD.left}
            y={sc.y(band.max)}
            width={W - PAD.left - PAD.right}
            height={Math.max(2, sc.y(band.min) - sc.y(band.max))}
            className="fill-success-50"
          >
            <title>{band.label}</title>
          </rect>
        ) : null}
        {(referenceCurves ?? []).map((curve) => (
          <polyline
            key={curve.label}
            points={curve.points.map((p) => `${sc.x(p.x)},${sc.y(p.y)}`).join(" ")}
            fill="none"
            strokeWidth={1}
            className="stroke-gray-300"
          />
        ))}
        {nonEmpty.map((s) => (
          <g key={s.name}>
            <polyline
              points={s.points.map((p) => `${sc.x(p.x)},${sc.y(p.y)}`).join(" ")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ stroke: s.color }}
            />
            {s.points.map((p, i) => {
              const isLast = i === s.points.length - 1;
              return (
                <circle
                  key={`${p.x}-${i}`}
                  cx={sc.x(p.x)}
                  cy={sc.y(p.y)}
                  r={isLast ? 5 : 4}
                  style={{ fill: s.color }}
                  stroke="white"
                  strokeWidth={2}
                >
                  <title>{`${s.name}: ${p.y} ${unit}`}</title>
                </circle>
              );
            })}
            {/* Etiqueta directa del punto más reciente — destacado. */}
            {((last) =>
              last ? (
                <text
                  x={Math.min(sc.x(last.x) + 7, W - 4)}
                  y={sc.y(last.y) + 4}
                  className="fill-gray-700"
                  fontSize={11}
                  fontWeight={600}
                >
                  {last.y}
                </text>
              ) : null)(s.points[s.points.length - 1])}
          </g>
        ))}
      </svg>
      {nonEmpty.length >= 2 ? (
        <ul className="flex gap-3">
          {nonEmpty.map((s) => (
            <li key={s.name} className="flex items-center gap-1 text-sm text-gray-700">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

// Dos tonos del matiz de marca para el par sistólica/diastólica —
// par relacionado de UNA medida (regla del dumbbell: un matiz, dos
// pasos), con leyenda y etiquetas directas como canal secundario.
const SYSTOLIC_COLOR = "var(--brand-700)";
const DIASTOLIC_COLOR = "var(--brand-500)";
const SINGLE_COLOR = "var(--brand-700)";

export function ResultadosCharts({
  patientId,
  accessToken,
  ageYears,
  birthDate,
}: {
  patientId: string;
  accessToken: string;
  ageYears: number;
  birthDate: string;
}) {
  const tr = useT();
  const [rows, setRows] = useState<VitalsRow[] | null>(null);
  const [growth, setGrowth] = useState<GrowthCurve | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    apiFetch<unknown>(`/records/patients/${patientId}/vitals-history`, { accessToken }).then((data) => setRows(expectArray<VitalsRow>(data))).catch(setError);
    if (ageYears < 20) {
      apiFetch<GrowthCurve>(`/records/patients/${patientId}/growth-curves?measure=WEIGHT_FOR_AGE`, { accessToken })
        .then(setGrowth)
        .catch(() => setGrowth(null));
    }
  }, [patientId, accessToken, ageYears]);

  useEffect(load, [load]);

  if (error) return <ErrorState error={error} />;
  if (rows === null) return <LoadingState label={tr("clinico.graficas.cargando")} />;

  const t = (row: VitalsRow) => new Date(row.recordedAt).getTime();
  // Pediatría: mismo eje X (edad en meses) para la serie del paciente
  // y las curvas de percentilas — jamás dos escalas en una gráfica.
  const ageMonthsAt = (row: VitalsRow) =>
    Math.round(((new Date(row.recordedAt).getTime() - new Date(birthDate).getTime()) / (30.4375 * 24 * 60 * 60 * 1000)) * 10) / 10;
  const num = (v: string | number | null) => (v === null ? null : Number(v));
  const seriesOf = (pick: (r: VitalsRow) => number | null): { x: number; y: number }[] =>
    rows.flatMap((r) => {
      const y = pick(r);
      return y === null ? [] : [{ x: t(r), y }];
    });

  return (
    <div className="flex flex-col gap-3" data-testid="resultados-charts">
      <VitalLineChart
        title={tr("clinico.graficas.presionArterial")}
        unit="mmHg"
        band={{ min: 90, max: 129, label: tr("clinico.graficas.rangoSistolicaAdulto") }}
        series={[
          { name: tr("clinico.graficas.sistolica"), color: SYSTOLIC_COLOR, points: seriesOf((r) => r.bpSystolicMmHg) },
          { name: tr("clinico.graficas.diastolica"), color: DIASTOLIC_COLOR, points: seriesOf((r) => r.bpDiastolicMmHg) },
        ]}
      />
      {ageYears < 20 && growth ? (
        <VitalLineChart
          title={tr("clinico.graficas.pesoPorEdad")}
          unit="kg"
          series={[
            {
              name: tr("clinico.graficas.peso"),
              color: SINGLE_COLOR,
              points: rows.flatMap((r) => {
                const y = num(r.weightKg);
                return y === null ? [] : [{ x: ageMonthsAt(r), y }];
              }),
            },
          ]}
          referenceCurves={(["p3", "p15", "p50", "p85", "p97"] as const).map((p) => ({
            label: p.toUpperCase(),
            points: growth.curve.map((c) => ({ x: c.ageMonths, y: c[p] })),
          }))}
        />
      ) : (
        <VitalLineChart
          title={tr("clinico.graficas.peso")}
          unit="kg"
          series={[{ name: tr("clinico.graficas.peso"), color: SINGLE_COLOR, points: seriesOf((r) => num(r.weightKg)) }]}
        />
      )}
      <VitalLineChart
        title={tr("clinico.graficas.talla")}
        unit="cm"
        series={[{ name: tr("clinico.graficas.talla"), color: SINGLE_COLOR, points: seriesOf((r) => num(r.heightCm)) }]}
      />
      <VitalLineChart
        title={tr("clinico.graficas.imc")}
        unit="kg/m²"
        band={{ min: 18.5, max: 24.9, label: tr("clinico.graficas.imcNormalAdulto") }}
        series={[{ name: tr("clinico.graficas.imc"), color: SINGLE_COLOR, points: seriesOf((r) => num(r.bmi)) }]}
      />
    </div>
  );
}
