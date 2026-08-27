"use client";

import { useMemo } from "react";
import { SelectInput, FieldWrapper } from "@/components/ui/field";
import { useSpecialtyScales, type SpecialtyFieldSchemaOption } from "@/lib/use-specialty-scales";

interface ScalePreview {
  value: number;
  interpretation?: string;
}

// Vista previa, nunca autoritativa — sign() recalcula todo en el
// servidor sobre los mismos valores crudos (SpecialtyScaleService),
// exactamente igual que el IMC. Duplicar esta suma aquí es más simple
// y más honesto que enhebrar la respuesta del autoguardado a través
// de useEncounterAutosave solo para esto.
function computePreview(computed: SpecialtyFieldSchemaOption, values: Record<string, number>): ScalePreview | null {
  const componentKeys = (computed.computedFormula ?? "").split(" ").filter(Boolean);
  if (componentKeys.length === 0 || componentKeys.some((key) => values[key] === undefined)) {
    return null;
  }
  const total = componentKeys.reduce((sum, key) => sum + (values[key] ?? 0), 0);
  const buckets = Array.isArray(computed.options) ? computed.options : [];
  const bucket = buckets.find(
    (opt): opt is { min: number; max: number; label: string } => "min" in opt && "max" in opt && total >= opt.min && total <= opt.max
  );
  return bucket ? { value: total, interpretation: bucket.label } : { value: total };
}

// DOC-06, bloque objetivo — junto a "Signos vitales". Agrupa por
// campo COMPUTED: cada uno declara sus componentes en computedFormula
// (fieldKeys separados por espacio), así que la agrupación sale de
// esa relación en vez de adivinar por prefijo de nombre — generaliza
// sola a cualquier escala futura sembrada con el mismo patrón.
export function EscalasSection({
  accessToken,
  values,
  onChange,
  patientAgeYears,
}: {
  accessToken: string;
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  patientAgeYears: number | null;
}) {
  const { fields, isLoading, error } = useSpecialtyScales(accessToken, "ESCALAS");

  const groups = useMemo(() => {
    const computedFields = fields.filter((f) => f.inputType === "COMPUTED");
    // Apgar es un instrumento de valoración neonatal — solo tiene
    // sentido capturarlo en menores de 2 años. patientAgeYears===null
    // (edad desconocida) lo deja visible para no ocultar el campo por
    // un dato faltante.
    return computedFields
      .filter((computed) => !computed.fieldKey.startsWith("apgar") || patientAgeYears === null || patientAgeYears < 2)
      .map((computed) => {
        const componentKeys = (computed.computedFormula ?? "").split(" ").filter(Boolean);
        const components = fields.filter((f) => componentKeys.includes(f.fieldKey)).sort((a, b) => a.displayOrder - b.displayOrder);
        return { computed, components };
      });
  }, [fields, patientAgeYears]);

  function setFieldValue(fieldKey: string, raw: string) {
    const rest = Object.fromEntries(Object.entries(values).filter(([key]) => key !== fieldKey));
    onChange(raw === "" ? rest : { ...rest, [fieldKey]: Number(raw) });
  }

  // Silencioso mientras carga o si falla: son un complemento opcional
  // de la nota, no un requisito — un error aquí no debe bloquear ni
  // ensuciar la captura de la consulta en curso.
  if (isLoading || error || groups.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-gray-900">Escalas</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(({ computed, components }) => {
          const preview = computePreview(computed, values);
          return (
            <div key={computed.fieldKey} className="rounded-md border border-gray-300 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">{computed.label}</p>
              <div className="flex flex-col gap-3">
                {components.map((field) => {
                  const fieldOptions = Array.isArray(field.options) ? field.options : [];
                  return (
                    <FieldWrapper key={field.fieldKey} label={field.label} htmlFor={field.fieldKey}>
                      <SelectInput
                        id={field.fieldKey}
                        value={values[field.fieldKey] ?? ""}
                        onChange={(e) => setFieldValue(field.fieldKey, e.target.value)}
                      >
                        <option value="">Sin capturar</option>
                        {fieldOptions.map((opt) =>
                          "value" in opt ? (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ) : null
                        )}
                      </SelectInput>
                    </FieldWrapper>
                  );
                })}
              </div>
              {preview ? (
                <p className="mt-3 text-base font-medium text-brand-900">
                  {computed.label}: {preview.value}
                  {preview.interpretation ? ` — ${preview.interpretation}` : ""}
                </p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">Completa todos los campos para ver el total.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
