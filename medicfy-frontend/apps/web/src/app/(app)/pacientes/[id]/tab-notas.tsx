"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TimelineEncounter } from "@/lib/use-patient-clinical";
import { Card, EmptyState, LoadingState, ErrorState } from "@/components/ui/states";
import { ENCOUNTER_TYPE_LABEL, type EncounterDetail } from "../../consulta/[appointmentId]/types";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}

export function TabNotas({ accessToken, encounters }: { accessToken: string; encounters: TimelineEncounter[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (encounters.length === 0) {
    return <EmptyState title="Sin consultas registradas" description="Las notas de consulta aparecerán aquí conforme se firmen." />;
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
                <span className="block text-base font-medium text-gray-900">{ENCOUNTER_TYPE_LABEL[e.encounterType]}</span>
                <span className="block text-sm text-gray-500">
                  {formatMxDateTime(e.signedAt ?? e.startedAt)} · {e.status === "SIGNED" ? "Firmada" : "Borrador"}
                </span>
              </span>
              <span aria-hidden="true" className="text-gray-400">
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
            <dt className="text-sm font-medium text-gray-500">Motivo de consulta</dt>
            <dd className="text-base text-gray-900">{note.chiefComplaint}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Padecimiento actual</dt>
            <dd className="whitespace-pre-wrap text-base text-gray-900">{note.currentIllness}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Análisis</dt>
            <dd className="whitespace-pre-wrap text-base text-gray-900">{note.assessment}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Plan</dt>
            <dd className="whitespace-pre-wrap text-base text-gray-900">{note.plan}</dd>
          </div>
        </>
      ) : (
        <p className="text-base text-gray-500">Borrador sin nota firmada todavía.</p>
      )}
      {detail.diagnoses.length > 0 && (
        <div>
          <dt className="text-sm font-medium text-gray-500">Diagnósticos</dt>
          <dd>
            <ul className="mt-1 flex flex-col gap-0.5">
              {detail.diagnoses.map((d) => (
                <li key={d.id} className="text-base text-gray-900">
                  {d.icd10Code ? (
                    <>{d.icd10Code} — {d.description}</>
                  ) : (
                    <>
                      <span className="text-warn-700">Sin código CIE-10</span> — {d.description}
                      <span className="block text-sm text-gray-500">Razón: {d.codeAbsentReason}</span>
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
