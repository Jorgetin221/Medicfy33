import Link from "next/link";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import { AntecedentesSummary } from "@/components/clinical/antecedentes-editor";
import { LoadingState } from "@/components/ui/states";
import type { ActiveDiagnosis, PatientAllergy, PatientMedication, PatientHistoryItem, PatientPregnancy, PatientTimeline } from "@/lib/use-patient-clinical";
import { patientAgeYears, patientFullName, type AppointmentDetail } from "./types";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

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
}) {
  const activeMedications = medications.filter((m) => m.status === "ACTIVE");
  const lastThreeEncounters = (timeline?.encounters ?? []).filter((e) => e.status === "SIGNED").slice(0, 3);

  return (
    <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto">
      {/* Prompt 13 — orden de prominencia fijo: 1) ALERGIAS ACTIVAS
          destacadas (el renglón que el médico lee antes de prescribir;
          "sin alergias registradas" explícito, nunca un hueco), 2)
          identidad, 3) diagnósticos vigentes con código, 4) embarazo,
          5) medicación crónica con conteo expandible. Nada comercial
          ni administrativo ocupa este espacio. */}
      <section aria-label="Alergias activas">
        <AllergySummary allergies={allergies} compact />
      </section>

      <div>
        <Link href={`/pacientes/${patientId}`} className="text-base font-semibold text-brand-900 underline">
          {patientFullName(patient)}
        </Link>
        <p className="text-sm text-gray-500">
          {patient.medicfyId} · {patientAgeYears(patient.birthDate)} años · {patient.sexAtBirth === "F" ? "Mujer" : "Hombre"}
        </p>
      </div>

      {isLoadingClinical ? (
        <LoadingState label="Cargando contexto clínico…" />
      ) : (
        <>
          <section data-testid="active-diagnoses">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Diagnósticos vigentes</h2>
            {activeDiagnoses.length === 0 ? (
              <p className="text-sm text-gray-500">Sin diagnósticos de consultas firmadas.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activeDiagnoses.slice(0, 5).map((d) => (
                  <li key={`${d.icd10Code ?? d.description}`} className="text-sm text-gray-700">
                    {d.icd10Code ? <span className="font-mono text-gray-500">{d.icd10Code} · </span> : null}
                    {d.description}
                    {d.certainty === "SUSPECTED" ? <span className="text-gray-500"> (sospecha)</span> : null}
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
              🤰 Embarazo: {pregnancy.gestationalAge.weeks}.{pregnancy.gestationalAge.days} SDG · FPP{" "}
              {formatMxDate(pregnancy.eddDate)}
              {pregnancy.eddMethod === "ULTRASONIDO" ? " (USG)" : " (FUM)"}
            </p>
          ) : null}

          <section>
            {/* Prompt 13.5: conteo visible, detalle expandible — el
                elemento nativo <details> es teclado-accesible y táctil. */}
            <details>
              <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold uppercase tracking-wide text-gray-500">
                Medicación crónica ({activeMedications.length}) <span aria-hidden="true">▾</span>
              </summary>
              {activeMedications.length === 0 ? (
                <p className="text-sm text-gray-500">Ninguna registrada.</p>
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
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Antecedentes</h2>
            <AntecedentesSummary historyItems={historyItems} />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Últimas consultas</h2>
            {lastThreeEncounters.length === 0 ? (
              <p className="text-sm text-gray-500">Sin consultas previas firmadas.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {lastThreeEncounters.map((e) => (
                  <li key={e.id} className="text-sm text-gray-700">
                    {formatMxDate(e.signedAt ?? e.startedAt)} — {e.encounterType === "FIRST_VISIT" ? "Primera vez" : "Seguimiento"}
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
