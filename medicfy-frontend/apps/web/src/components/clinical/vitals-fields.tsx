"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ClinicalNoteSignInput } from "@medicfy/contracts";
import { FieldWrapper, TextInput } from "@/components/ui/field";

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

export function VitalsFields({ form }: { form: UseFormReturn<ClinicalNoteSignInput> }) {
  const errors = form.formState.errors.vitals;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {VITALS_FIELDS.map((field) => {
        const fieldError = errors?.[field.name];
        return (
          <FieldWrapper key={field.name} label={`${field.label} (${field.unit})`} htmlFor={`vitals.${field.name}`} error={fieldError?.message}>
            <TextInput
              id={`vitals.${field.name}`}
              type="number"
              inputMode="decimal"
              min={field.min}
              max={field.max}
              step={field.step}
              error={!!fieldError}
              {...form.register(`vitals.${field.name}` as `vitals.${VitalsFieldName}`, {
                setValueAs: (value: string) => (value === "" ? undefined : Number(value)),
              })}
            />
          </FieldWrapper>
        );
      })}
    </div>
  );
}
