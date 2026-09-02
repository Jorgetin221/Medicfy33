"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { tokenSubject } from "@/lib/jwt-claims";
import { usePatientClinical } from "@/lib/use-patient-clinical";
import { LoadingState, ErrorState, Card } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ConsultaSidebar } from "./consulta-sidebar";
import { ConsultaZona3 } from "./consulta-zona3";
import { ConsultaForm } from "./consulta-form";
import { ConsultaReadonly } from "./consulta-readonly";
import { EmisionDocumentos } from "@/components/clinical/emision-documentos";
import { patientFullName, type AppointmentDetail, type EncounterDetail } from "./types";

type Phase = "loading" | "ready" | "readonly" | "blocked" | "abandoned" | "error";

const APPOINTMENT_STATUS_LABEL: Record<AppointmentDetail["status"], string> = {
  PENDING_PAYMENT: "pago pendiente",
  SCHEDULED: "agendada",
  CONFIRMED: "confirmada",
  IN_PROGRESS: "en curso",
  COMPLETED: "completada",
  CANCELLED_BY_PATIENT: "cancelada por el paciente",
  CANCELLED_BY_DOCTOR: "cancelada por el médico",
  NO_SHOW: "no se presentó",
};

export function ConsultaScreen({ appointmentId, accessToken }: { appointmentId: string; accessToken: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<unknown>(null);
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  // Fase 4 / prompt 32: al firmar, la vista pasa a solo-lectura CON el
  // bloque de emisión (receta, órdenes, indicaciones) y el botón de
  // "Siguiente paciente" (prompt 16 — encadenar).
  const [justSigned, setJustSigned] = useState(false);
  // React StrictMode (desarrollo) monta/desmonta/remonta este efecto
  // una vez para detectar impurezas — sin este guard, bootstrap()
  // corre dos veces en paralelo y ambas llamadas pueden intentar
  // crear el encounter de esta cita antes de que la primera termine.
  // El backend ya lo tolera (ver ClinicalEncounterService.create),
  // pero evitar la carrera aquí es más barato que confiar solo en eso.
  const isBootstrapping = useRef(false);

  const bootstrap = useCallback(async () => {
    if (isBootstrapping.current) return;
    isBootstrapping.current = true;
    setPhase("loading");
    setError(null);
    try {
      let appt = await apiFetch<AppointmentDetail>(`/appointments/${appointmentId}`, { accessToken });

      if ((appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && !appt.encounter) {
        try {
          await apiFetch(`/appointments/${appointmentId}/start`, { method: "POST", accessToken });
          appt = await apiFetch<AppointmentDetail>(`/appointments/${appointmentId}`, { accessToken });
        } catch {
          // Si ya no se puede iniciar (carrera con otra pestaña, p. ej.),
          // seguimos con lo que acabamos de leer — la lógica de abajo
          // decide qué mostrar según el estado real.
        }
      }
      setAppointment(appt);

      if (appt.encounter) {
        const encounterDetail = await apiFetch<EncounterDetail>(`/records/encounters/${appt.encounter.id}`, { accessToken });
        setEncounter(encounterDetail);
        setPhase(encounterDetail.status === "SIGNED" ? "readonly" : "ready");
        return;
      }

      if (appt.status !== "IN_PROGRESS") {
        setPhase("blocked");
        return;
      }

      const priorEncounters = await apiFetch<{ status: string }[]>(`/records/patients/${appt.patientId}/encounters`, { accessToken });
      const encounterType = priorEncounters.some((e) => e.status === "SIGNED") ? "FOLLOW_UP" : "FIRST_VISIT";
      const created = await apiFetch<{ id: string }>(`/records/patients/${appt.patientId}/encounters`, {
        method: "POST",
        accessToken,
        body: { patientId: appt.patientId, appointmentId, encounterType },
      });
      const encounterDetail = await apiFetch<EncounterDetail>(`/records/encounters/${created.id}`, { accessToken });
      setEncounter(encounterDetail);
      setPhase("ready");
    } catch (err) {
      setError(err);
      setPhase("error");
    } finally {
      isBootstrapping.current = false;
    }
  }, [appointmentId, accessToken]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const {
    allergies,
    medications,
    historyItems,
    timeline,
    pregnancy,
    activeDiagnoses,
    isLoading: isLoadingClinical,
    reload: reloadClinical,
  } = usePatientClinical(appointment?.patientId ?? null, accessToken);

  if (phase === "loading") {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <LoadingState label="Preparando la consulta…" />
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ErrorState error={error} onRetry={() => void bootstrap()} />
      </main>
    );
  }

  if (phase === "blocked" && appointment) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card>
          <p className="text-base text-gray-900">
            Esta cita está <strong>{APPOINTMENT_STATUS_LABEL[appointment.status]}</strong> y no se puede iniciar una consulta desde aquí.
          </p>
          {appointment.completedWithoutNoteReason && (
            <p className="mt-2 text-sm text-gray-500">Se completó sin nota clínica: &quot;{appointment.completedWithoutNoteReason}&quot;</p>
          )}
          <Button type="button" variant="secondary" className="mt-4" onClick={() => router.push("/agenda")}>
            Volver a la agenda
          </Button>
        </Card>
      </main>
    );
  }

  if (phase === "abandoned" && appointment) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card>
          <p className="text-base text-gray-900">
            Este borrador de <strong>{patientFullName(appointment.patient)}</strong> lleva más de 72 horas sin firmarse y se marcó como
            abandonado — ya no se puede continuar editando (M8-RN-003).
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Documenta esta consulta como una nota nueva desde el expediente del paciente. La cita queda como estaba.
          </p>
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => router.push("/agenda")}>
              Volver a la agenda
            </Button>
            <Button type="button" onClick={() => router.push(`/pacientes/${appointment.patientId}`)}>
              Ir al expediente
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (!appointment || !encounter) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }

  // Fase 4 / prompt 32: la firma NO saca al médico de la pantalla —
  // primero emite los documentos desde la nota firmada; "Siguiente
  // paciente" encadena cuando él decide (prompt 16).
  async function handleSigned() {
    if (!appointment?.encounter && !encounter) return;
    try {
      const encounterDetail = await apiFetch<EncounterDetail>(`/records/encounters/${encounter?.id}`, { accessToken });
      setEncounter(encounterDetail);
    } catch {
      // si la relectura falla, la vista readonly usa lo que ya hay
    }
    setJustSigned(true);
    setPhase("readonly");
  }

  // Prompt 16 — encadenar consultas: salta directo a la siguiente cita
  // CONFIRMADA del día del mismo médico (la autorización R4 se revalúa
  // al abrir la siguiente: /start vuelve a verificar al médico
  // asignado); sin siguiente, regresa a la agenda.
  async function goToNextPatient() {
    if (!appointment) {
      router.push("/agenda");
      return;
    }
    try {
      const todays = await apiFetch<{ id: string; startsAt: string; status: string }[]>("/appointments", { accessToken: accessToken ?? undefined });
      const next = todays
        .filter((a) => a.id !== appointmentId && a.status === "CONFIRMED" && new Date(a.startsAt) >= new Date(appointment.startsAt))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
      router.push(next ? `/consulta/${next.id}` : "/agenda");
    } catch {
      router.push("/agenda");
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row">
      <ConsultaSidebar
        patientId={appointment.patientId}
        patient={appointment.patient}
        allergies={allergies}
        medications={medications}
        historyItems={historyItems}
        timeline={timeline}
        pregnancy={pregnancy}
        activeDiagnoses={activeDiagnoses}
        isLoadingClinical={isLoadingClinical}
      />
      {phase === "readonly" ? (
        <div className="flex flex-1 flex-col gap-4">
          <EmisionDocumentos
            accessToken={accessToken}
            encounterId={encounter.id}
            patientId={appointment.patientId}
            defaultDiagnosis={encounter.diagnoses.find((d) => d.diagnosisType === "PRINCIPAL")?.description ?? ""}
            hasPatientInstructions={Boolean(encounter.notes[0]?.patientInstructions)}
            {...(justSigned ? { onNextPatient: () => void goToNextPatient() } : {})}
          />
          <ConsultaReadonly encounter={encounter} patientId={appointment.patientId} historyItems={historyItems} />
        </div>
      ) : (
        <ConsultaForm
          accessToken={accessToken}
          encounter={encounter}
          historyItems={historyItems}
          patientBirthDate={appointment.patient.birthDate}
          onHistoryChanged={reloadClinical}
          onSigned={() => void handleSigned()}
          onAbandoned={() => setPhase("abandoned")}
        />
      )}
      <ConsultaZona3
        doctorKey={tokenSubject(accessToken)}
        patientId={appointment.patientId}
        accessToken={accessToken}
        birthDate={appointment.patient.birthDate}
        encounterId={encounter.id}
      />
    </main>
  );
}
