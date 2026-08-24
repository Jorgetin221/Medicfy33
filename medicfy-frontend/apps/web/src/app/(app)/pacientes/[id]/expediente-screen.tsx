"use client";

import { useSearchParams } from "next/navigation";
import { usePatientClinical } from "@/lib/use-patient-clinical";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import { patientAgeYears, patientFullName } from "../../consulta/[appointmentId]/types";
import { TabDatosGenerales } from "./tab-datos-generales";
import { TabAntecedentes } from "./tab-antecedentes";
import { TabNotas } from "./tab-notas";
import { TabRecetas } from "./tab-recetas";
import { TabOrdenes } from "./tab-ordenes";

// Expediente — encabezado clínico persistente con alertas críticas
// siempre visible (CLAUDE.md §5/§6), y las 5 secciones que
// tabs.tsx ya anticipaba: Datos generales · Antecedentes · Notas ·
// Recetas · Órdenes y resultados. "Documentos" (adjuntos genéricos)
// no tiene backend en este pase — se omite en vez de mostrar una
// pestaña vacía.
export function ExpedienteScreen({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const searchParams = useSearchParams();
  const justSigned = searchParams.get("justSigned") === "1";
  const { patient, allergies, medications, timeline, isLoading, error, reload } = usePatientClinical(patientId, accessToken);

  if (isLoading && !patient) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <LoadingState label="Cargando expediente…" />
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
    { id: "general", label: "Datos generales", content: <TabDatosGenerales patient={patient} /> },
    {
      id: "antecedentes",
      label: "Antecedentes",
      content: <TabAntecedentes patientId={patientId} accessToken={accessToken} allergies={allergies} medications={medications} onChanged={reload} />,
    },
    { id: "notas", label: "Notas", content: <TabNotas accessToken={accessToken} encounters={timeline?.encounters ?? []} /> },
    {
      id: "recetas",
      label: "Recetas",
      content: <TabRecetas accessToken={accessToken} prescriptions={timeline?.prescriptions ?? []} onChanged={reload} />,
    },
    {
      id: "ordenes",
      label: "Órdenes y resultados",
      content: <TabOrdenes accessToken={accessToken} patientId={patientId} labOrders={timeline?.labOrders ?? []} onChanged={reload} />,
    },
  ];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      {justSigned && <Aviso variant="exito" title="Consulta firmada correctamente." />}

      <div>
        <h1 className="font-heading text-2xl text-brand-900">{patientFullName(patient)}</h1>
        <p className="text-base text-gray-500">
          {patient.medicfyId} · {patientAgeYears(patient.birthDate)} años · {patient.sexAtBirth === "F" ? "Mujer" : "Hombre"}
        </p>
      </div>

      {activeAllergyCount > 0 && <AllergySummary allergies={allergies} />}

      <Tabs items={tabs} />
    </main>
  );
}
