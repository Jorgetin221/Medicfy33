"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ADMINISTRATION_ROUTES,
  ADMINISTRATION_ROUTE_LABELS,
  ALLERGY_SEVERITIES,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPES,
  ALLERGY_TYPE_LABELS,
  CLINICAL_DATA_SOURCES,
  CLINICAL_DATA_SOURCE_LABELS,
  patientAllergyCreateSchema,
  patientMedicationCreateSchema,
  type PatientAllergyCreateInput,
  type PatientMedicationCreateInput,
} from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import type { PatientAllergy, PatientMedication, PatientHistoryItem } from "@/lib/use-patient-clinical";
import { Card, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import { AntecedentesEditor } from "@/components/clinical/antecedentes-editor";

// M8-RN-012: "los antecedentes se capturan una vez y se arrastran; no
// se recapturan nunca" — este tab es el único lugar donde se
// capturan. CRUD siempre editable (no es append-only, a diferencia de
// clinical_notes — ver patient-clinical.service.ts).
export function TabAntecedentes({
  patientId,
  accessToken,
  allergies,
  medications,
  historyItems,
  onChanged,
}: {
  patientId: string;
  accessToken: string;
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  historyItems: PatientHistoryItem[];
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Alergias</h2>
        <AllergySummary allergies={allergies} />
        {allergies.some((a) => a.status !== "ACTIVE") && (
          <ul className="mt-2 flex flex-col gap-1">
            {allergies
              .filter((a) => a.status !== "ACTIVE")
              .map((a) => (
                <li key={a.id} className="text-sm text-gray-500">
                  {a.substance} — {a.status === "INACTIVE" ? "inactiva" : "descartada"}
                </li>
              ))}
          </ul>
        )}
        <AddAllergyForm patientId={patientId} accessToken={accessToken} onCreated={onChanged} />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Medicamentos habituales</h2>
        {medications.length === 0 ? (
          <p className="text-base text-gray-500">Ninguno registrado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {medications.map((m) => (
              <li key={m.id} className="rounded-md border border-gray-300 px-3 py-2">
                <p className="text-base font-medium text-gray-900">
                  {m.genericName} {m.brandName ? `(${m.brandName})` : ""}
                </p>
                <p className="text-sm text-gray-700">
                  {m.dose} · {m.route} · {m.frequency}
                </p>
                <p className="text-sm text-gray-500">
                  {m.status === "ACTIVE" ? "Activo" : m.status === "SUSPENDED" ? "Suspendido" : "Completado"}
                  {m.reason ? ` — ${m.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <AddMedicationForm patientId={patientId} accessToken={accessToken} onCreated={onChanged} />
      </Card>

      <AntecedentesEditor patientId={patientId} accessToken={accessToken} historyItems={historyItems} onChanged={onChanged} />
    </div>
  );
}

function AddAllergyForm({ patientId, accessToken, onCreated }: { patientId: string; accessToken: string; onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<PatientAllergyCreateInput>({
    resolver: zodResolver(patientAllergyCreateSchema),
    defaultValues: { certainty: "CONFIRMED" },
  });

  async function onSubmit(values: PatientAllergyCreateInput) {
    setSubmitError(null);
    try {
      await apiFetch(`/records/patients/${patientId}/allergies`, { method: "POST", accessToken, body: values });
      form.reset({ certainty: "CONFIRMED" } as PatientAllergyCreateInput);
      setIsOpen(false);
      onCreated();
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="secondary" className="mt-3" onClick={() => setIsOpen(true)}>
        + Agregar alergia
      </Button>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3 border-t border-gray-300 pt-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label="Sustancia" htmlFor="allergy-substance" error={form.formState.errors.substance?.message}>
          <TextInput id="allergy-substance" error={!!form.formState.errors.substance} {...form.register("substance")} />
        </FieldWrapper>
        <FieldWrapper label="Tipo" htmlFor="allergy-type" error={form.formState.errors.allergyType?.message}>
          {/* P4 §6.1: vocabulario cerrado — el hint ya contenía la lista */}
          <SelectInput id="allergy-type" error={!!form.formState.errors.allergyType} {...form.register("allergyType")}>
            {ALLERGY_TYPES.map((value) => (
              <option key={value} value={value}>
                {ALLERGY_TYPE_LABELS[value]}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
        <FieldWrapper label="Severidad" htmlFor="allergy-severity" error={form.formState.errors.severity?.message}>
          {/* Cerrado para poder ordenar/filtrar por gravedad (P4 §2.7) */}
          <SelectInput id="allergy-severity" error={!!form.formState.errors.severity} {...form.register("severity")}>
            {ALLERGY_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {ALLERGY_SEVERITY_LABELS[value]}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
        <FieldWrapper label="Certeza" htmlFor="allergy-certainty">
          <SelectInput id="allergy-certainty" {...form.register("certainty")}>
            <option value="CONFIRMED">Confirmada</option>
            <option value="LIKELY">Probable</option>
            <option value="UNCERTAIN">Incierta</option>
          </SelectInput>
        </FieldWrapper>
        <FieldWrapper label="Reacción (opcional)" htmlFor="allergy-reaction">
          <TextInput id="allergy-reaction" {...form.register("reaction")} />
        </FieldWrapper>
        <FieldWrapper label="Fuente" htmlFor="allergy-source" error={form.formState.errors.source?.message}>
          <SelectInput id="allergy-source" error={!!form.formState.errors.source} {...form.register("source")}>
            {CLINICAL_DATA_SOURCES.map((value) => (
              <option key={value} value={value}>
                {CLINICAL_DATA_SOURCE_LABELS[value]}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
      </div>
      {submitError ? <ErrorState error={submitError} /> : null}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={form.formState.isSubmitting}>
          Guardar alergia
        </Button>
      </div>
    </form>
  );
}

function AddMedicationForm({ patientId, accessToken, onCreated }: { patientId: string; accessToken: string; onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<PatientMedicationCreateInput>({ resolver: zodResolver(patientMedicationCreateSchema) });

  async function onSubmit(values: PatientMedicationCreateInput) {
    setSubmitError(null);
    try {
      await apiFetch(`/records/patients/${patientId}/medications`, { method: "POST", accessToken, body: values });
      form.reset();
      setIsOpen(false);
      onCreated();
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="secondary" className="mt-3" onClick={() => setIsOpen(true)}>
        + Agregar medicamento habitual
      </Button>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3 border-t border-gray-300 pt-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label="Nombre genérico" htmlFor="med-generic" error={form.formState.errors.genericName?.message}>
          <TextInput id="med-generic" error={!!form.formState.errors.genericName} {...form.register("genericName")} />
        </FieldWrapper>
        <FieldWrapper label="Nombre comercial (opcional)" htmlFor="med-brand">
          <TextInput id="med-brand" {...form.register("brandName")} />
        </FieldWrapper>
        <FieldWrapper label="Dosis" htmlFor="med-dose-hab" error={form.formState.errors.dose?.message}>
          <TextInput id="med-dose-hab" error={!!form.formState.errors.dose} {...form.register("dose")} />
        </FieldWrapper>
        <FieldWrapper label="Vía" htmlFor="med-route-hab" error={form.formState.errors.route?.message}>
          {/* P4 §2.8: la vía de administración es un catálogo cerrado */}
          <SelectInput id="med-route-hab" error={!!form.formState.errors.route} {...form.register("route")}>
            {ADMINISTRATION_ROUTES.map((value) => (
              <option key={value} value={value}>
                {ADMINISTRATION_ROUTE_LABELS[value]}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
        <FieldWrapper label="Frecuencia" htmlFor="med-freq-hab" error={form.formState.errors.frequency?.message}>
          <TextInput id="med-freq-hab" error={!!form.formState.errors.frequency} {...form.register("frequency")} />
        </FieldWrapper>
        <FieldWrapper label="Fuente" htmlFor="med-source" error={form.formState.errors.source?.message}>
          <SelectInput id="med-source" error={!!form.formState.errors.source} {...form.register("source")}>
            {CLINICAL_DATA_SOURCES.map((value) => (
              <option key={value} value={value}>
                {CLINICAL_DATA_SOURCE_LABELS[value]}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
      </div>
      {submitError ? <ErrorState error={submitError} /> : null}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={form.formState.isSubmitting}>
          Guardar medicamento
        </Button>
      </div>
    </form>
  );
}
