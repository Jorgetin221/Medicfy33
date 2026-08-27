"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ClinicalNoteSignInput } from "@medicfy/contracts";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { vitalRangeStatus, VITAL_RANGE_LABEL, VITAL_RANGE_TILE_CLASS } from "@/lib/vital-ranges";

// Rangos de plausibilidad EXACTOS de vitalsSchema
// (@medicfy/contracts/clinical.schema.ts) — nunca inventados aquí,
// solo espejados para dar feedback inmediato en el campo (min/max
// nativos de <input>); Zod en el servidor es la validación real.
type VitalsFieldName =
  | "bpSystolic"
  | "bpDiastolic"
  | "heartRate"
  | "respiratoryRate"
  | "tempC"
  | "spo2"
  | "weightKg"
  | "heightCm"
  | "headCircumferenceCm"
  | "abdominalCircumferenceCm";

// M8-RN-011: perímetros solo tienen sentido de seguimiento en
// pediatría (percentiles OMS/CDC, igual que peso/talla) — se ocultan
// para adultos en vez de pedir un dato que nadie va a interpretar.
const PEDIATRIC_ONLY: Set<VitalsFieldName> = new Set(["headCircumferenceCm", "abdominalCircumferenceCm"]);
const PEDIATRIC_AGE_LIMIT = 12;

const VITALS_FIELDS: { name: VitalsFieldName; label: string; unit: string; min: number; max: number; step: string }[] = [
  { name: "bpSystolic", label: "TA sistólica", unit: "mmHg", min: 40, max: 300, step: "1" },
  { name: "bpDiastolic", label: "TA diastólica", unit: "mmHg", min: 20, max: 200, step: "1" },
  { name: "heartRate", label: "Frecuencia cardiaca", unit: "lpm", min: 20, max: 250, step: "1" },
  { name: "respiratoryRate", label: "Frecuencia respiratoria", unit: "rpm", min: 5, max: 60, step: "1" },
  { name: "tempC", label: "Temperatura", unit: "°C", min: 30, max: 43, step: "0.1" },
  { name: "spo2", label: "SpO2", unit: "%", min: 50, max: 100, step: "1" },
  { name: "weightKg", label: "Peso", unit: "kg", min: 0.5, max: 400, step: "0.1" },
  { name: "heightCm", label: "Talla", unit: "cm", min: 20, max: 250, step: "1" },
  // Prompt 26 (Fase 3): perímetros con unidad explícita.
  { name: "headCircumferenceCm", label: "Perímetro cefálico", unit: "cm", min: 20, max: 70, step: "0.1" },
  { name: "abdominalCircumferenceCm", label: "Perímetro abdominal", unit: "cm", min: 20, max: 250, step: "0.5" },
];

export function VitalsFields({ form, patientAgeYears }: { form: UseFormReturn<ClinicalNoteSignInput>; patientAgeYears: number | null }) {
  const errors = form.formState.errors.vitals;
  const watchedVitals = form.watch("vitals") ?? {};
  const isPediatric = patientAgeYears === null || patientAgeYears < PEDIATRIC_AGE_LIMIT;
  const visibleFields = VITALS_FIELDS.filter((field) => !PEDIATRIC_ONLY.has(field.name) || isPediatric);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {visibleFields.map((field) => {
        const fieldError = errors?.[field.name];
        const status = vitalRangeStatus(field.name, watchedVitals[field.name], patientAgeYears);
        const statusLabel = VITAL_RANGE_LABEL[status];
        return (
          <div key={field.name} className={`rounded-md border bg-white p-3 ${fieldError ? "border-danger-600" : VITAL_RANGE_TILE_CLASS[status]}`}>
            <FieldWrapper label={field.label} htmlFor={`vitals.${field.name}`} error={fieldError?.message}>
              <TextInput
                id={`vitals.${field.name}`}
                type="number"
                inputMode="decimal"
                min={field.min}
                max={field.max}
                step={field.step}
                error={!!fieldError}
                className="border-0 bg-transparent p-0 text-2xl font-semibold focus-visible:outline-none"
                {...form.register(`vitals.${field.name}` as `vitals.${VitalsFieldName}`, {
                  setValueAs: (value: string) => (value === "" ? undefined : Number(value)),
                })}
              />
              <span className="text-sm text-gray-500">
                {field.unit}
                {statusLabel ? ` · ${statusLabel}` : ""}
              </span>
            </FieldWrapper>
          </div>
        );
      })}
    </div>
  );
}
