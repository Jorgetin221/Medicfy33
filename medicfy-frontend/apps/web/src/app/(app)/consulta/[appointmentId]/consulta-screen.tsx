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
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { ConsultaReadonly } from "./consulta-readonly";
import { EmisionDocumentos } from "@/components/clinical/emision-documentos";
import { patientFullName, type AppointmentDetail, type EncounterDetail } from "./types";

type Phase = "loading" | "ready" | "readonly" | "blocked" | "abandoned" | "error";

// En minúscula a propósito: se inserta a mitad de frase ("Esta cita
// está cancelada por el médico y…"), no encabeza nada.
const APPOINTMENT_STATUS_LABEL_KEY: Record<AppointmentDetail["status"], MessageKey> = {
  PENDING_PAYMENT: "consulta.estadoCita.PENDING_PAYMENT",
  SCHEDULED: "consulta.estadoCita.SCHEDULED",
  CONFIRMED: "consulta.estadoCita.CONFIRMED",
  IN_PROGRESS: "consulta.estadoCita.IN_PROGRESS",
  COMPLETED: "consulta.estadoCita.COMPLETED",
  CANCELLED_BY_PATIENT: "consulta.estadoCita.CANCELLED_BY_PATIENT",
  CANCELLED_BY_DOCTOR: "consulta.estadoCita.CANCELLED_BY_DOCTOR",
  NO_SHOW: "consulta.estadoCita.NO_SHOW",
};

export function ConsultaScreen({ appointmentId, accessToken }: { appointmentId: string; accessToken: string }) {
  const router = useRouter();
  const t = useT();
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
        <LoadingState label={t("consulta.preparando")} />
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
            {t("consulta.bloqueada.prefijo")}
            <strong>{t(APPOINTMENT_STATUS_LABEL_KEY[appointment.status])}</strong>
            {t("consulta.bloqueada.sufijo")}
          </p>
          {appointment.completedWithoutNoteReason && (
            <p className="mt-2 text-sm text-gray-500">{t("consulta.bloqueada.sinNota", { motivo: appointment.completedWithoutNoteReason })}</p>
          )}
          <Button type="button" variant="secondary" className="mt-4" onClick={() => router.push("/agenda")}>
            {t("consulta.volverAgenda")}
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
            {t("consulta.abandonada.prefijo")}
            <strong>{patientFullName(appointment.patient)}</strong>
            {t("consulta.abandonada.sufijo")}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {t("consulta.abandonada.ayuda")}
          </p>
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => router.push("/agenda")}>
              {t("consulta.volverAgenda")}
            </Button>
            <Button type="button" onClick={() => router.push(`/pacientes/${appointment.patientId}`)}>
              {t("consulta.irAlExpediente")}
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
    // El ancho sobrante pertenece a la nota. Zona 1 (w-72) y Zona 3 (w-96)
    // muestran contenido de tamaño conocido y no ganan nada con más espacio;
    // la nota es el único contenido productivo de la pantalla. Antes el tope
    // era `max-w-6xl` (1152 px) —un ancho de columna de lectura, pensado para
    // artículos— y con las dos laterales fijas la aritmética dejaba la nota en
    // 384 px: más angosta que el panel de consulta de al lado, e idéntica en
    // un monitor de 1440 y en uno de 1920. El tope holgado evita el extremo
    // opuesto: a 2200 px de main la nota queda en ~1400, todavía legible.
    <main className="mx-auto flex max-w-[2200px] flex-col gap-6 p-6 lg:flex-row">
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
        encounterId={encounter.id}
        accessToken={accessToken}
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
