import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsultaSidebar } from "./consulta-sidebar";
import type { ActiveDiagnosis, PatientPregnancy, PatientTimeline } from "@/lib/use-patient-clinical";

// Fase 1 / #20: primeras pruebas de UI del proyecto, sobre la Zona 1 —
// la columna de contexto que CLAUDE.md §6 exige siempre visible.

const PATIENT = {
  id: "p1",
  medicfyId: "MDF-000123",
  firstName: "María",
  lastNamePaternal: "López",
  lastNameMaternal: null,
  birthDate: "1994-03-15",
  sexAtBirth: "F" as const,
};

const PREGNANCY: PatientPregnancy = {
  id: "preg1",
  patientId: "p1",
  status: "ACTIVE",
  lmpDate: "2026-06-18",
  eddDate: "2027-03-25",
  eddMethod: "FUM",
  gestationalAge: { weeks: 10, days: 3 },
  isPostTerm: false,
};

const DIAGNOSES: ActiveDiagnosis[] = [
  {
    icd10Code: "E11.9",
    description: "Diabetes mellitus tipo 2",
    diagnosisType: "PRINCIPAL",
    certainty: "CONFIRMED",
    firstRecordedAt: "2026-05-01T10:00:00Z",
    lastRecordedAt: "2026-08-01T10:00:00Z",
    timesRecorded: 3,
    lastEncounterId: "e9",
  },
  {
    icd10Code: null,
    description: "Lumbalgia mecánica",
    diagnosisType: "SECONDARY",
    certainty: "SUSPECTED",
    firstRecordedAt: "2026-07-01T10:00:00Z",
    lastRecordedAt: "2026-07-01T10:00:00Z",
    timesRecorded: 1,
    lastEncounterId: "e8",
  },
];

function encounter(id: string, signedAt: string, status: "SIGNED" | "DRAFT" = "SIGNED") {
  return { type: "encounter" as const, id, encounterType: "FOLLOW_UP" as const, status, startedAt: signedAt, signedAt, doctorId: "d1" };
}

const TIMELINE = {
  encounters: [
    encounter("e1", "2026-08-20T10:00:00Z"),
    encounter("e2", "2026-07-20T10:00:00Z"),
    encounter("borrador", "2026-07-10T10:00:00Z", "DRAFT"),
    encounter("e3", "2026-06-20T10:00:00Z"),
    encounter("e4", "2026-05-20T10:00:00Z"),
  ],
  prescriptions: [],
  labOrders: [],
  standaloneResults: [],
} as unknown as PatientTimeline;

function renderSidebar(overrides: Partial<Parameters<typeof ConsultaSidebar>[0]> = {}) {
  return render(
    <ConsultaSidebar
      patientId="p1"
      patient={PATIENT}
      allergies={[]}
      medications={[]}
      historyItems={[]}
      timeline={TIMELINE}
      pregnancy={null}
      activeDiagnoses={[]}
      isLoadingClinical={false}
      {...overrides}
    />
  );
}

describe("ConsultaSidebar — Zona 1 de DOC-06", () => {
  it("muestra las cuatro secciones fijas del contexto del paciente", () => {
    renderSidebar();
    expect(screen.getByText("Diagnósticos vigentes")).toBeInTheDocument();
    expect(screen.getByText("Antecedentes")).toBeInTheDocument();
    expect(screen.getByText("Alergias")).toBeInTheDocument();
    expect(screen.getByText("Últimas consultas")).toBeInTheDocument();
  });

  it("#18: pinta el banner de embarazo con SDG y FPP calculadas por el servidor — y no lo pinta cuando no hay embarazo activo", () => {
    const { unmount } = renderSidebar({ pregnancy: PREGNANCY });
    const banner = screen.getByTestId("pregnancy-banner");
    expect(banner).toHaveTextContent("Embarazo: 10.3 SDG");
    expect(banner).toHaveTextContent("(FUM)");
    unmount();

    renderSidebar({ pregnancy: null });
    expect(screen.queryByTestId("pregnancy-banner")).not.toBeInTheDocument();
  });

  it("#19: lista los diagnósticos vigentes con su código CIE-10 y marca las sospechas como texto (el color nunca es el único portador)", () => {
    renderSidebar({ activeDiagnoses: DIAGNOSES });
    expect(screen.getByText(/Diabetes mellitus tipo 2/)).toBeInTheDocument();
    expect(screen.getByText(/E11\.9/)).toBeInTheDocument();
    expect(screen.getByText(/Lumbalgia mecánica/)).toBeInTheDocument();
    expect(screen.getByText(/\(sospecha\)/)).toBeInTheDocument();
  });

  it("muestra solo las últimas 3 consultas FIRMADAS — los borradores no cuentan", () => {
    renderSidebar();
    const items = screen.getAllByText(/Seguimiento/);
    expect(items).toHaveLength(3);
  });

  it("con la lista vacía dice explícitamente que no hay diagnósticos de consultas firmadas (estado vacío obligatorio, CLAUDE.md §5)", () => {
    renderSidebar({ activeDiagnoses: [] });
    expect(screen.getByText("Sin diagnósticos de consultas firmadas.")).toBeInTheDocument();
  });
});
