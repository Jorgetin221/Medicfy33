"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { HEREDOFAMILIAR_LABELS, PERSONAL_NO_PATOLOGICO_LABELS, PERSONAL_PATOLOGICO_LABELS } from "@/components/clinical/antecedentes-editor";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "medium" }).format(new Date(iso));
}

const STATUS_LABEL: Record<PatientHistoryItem["status"], string> = {
  PRESENTE: "Presente",
  NEGADO: "Niega",
  DESCONOCIDO: "Desconoce",
  NO_INVESTIGADO: "No investigado",
};

const BLOCKS: { category: PatientHistoryItem["category"]; title: string; labels: Record<string, string> }[] = [
  { category: "HEREDOFAMILIAR", title: "Heredofamiliares", labels: HEREDOFAMILIAR_LABELS },
  { category: "PERSONAL_NO_PATOLOGICO", title: "No patológicos", labels: PERSONAL_NO_PATOLOGICO_LABELS },
  { category: "PERSONAL_PATOLOGICO", title: "Patológicos", labels: PERSONAL_PATOLOGICO_LABELS },
];

// Fase 5 · Prompt 39B: los mismos bloques de antecedentes de la Fase 2
// (antecedentes-editor.tsx), en modo solo lectura, colapsables, con la
// fecha de última actualización de CADA bloque — un dato que
// PatientHistoryItem.updatedAt ya trae, aquí solo se reduce al máximo
// por categoría. Ninguna acción de aquí escribe nada ni interrumpe la
// nota en curso.
export function HistoriaReadonly({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const [items, setItems] = useState<PatientHistoryItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<PatientHistoryItem[]>(`/records/patients/${patientId}/history`, { accessToken })
      .then(setItems)
      .catch(setError);
  }, [patientId, accessToken]);

  if (error) return <ErrorState error={error} />;
  if (!items) return <LoadingState label="Cargando historia…" />;

  return (
    <div className="flex flex-col gap-3">
      {BLOCKS.map(({ category, title, labels }) => {
        const blockItems = items.filter((i) => i.category === category);
        const positives = blockItems.filter((i) => i.status === "PRESENTE");
        const lastUpdated = blockItems.reduce<string | null>(
          (max, i) => (!max || i.updatedAt > max ? i.updatedAt : max),
          null
        );
        return (
          <CollapsibleCard
            key={category}
            title={title}
            subtitle={lastUpdated ? <span className="text-xs text-gray-500">Actualizado {formatMxDate(lastUpdated)}</span> : undefined}
          >
            {positives.length === 0 ? (
              <p className="text-sm text-gray-500">Sin antecedentes positivos.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {positives.map((i) => (
                  <li key={i.id} className="text-sm text-gray-900">
                    <span className="font-medium">{labels[i.subtype] ?? i.subtype}</span>
                    {i.familyRelationship !== "NONE" ? ` (${i.familyRelationship.toLowerCase()})` : ""}
                    {i.freeText ? ` — ${i.freeText}` : ""}
                    <span className="ml-1 text-gray-500">· {STATUS_LABEL[i.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
