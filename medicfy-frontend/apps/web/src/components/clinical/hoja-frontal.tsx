"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { AllergySummary } from "@/components/clinical/allergy-summary";
import type { PatientAllergy, PatientMedication, ActiveDiagnosis, PatientHistoryItem } from "@/lib/use-patient-clinical";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "medium" }).format(new Date(iso));
}

interface HojaFrontalPatient {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  birthDate: string;
  sexAtBirth: "F" | "M";
  phoneE164: string;
  email: string;
  addressStreet: string | null;
  addressExt: string | null;
  addressInt: string | null;
  addressColonia: string | null;
  addressMunicipality: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
}

interface HojaFrontalData {
  patient: HojaFrontalPatient;
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  activeDiagnoses: ActiveDiagnosis[];
  surgeries: PatientHistoryItem[];
  lastEncounter: {
    id: string;
    encounterType: string;
    signedAt: string;
    doctor: { legalFirstName: string; legalLastName: string; primarySpecialty: { nameEs: string } | null };
  } | null;
  nextAppointment: { id: string; startsAt: string; status: string; service: { name: string } } | null;
}

function ageYears(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function formatAddress(p: HojaFrontalPatient): string | null {
  const line1 = [p.addressStreet, p.addressExt && `#${p.addressExt}`, p.addressInt && `int. ${p.addressInt}`].filter(Boolean).join(" ");
  const line2 = [p.addressColonia, p.addressMunicipality, p.addressState, p.addressPostalCode].filter(Boolean).join(", ");
  const full = [line1, line2].filter(Boolean).join(" · ");
  return full || null;
}

// Fase 5 · Prompt 39A — "una sola pantalla, sin scroll si es posible":
// identificación, domicilio, dx activos, alergias, medicación
// vigente, última consulta y próxima cita, todo de solo lectura.
// Ninguna acción de aquí interrumpe la captura de la nota (prueba de
// aceptación #2 de la Fase 5) — este componente nunca escribe nada.
export function HojaFrontal({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const [data, setData] = useState<HojaFrontalData | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<HojaFrontalData>(`/records/patients/${patientId}/hoja-frontal`, { accessToken })
      .then(setData)
      .catch(setError);
  }, [patientId, accessToken]);

  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingState label="Cargando hoja frontal…" />;

  const { patient, allergies, medications, activeDiagnoses, surgeries, lastEncounter, nextAppointment } = data;
  const activeMedications = medications.filter((m) => m.status === "ACTIVE");
  const address = formatAddress(patient);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-base font-semibold text-gray-900">
          {patient.firstName} {patient.lastNamePaternal} {patient.lastNameMaternal ?? ""}
        </p>
        <p className="text-gray-500">
          {patient.medicfyId} · {ageYears(patient.birthDate)} años · {patient.sexAtBirth === "F" ? "Mujer" : "Hombre"}
        </p>
        <p className="text-gray-500">{patient.phoneE164} · {patient.email}</p>
        {address ? <p className="text-gray-500">{address}</p> : null}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Alergias</h3>
        <AllergySummary allergies={allergies} />
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Diagnósticos vigentes</h3>
        {activeDiagnoses.length === 0 ? (
          <p className="text-gray-500">Ninguno registrado.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {activeDiagnoses.map((d) => (
              <li key={`${d.icd10Code ?? d.description}`} className="text-base text-gray-900">
                {d.icd10Code ? `${d.icd10Code} · ` : ""}
                {d.description}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Medicación vigente ({activeMedications.length})</h3>
        {activeMedications.length === 0 ? (
          <p className="text-gray-500">Ninguna registrada.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {activeMedications.map((m) => (
              <li key={m.id} className="text-base text-gray-900">
                {m.genericName} — {m.dose} · {m.frequency}
              </li>
            ))}
          </ul>
        )}
      </div>

      {surgeries.length > 0 ? (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Cirugías</h3>
          <ul className="flex flex-col gap-0.5">
            {surgeries.map((s) => (
              <li key={s.id} className="text-gray-700">
                {s.freeText || "Registrada, sin detalle"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Última consulta</h3>
        {lastEncounter ? (
          <p className="text-gray-700">
            {formatMxDateTime(lastEncounter.signedAt)} — Dr(a). {lastEncounter.doctor.legalFirstName} {lastEncounter.doctor.legalLastName}
            {lastEncounter.doctor.primarySpecialty ? ` (${lastEncounter.doctor.primarySpecialty.nameEs})` : ""}
          </p>
        ) : (
          <p className="text-gray-500">Sin consultas previas firmadas.</p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Próxima cita</h3>
        {nextAppointment ? (
          <p className="text-gray-700">
            {formatMxDate(nextAppointment.startsAt)} — {nextAppointment.service.name}
          </p>
        ) : (
          <p className="text-gray-500">Sin cita agendada.</p>
        )}
      </div>

      <Link href={`/pacientes/${patientId}`} className="w-fit text-sm font-medium text-brand-700 underline">
        Ver expediente completo
      </Link>
    </div>
  );
}
