"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TimelineEncounter } from "@/lib/use-patient-clinical";
import { Card, EmptyState, LoadingState, ErrorState } from "@/components/ui/states";
import { ENCOUNTER_TYPE_LABEL_KEY, type EncounterDetail } from "../../consulta/[appointmentId]/types";
import { useI18n, useT } from "@/lib/i18n/context";
import { formatDateTimeLong } from "@/lib/i18n/format";

export function TabNotas({ accessToken, encounters }: { accessToken: string; encounters: TimelineEncounter[] }) {
  const { t, locale } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (encounters.length === 0) {
    return <EmptyState title={t("pacientes.notas.sinConsultas")} description={t("pacientes.notas.sinConsultasAyuda")} />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {encounters.map((e) => (
        <li key={e.id}>
          <Card>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-base font-medium text-gray-900">{t(ENCOUNTER_TYPE_LABEL_KEY[e.encounterType])}</span>
                <span className="block text-sm text-gray-500">
                  {formatDateTimeLong(locale, e.signedAt ?? e.startedAt)} · {e.status === "SIGNED" ? t("pacientes.notas.firmada") : t("pacientes.notas.borrador")}
                </span>
              </span>
              <span aria-hidden="true" className="text-gray-500">
                {expandedId === e.id ? "▲" : "▼"}
              </span>
            </button>
            {expandedId === e.id && <EncounterDetailInline accessToken={accessToken} encounterId={e.id} />}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function EncounterDetailInline({ accessToken, encounterId }: { accessToken: string; encounterId: string }) {
  const t = useT();
  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<EncounterDetail>(`/records/encounters/${encounterId}`, { accessToken })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [encounterId, accessToken]);

  if (error) return <ErrorState error={error} />;
  if (!detail) return <LoadingState />;
  const note = detail.notes[0];

  return (
    <dl className="mt-3 flex flex-col gap-3 border-t border-gray-300 pt-3">
      {note ? (
        <>
          <div>
            <dt className="text-sm font-medium text-gray-500">{t("pacientes.notas.motivoConsulta")}</dt>
            <dd className="text-base text-gray-900">{note.chiefComplaint}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">{t("pacientes.notas.padecimientoActual")}</dt>
            <dd className="whitespace-pre-wrap text-base text-gray-900">{note.currentIllness}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">{t("pacientes.notas.analisis")}</dt>
            <dd className="whitespace-pre-wrap text-base text-gray-900">{note.assessment}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">{t("pacientes.notas.plan")}</dt>
            <dd className="whitespace-pre-wrap text-base text-gray-900">{note.plan}</dd>
          </div>
        </>
      ) : (
        <p className="text-base text-gray-500">{t("pacientes.notas.borradorSinFirmar")}</p>
      )}
      {detail.diagnoses.length > 0 && (
        <div>
          <dt className="text-sm font-medium text-gray-500">{t("pacientes.notas.diagnosticos")}</dt>
          <dd>
            <ul className="mt-1 flex flex-col gap-0.5">
              {detail.diagnoses.map((d) => (
                <li key={d.id} className="text-base text-gray-900">
                  {d.icd10Code ? (
                    <>{d.icd10Code} — {d.description}</>
                  ) : (
                    <>
                      <span className="text-warn-600">{t("pacientes.notas.sinCodigoCie10")}</span> — {d.description}
                      <span className="block text-sm text-gray-500">{t("pacientes.notas.razon", { razon: d.codeAbsentReason ?? "" })}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}
