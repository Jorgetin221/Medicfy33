import Link from "next/link";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import { LoadingState } from "@/components/ui/states";
import type { PatientAllergy, PatientMedication, PatientTimeline } from "@/lib/use-patient-clinical";
import { patientAgeYears, patientFullName, type AppointmentDetail } from "./types";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

// CLAUDE.md §6: "antecedentes, alergias y últimas 3 consultas visibles
// SIN SCROLL NI CLIC en 1280×800" — columna fija, siempre visible,
// nunca detrás de una pestaña/acordeón.
export function ConsultaSidebar({
  appointment,
  allergies,
  medications,
  timeline,
  isLoadingClinical,
}: {
  appointment: AppointmentDetail;
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  timeline: PatientTimeline | null;
  isLoadingClinical: boolean;
}) {
  const activeMedications = medications.filter((m) => m.status === "ACTIVE");
  const lastThreeEncounters = (timeline?.encounters ?? []).filter((e) => e.status === "SIGNED").slice(0, 3);

  return (
    <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto">
      <div>
        <Link href={`/pacientes/${appointment.patientId}`} className="text-base font-semibold text-brand-900 underline">
          {patientFullName(appointment.patient)}
        </Link>
        <p className="text-sm text-gray-500">
          {appointment.patient.medicfyId} · {patientAgeYears(appointment.patient.birthDate)} años · {appointment.patient.sexAtBirth === "F" ? "Mujer" : "Hombre"}
        </p>
      </div>

      {isLoadingClinical ? (
        <LoadingState label="Cargando antecedentes…" />
      ) : (
        <>
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Alergias</h2>
            <AllergySummary allergies={allergies} compact />
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Medicamentos activos</h2>
            {activeMedications.length === 0 ? (
              <p className="text-sm text-gray-500">Ninguno registrado.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {activeMedications.map((m) => (
                  <li key={m.id} className="text-sm text-gray-700">
                    {m.genericName} — {m.dose}, {m.frequency}
                  </li>
                ))}
              </ul>
            )}
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
