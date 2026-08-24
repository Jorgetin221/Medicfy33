import type { PatientSummary } from "@/lib/use-patient-clinical";
import { Card } from "@/components/ui/states";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(new Date(iso));
}

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
  return (
    <Card>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" value={[patient.firstName, patient.lastNamePaternal, patient.lastNameMaternal].filter(Boolean).join(" ")} />
        <Field label="Medicfy ID" value={patient.medicfyId} />
        <Field label="Fecha de nacimiento" value={formatMxDate(patient.birthDate)} />
        <Field label="Sexo" value={patient.sexAtBirth === "F" ? "Mujer" : "Hombre"} />
        <Field label="Tipo de sangre" value={patient.bloodType ?? ""} />
        <Field label="Teléfono" value={patient.phoneE164} />
        <Field label="Correo" value={patient.email} />
        <Field label="Contacto de emergencia" value={patient.emergencyContactName ?? ""} />
        <Field label="Teléfono de emergencia" value={patient.emergencyContactPhone ?? ""} />
      </dl>

      {patient.guardians.length > 0 && (
        <div className="mt-4 border-t border-gray-300 pt-4">
          <p className="text-sm font-medium text-gray-500">Tutores vigentes</p>
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
