"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePatientClinical } from "@/lib/use-patient-clinical";
import { startWalkInAppointment } from "@/lib/start-walk-in";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import { AtlasModal } from "@/components/clinical/atlas-modal";
import { patientAgeYears, patientFullName } from "../../consulta/[appointmentId]/types";
import { TabDatosGenerales } from "./tab-datos-generales";
import { TabAntecedentes } from "./tab-antecedentes";
import { TabNotas } from "./tab-notas";
import { TabRecetas } from "./tab-recetas";
import { TabOrdenes } from "./tab-ordenes";
import { TabProtocolos } from "./tab-protocolos";
import { sexAtBirthLabel } from "@/lib/sex-label";

// Expediente — encabezado clínico persistente con alertas críticas
// siempre visible (CLAUDE.md §5/§6), y las 5 secciones que
// tabs.tsx ya anticipaba: Datos generales · Antecedentes · Notas ·
// Recetas · Órdenes y resultados. "Documentos" (adjuntos genéricos)
// no tiene backend en este pase — se omite en vez de mostrar una
// pestaña vacía.
export function ExpedienteScreen({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSigned = searchParams.get("justSigned") === "1";
  const { patient, allergies, medications, historyItems, timeline, isLoading, error, reload } = usePatientClinical(patientId, accessToken);
  const [isAtlasOpen, setIsAtlasOpen] = useState(false);
  const [isStartingConsultation, setIsStartingConsultation] = useState(false);
  const [startConsultationError, setStartConsultationError] = useState<unknown>(null);

  // Pedido explícito del usuario (2026-10-27): esto ya NO navega a una
  // pantalla distinta — crea una cita real para ahora mismo y entra a
  // la MISMA /consulta/[appointmentId] que usa la agenda.
  async function startConsultation() {
    setIsStartingConsultation(true);
    setStartConsultationError(null);
    try {
      const appointmentId = await startWalkInAppointment(patientId, accessToken);
      router.push(`/consulta/${appointmentId}`);
    } catch (err) {
      setStartConsultationError(err);
      setIsStartingConsultation(false);
    }
  }

  if (isLoading && !patient) {
    return (
      <main className="p-6 md:px-10">
        <LoadingState label={t("clinico.cargando.expediente")} />
      </main>
    );
  }

  if (error || !patient) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ErrorState error={error} onRetry={reload} />
      </main>
    );
  }

  const activeAllergyCount = allergies.filter((a) => a.status === "ACTIVE").length;

  const tabs: TabItem[] = [
    { id: "general", label: t("pacientes.expediente.tabs.datosGenerales"), content: <TabDatosGenerales patient={patient} /> },
    {
      id: "antecedentes",
      label: t("pacientes.expediente.tabs.antecedentes"),
      content: (
        <TabAntecedentes
          patientId={patientId}
          accessToken={accessToken}
          allergies={allergies}
          medications={medications}
          historyItems={historyItems}
          onChanged={reload}
        />
      ),
    },
    { id: "notas", label: t("pacientes.expediente.tabs.notas"), content: <TabNotas accessToken={accessToken} encounters={timeline?.encounters ?? []} /> },
    {
      id: "recetas",
      label: t("pacientes.expediente.tabs.recetas"),
      content: <TabRecetas accessToken={accessToken} patientId={patientId} prescriptions={timeline?.prescriptions ?? []} onChanged={reload} />,
    },
    {
      id: "ordenes",
      label: t("pacientes.expediente.tabs.ordenes"),
      content: (
        <TabOrdenes
          accessToken={accessToken}
          patientId={patientId}
          labOrders={timeline?.labOrders ?? []}
          standaloneResults={timeline?.standaloneResults ?? []}
          onChanged={reload}
        />
      ),
    },
    {
      id: "protocolos",
      label: t("pacientes.expediente.tabs.protocolos"),
      content: <TabProtocolos patientId={patientId} accessToken={accessToken} encounters={timeline?.encounters ?? []} />,
    },
  ];

  return (
    <main className="flex flex-col gap-4 p-6 md:px-10">
      {justSigned && <Aviso variant="exito" title={t("pacientes.expediente.firmada")} />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{patientFullName(patient)}</h1>
          <p className="text-base text-gray-500">
            {patient.medicfyId} · {t("pacientes.anios", { n: patientAgeYears(patient.birthDate) })} ·{" "}
            {sexAtBirthLabel(t, patient.sexAtBirth)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Ventana emergente, no panel lateral: pedido explícito. */}
          <Button type="button" variant="secondary" onClick={() => setIsAtlasOpen(true)}>
            {t("pacientes.atlas.abrir")}
          </Button>
          {/* Pedido explícito: atender a un paciente que ya existe sin
              haberle reservado un espacio en la agenda de antemano —
              crea la cita al vuelo (startWalkInAppointment) y entra a
              la misma pantalla que "Iniciar" desde la agenda. */}
          <Button type="button" isLoading={isStartingConsultation} onClick={() => void startConsultation()}>
            {t("pacientes.expediente.iniciarSinCita")}
          </Button>
        </div>
      </div>

      {startConsultationError ? <ErrorState error={startConsultationError} onRetry={() => void startConsultation()} /> : null}

      {activeAllergyCount > 0 && <AllergySummary allergies={allergies} loadState="ready" />}

      <Tabs items={tabs} />

      <AtlasModal open={isAtlasOpen} onClose={() => setIsAtlasOpen(false)} patientId={patientId} accessToken={accessToken} />
    </main>
  );
}
