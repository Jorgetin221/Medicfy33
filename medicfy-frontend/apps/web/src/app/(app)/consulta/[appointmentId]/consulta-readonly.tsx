"use client";

import Link from "next/link";
import { Aviso } from "@/components/ui/alert";
import { Card } from "@/components/ui/states";
import { AntecedentesSummary } from "@/components/clinical/antecedentes-editor";
import { VITAL_RANGE_LABEL_KEY, VITAL_RANGE_TILE_CLASS, type VitalRangeStatus } from "@/lib/vital-ranges";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { ENCOUNTER_TYPE_LABEL_KEY, type EncounterDetail } from "./types";
import { useI18n } from "@/lib/i18n/context";
import { formatDateTimeLong } from "@/lib/i18n/format";

// R1: una nota firmada nunca se edita — esta vista es la única forma
// de "abrir" una consulta ya firmada (p. ej. el médico da doble clic
// en "Iniciar", o vuelve después). Mostrar el formulario editable
// aquí sería mentir sobre qué se puede hacer con estos datos.
export function ConsultaReadonly({
  encounter,
  patientId,
  historyItems,
}: {
  encounter: EncounterDetail;
  patientId: string;
  historyItems: PatientHistoryItem[];
}) {
  const { t, locale } = useI18n();
  const note = encounter.notes[0];

  return (
    <div className="flex flex-col gap-4">
      <Aviso
        variant="info"
        title={
          encounter.signedAt
            ? t("clinico.firmadaEl", { fecha: formatDateTimeLong(locale, encounter.signedAt) })
            : t("clinico.firmada")
        }
      >
        {t("clinico.firmadaCuerpo")}
      </Aviso>

      <Card>
        <p className="text-sm font-medium text-gray-500">{t("consulta.lectura.antecedentesNota")}</p>
        <div className="mt-2">
          <AntecedentesSummary historyItems={historyItems} />
        </div>
      </Card>

      {!note ? (
        <p className="text-base text-gray-500">{t("consulta.lectura.sinContenido")}</p>
      ) : (
        <>
          <Card>
            <p className="text-sm font-medium text-gray-500">{t(ENCOUNTER_TYPE_LABEL_KEY[encounter.encounterType])}</p>
            <dl className="mt-3 flex flex-col gap-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">{t("consulta.campos.motivoConsulta")}</dt>
                <dd className="text-base text-gray-900">{note.chiefComplaint}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">{t("consulta.campos.padecimientoActual")}</dt>
                <dd className="whitespace-pre-wrap text-base text-gray-900">{note.currentIllness}</dd>
              </div>
              {note.physicalExam && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">{t("consulta.lectura.exploracionFisica")}</dt>
                  <dd className="whitespace-pre-wrap text-base text-gray-900">{note.physicalExam}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500">{t("consulta.campos.analisis")}</dt>
                <dd className="whitespace-pre-wrap text-base text-gray-900">{note.assessment}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">{t("consulta.campos.plan")}</dt>
                <dd className="whitespace-pre-wrap text-base text-gray-900">{note.plan}</dd>
              </div>
              {note.prognosis && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">{t("consulta.lectura.pronostico")}</dt>
                  <dd className="text-base text-gray-900">{note.prognosis}</dd>
                </div>
              )}
            </dl>
          </Card>

          {note.labResults.length > 0 && (
            <Card>
              <p className="text-sm font-medium text-gray-500">{t("clinico.laboratorio.titulo")}</p>
              {note.labResults.some((r) => r.source === "OCR_REVIEWED") && (
                <p className="mt-1 text-sm text-gray-500">
                  {t("clinico.laboratorio.verificadoPorMedico")}
                </p>
              )}
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-base">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-sm text-gray-500">
                      <th className="p-2">{t("clinico.laboratorio.analito")}</th>
                      <th className="p-2">{t("clinico.laboratorio.valor")}</th>
                      <th className="p-2">{t("clinico.laboratorio.rangoReferencia")}</th>
                      <th className="p-2">{t("clinico.laboratorio.estado")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {note.labResults.map((r) => {
                      const status = r.status.toLowerCase() as VitalRangeStatus;
                      const labelKey = VITAL_RANGE_LABEL_KEY[status];
                      return (
                        <tr key={r.id} className="border-b border-gray-200">
                          <td className="p-2 text-gray-900">{r.analyteName}</td>
                          <td className={`p-2 font-medium ${status === "high" || status === "low" ? "text-warn-600" : status === "critical" ? "text-critical-600" : "text-gray-900"}`}>
                            {r.value} {r.unit}
                          </td>
                          <td className="p-2 text-gray-500">
                            {r.referenceMin !== null && r.referenceMax !== null ? `${r.referenceMin} – ${r.referenceMax}` : t("clinico.rango.sinRango")}
                          </td>
                          <td className="p-2">
                            <span className={`inline-flex items-center rounded-md border px-2 py-1 text-base font-medium ${VITAL_RANGE_TILE_CLASS[status]}`}>
                              {labelKey ? t(labelKey) : t("clinico.rango.normal")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <p className="text-sm font-medium text-gray-500">{t("consulta.campos.diagnosticos")}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {encounter.diagnoses.map((d) => (
                <li key={d.id} className="text-base text-gray-900">
                  {d.icd10Code ? (
                    <>{d.icd10Code} — {d.description}</>
                  ) : (
                    <>
                      <span className="text-warn-600">{t("pacientes.notas.sinCodigoCie10")}</span> — {d.description}
                      <span className="block text-sm text-gray-500">{t("pacientes.notas.razon", { razon: d.codeAbsentReason ?? "" })}</span>
                    </>
                  )}{" "}
                  ({d.diagnosisType === "PRINCIPAL" ? t("clinico.diagnostico.principal") : t("clinico.diagnostico.secundario")},{" "}
                  {d.certainty === "CONFIRMED" ? t("clinico.diagnostico.confirmado") : t("clinico.diagnostico.sospechado")})
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Link href={`/pacientes/${patientId}`} className="text-base font-medium text-brand-700 underline">
        {t("clinico.verExpediente")}
      </Link>
    </div>
  );
}
