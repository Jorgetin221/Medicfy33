"use client";

import type { PatientSummary } from "@/lib/use-patient-clinical";
import { Card } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/context";
import { formatDateLong } from "@/lib/i18n/format";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-base text-gray-900">{value || "—"}</dd>
    </div>
  );
}

// Solo lectura por ahora — PATCH /patients/:id (edición de datos
// generales) todavía no existe en el backend; no hay a qué llamar
// desde aquí sin inventar un endpoint fuera del plan aprobado.
export function TabDatosGenerales({ patient }: { patient: PatientSummary }) {
  const { t, locale } = useI18n();

  return (
    <Card>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("pacientes.datosGenerales.nombreCompleto")} value={[patient.firstName, patient.lastNamePaternal, patient.lastNameMaternal].filter(Boolean).join(" ")} />
        <Field label={t("pacientes.datosGenerales.medicfyId")} value={patient.medicfyId} />
        <Field label={t("pacientes.datosGenerales.fechaNacimiento")} value={formatDateLong(locale, patient.birthDate)} />
        <Field label={t("pacientes.datosGenerales.sexo")} value={patient.sexAtBirth === "F" ? t("pacientes.mujer") : t("pacientes.hombre")} />
        <Field label={t("pacientes.datosGenerales.tipoSangre")} value={patient.bloodType ?? ""} />
        <Field label={t("pacientes.datosGenerales.telefono")} value={patient.phoneE164} />
        <Field label={t("pacientes.datosGenerales.correo")} value={patient.email} />
        <Field label={t("pacientes.datosGenerales.contactoEmergencia")} value={patient.emergencyContactName ?? ""} />
        <Field label={t("pacientes.datosGenerales.telefonoEmergencia")} value={patient.emergencyContactPhone ?? ""} />
      </dl>

      {patient.guardians.length > 0 && (
        <div className="mt-4 border-t border-gray-300 pt-4">
          <p className="text-sm font-medium text-gray-500">{t("pacientes.datosGenerales.tutoresVigentes")}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {patient.guardians.map((g, i) => (
              <li key={i} className="text-base text-gray-900">
                {g.guardianName} ({g.guardianRelation}) — {g.guardianPhoneE164}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
