"use client";

import { useEffect, useState } from "react";
import { apiFetch, expectArray } from "@/lib/api-client";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { HEREDOFAMILIAR_LABEL_KEYS, PERSONAL_NO_PATOLOGICO_LABEL_KEYS, PERSONAL_PATOLOGICO_LABEL_KEYS } from "@/components/clinical/antecedentes-editor";
import { useI18n, type TranslateFn } from "@/lib/i18n/context";
import { formatDateMedium } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";

const STATUS_LABEL_KEY: Record<PatientHistoryItem["status"], MessageKey> = {
  PRESENTE: "clinico.antecedentes.estado.PRESENTE",
  NEGADO: "clinico.antecedentes.estado.NEGADO",
  DESCONOCIDO: "clinico.antecedentes.estado.DESCONOCIDO",
  NO_INVESTIGADO: "clinico.antecedentes.estado.NO_INVESTIGADO",
};

const BLOCKS: { category: PatientHistoryItem["category"]; titleKey: MessageKey; labelKeys: Record<string, MessageKey> }[] = [
  { category: "HEREDOFAMILIAR", titleKey: "clinico.antecedentes.bloques.heredofamiliares", labelKeys: HEREDOFAMILIAR_LABEL_KEYS },
  { category: "PERSONAL_NO_PATOLOGICO", titleKey: "clinico.antecedentes.bloques.noPatologicos", labelKeys: PERSONAL_NO_PATOLOGICO_LABEL_KEYS },
  { category: "PERSONAL_PATOLOGICO", titleKey: "clinico.antecedentes.bloques.patologicos", labelKeys: PERSONAL_PATOLOGICO_LABEL_KEYS },
];

// Fase 5 · Prompt 39B: los mismos bloques de antecedentes de la Fase 2
// (antecedentes-editor.tsx), en modo solo lectura, colapsables, con la
// fecha de última actualización de CADA bloque — un dato que
// PatientHistoryItem.updatedAt ya trae, aquí solo se reduce al máximo
// por categoría. Ninguna acción de aquí escribe nada ni interrumpe la
// nota en curso.
// Un subtype que el servidor mande y no esté en el catálogo del
// cliente se muestra tal cual, en vez de dejar un hueco en el
// expediente.
function subtypeLabel(t: TranslateFn, keys: Record<string, MessageKey>, subtype: string): string {
  const key = keys[subtype];
  return key ? t(key) : subtype;
}

export function HistoriaReadonly({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<PatientHistoryItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<unknown>(`/records/patients/${patientId}/history`, { accessToken })
      .then((data) => setItems(expectArray<PatientHistoryItem>(data)))
      .catch(setError);
  }, [patientId, accessToken]);

  if (error) return <ErrorState error={error} />;
  if (!items) return <LoadingState label={t("clinico.cargando.historia")} />;

  return (
    <div className="flex flex-col gap-3">
      {BLOCKS.map(({ category, titleKey, labelKeys }) => {
        const blockItems = items.filter((i) => i.category === category);
        const positives = blockItems.filter((i) => i.status === "PRESENTE");
        const lastUpdated = blockItems.reduce<string | null>(
          (max, i) => (!max || i.updatedAt > max ? i.updatedAt : max),
          null
        );
        return (
          <CollapsibleCard
            key={category}
            title={t(titleKey)}
            subtitle={
              lastUpdated ? (
                <span className="text-xs text-gray-500">
                  {t("clinico.antecedentes.actualizado", { fecha: formatDateMedium(locale, lastUpdated) })}
                </span>
              ) : undefined
            }
          >
            {positives.length === 0 ? (
              <p className="text-sm text-gray-500">{t("clinico.antecedentes.sinPositivos")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {positives.map((i) => (
                  <li key={i.id} className="text-sm text-gray-900">
                    <span className="font-medium">{subtypeLabel(t, labelKeys, i.subtype)}</span>
                    {i.familyRelationship !== "NONE" ? ` (${i.familyRelationship.toLowerCase()})` : ""}
                    {i.freeText ? ` — ${i.freeText}` : ""}
                    <span className="ml-1 text-gray-500">· {t(STATUS_LABEL_KEY[i.status])}</span>
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
