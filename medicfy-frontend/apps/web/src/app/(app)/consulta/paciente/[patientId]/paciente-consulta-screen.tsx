"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { usePatientClinical } from "@/lib/use-patient-clinical";
import { LoadingState, ErrorState, Card } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { ConsultaSidebar } from "../../[appointmentId]/consulta-sidebar";
import { ConsultaForm } from "../../[appointmentId]/consulta-form";
import { ConsultaReadonly } from "../../[appointmentId]/consulta-readonly";
import { patientFullName, type EncounterDetail } from "../../[appointmentId]/types";

type Phase = "loading" | "ready" | "readonly" | "abandoned" | "error";

interface EncounterListItem {
  id: string;
  status: "DRAFT" | "SIGNED";
  appointmentId: string | null;
}

// Consulta sin cita — el médico puede documentar a un paciente que ya
// tiene expediente sin haber reservado una cita primero (pedido
// explícito del usuario). El backend ya lo soportaba: appointmentId es
// opcional en ClinicalEncounter y signAndCompleteAppointment() ya
// absorbe con normalidad el caso "no hay cita que completar" — este
// pase solo agrega la entrada desde el frontend. Reusa exactamente los
// mismos componentes de formulario/solo-lectura/sidebar que
// /consulta/[appointmentId], que nunca dependieron de una cita en sí.
export function PacienteConsultaScreen({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<unknown>(null);
  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const isBootstrapping = useRef(false);

  const bootstrap = useCallback(async () => {
    if (isBootstrapping.current) return;
    isBootstrapping.current = true;
    setPhase("loading");
    setError(null);
    try {
      const encounters = await apiFetch<EncounterListItem[]>(`/records/patients/${patientId}/encounters`, { accessToken });
      const existingDraft = encounters.find((e) => e.status === "DRAFT" && !e.appointmentId);

      let encounterId: string;
      if (existingDraft) {
        encounterId = existingDraft.id;
      } else {
        const hasSignedBefore = encounters.some((e) => e.status === "SIGNED");
        const created = await apiFetch<{ id: string }>(`/records/patients/${patientId}/encounters`, {
          method: "POST",
          accessToken,
          body: { patientId, encounterType: hasSignedBefore ? "FOLLOW_UP" : "FIRST_VISIT" },
        });
        encounterId = created.id;
      }

      const encounterDetail = await apiFetch<EncounterDetail>(`/records/encounters/${encounterId}`, { accessToken });
      setEncounter(encounterDetail);
      setPhase(encounterDetail.status === "SIGNED" ? "readonly" : "ready");
    } catch (err) {
      setError(err);
      setPhase("error");
    } finally {
      isBootstrapping.current = false;
    }
  }, [patientId, accessToken]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const {
    patient,
    allergies,
    medications,
    historyItems,
    timeline,
    pregnancy,
    activeDiagnoses,
    isLoading: isLoadingClinical,
    reload: reloadClinical,
  } = usePatientClinical(patientId, accessToken);

  if (phase === "loading" || !patient) {
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

  if (phase === "abandoned") {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card>
          <p className="text-base text-gray-900">
            Este borrador de <strong>{patientFullName(patient)}</strong> lleva más de 72 horas sin firmarse y se marcó como abandonado
            (M8-RN-003).
          </p>
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => router.push(`/pacientes/${patientId}`)}>
              Ir al expediente
            </Button>
            <Button type="button" onClick={() => void bootstrap()}>
              Iniciar una nota nueva
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (!encounter) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row">
      <ConsultaSidebar
        patientId={patientId}
        patient={patient}
        allergies={allergies}
        medications={medications}
        historyItems={historyItems}
        timeline={timeline}
        pregnancy={pregnancy}
        activeDiagnoses={activeDiagnoses}
        isLoadingClinical={isLoadingClinical}
      />
      {phase === "readonly" ? (
        <ConsultaReadonly encounter={encounter} patientId={patientId} historyItems={historyItems} />
      ) : (
        <ConsultaForm
          accessToken={accessToken}
          encounter={encounter}
          historyItems={historyItems}
          onHistoryChanged={reloadClinical}
          onSigned={() => router.push(`/pacientes/${patientId}?justSigned=1`)}
          onAbandoned={() => setPhase("abandoned")}
        />
      )}
    </main>
  );
}
