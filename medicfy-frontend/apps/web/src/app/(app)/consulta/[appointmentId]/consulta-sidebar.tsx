"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { formatDateMedium } from "@/lib/i18n/format";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import { AntecedentesSummary } from "@/components/clinical/antecedentes-editor";
import { ResumenObjetivo } from "@/components/clinical/resumen-objetivo";
import { LoadingState } from "@/components/ui/states";
import type { ActiveDiagnosis, PatientAllergy, PatientMedication, PatientHistoryItem, PatientPregnancy, PatientTimeline } from "@/lib/use-patient-clinical";
import { patientAgeYears, patientFullName, type AppointmentDetail } from "./types";

type SidebarPatient = AppointmentDetail["patient"];

// CLAUDE.md §6: "antecedentes, alergias y últimas 3 consultas visibles
// SIN SCROLL NI CLIC en 1280×800" — columna fija, siempre visible,
// nunca detrás de una pestaña/acordeón. Toma patientId/patient sueltos
// (no un AppointmentDetail completo) para poder reusarse tal cual en
// la consulta sin cita (/consulta/paciente/[patientId]), que no tiene
// ninguna cita de la que leer estos datos.
export function ConsultaSidebar({
  patientId,
  patient,
  allergies,
  medications,
  historyItems,
  timeline,
  pregnancy,
  activeDiagnoses,
  isLoadingClinical,
  encounterId,
  accessToken,
}: {
  patientId: string;
  patient: SidebarPatient;
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  historyItems: PatientHistoryItem[];
  timeline: PatientTimeline | null;
  pregnancy: PatientPregnancy | null;
  activeDiagnoses: ActiveDiagnosis[];
  isLoadingClinical: boolean;
  // Resumen objetivo (petición explícita del usuario, 2026-09-02):
  // opcionales porque ConsultaSidebar se re-usa también fuera de una
  // consulta activa.
  encounterId?: string;
  accessToken?: string;
}) {
  const { t, locale } = useI18n();
  const activeMedications = medications.filter((m) => m.status === "ACTIVE");
  const lastThreeEncounters = (timeline?.encounters ?? []).filter((e) => e.status === "SIGNED").slice(0, 3);

  return (
    <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh_-_2rem_-_var(--consulta-footer-height,0px))] lg:w-72 lg:shrink-0 lg:overflow-y-auto">
      {/* Prompt 13 — orden de prominencia fijo: 1) ALERGIAS ACTIVAS
          destacadas (el renglón que el médico lee antes de prescribir;
          "sin alergias registradas" explícito, nunca un hueco), 2)
          identidad, 3) diagnósticos vigentes con código, 4) embarazo,
          5) medicación crónica con conteo expandible. Nada comercial
          ni administrativo ocupa este espacio. */}
      <section aria-label={t("clinico.alergiasActivas")}>
        <AllergySummary allergies={allergies} compact />
      </section>

      <div>
        <Link href={`/pacientes/${patientId}`} className="text-base font-semibold text-brand-900 underline">
          {patientFullName(patient)}
        </Link>
        <p className="text-sm text-gray-500">
          {patient.medicfyId} · {t("pacientes.anios", { n: patientAgeYears(patient.birthDate) })} ·{" "}
          {patient.sexAtBirth === "F" ? t("pacientes.mujer") : t("pacientes.hombre")}
        </p>
      </div>

      {encounterId && accessToken ? <ResumenObjetivo encounterId={encounterId} accessToken={accessToken} /> : null}

      {isLoadingClinical ? (
        <LoadingState label={t("consulta.sidebar.cargandoContexto")} />
      ) : (
        <>
          <section data-testid="active-diagnoses">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("consulta.sidebar.diagnosticosVigentes")}</h2>
            {activeDiagnoses.length === 0 ? (
              <p className="text-sm text-gray-500">{t("consulta.sidebar.sinDiagnosticos")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activeDiagnoses.slice(0, 5).map((d) => (
                  <li key={`${d.icd10Code ?? d.description}`} className="text-sm text-gray-700">
                    {d.icd10Code ? <span className="font-mono text-gray-500">{d.icd10Code} · </span> : null}
                    {d.description}
                    {d.certainty === "SUSPECTED" ? <span className="text-gray-500">{t("consulta.sidebar.sospecha")}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pregnancy ? (
            <p
              data-testid="pregnancy-banner"
              className="rounded-md border border-brand-500 bg-brand-100 px-3 py-2 text-base font-medium text-brand-900"
            >
              {t("consulta.sidebar.embarazo", {
                semanas: pregnancy.gestationalAge.weeks,
                dias: pregnancy.gestationalAge.days,
                fpp: formatDateMedium(locale, pregnancy.eddDate),
              })}
              {pregnancy.eddMethod === "ULTRASONIDO" ? t("consulta.sidebar.usg") : t("consulta.sidebar.fum")}
            </p>
          ) : null}

          <section>
            {/* Prompt 13.5: conteo visible, detalle expandible — el
                elemento nativo <details> es teclado-accesible y táctil. */}
            <details>
              <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t("consulta.sidebar.medicacionCronica", { n: activeMedications.length })} <span aria-hidden="true">▾</span>
              </summary>
              {activeMedications.length === 0 ? (
                <p className="text-sm text-gray-500">{t("consulta.sidebar.ningunaRegistrada")}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {activeMedications.map((m) => (
                    <li key={m.id} className="text-sm text-gray-700">
                      {m.genericName} — {m.dose}, {m.frequency}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("consulta.sidebar.antecedentes")}</h2>
            <AntecedentesSummary historyItems={historyItems} />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("consulta.sidebar.ultimasConsultas")}</h2>
            {lastThreeEncounters.length === 0 ? (
              <p className="text-sm text-gray-500">{t("consulta.sidebar.sinConsultasPrevias")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {lastThreeEncounters.map((e) => (
                  <li key={e.id} className="text-sm text-gray-700">
                    {formatDateMedium(locale, e.signedAt ?? e.startedAt)} —{" "}
                    {e.encounterType === "FIRST_VISIT" ? t("consulta.sidebar.primeraVez") : t("consulta.sidebar.seguimiento")}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
