import Link from "next/link";
import { Aviso } from "@/components/ui/alert";
import { Card } from "@/components/ui/states";
import { ENCOUNTER_TYPE_LABEL, type EncounterDetail } from "./types";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}

// R1: una nota firmada nunca se edita — esta vista es la única forma
// de "abrir" una consulta ya firmada (p. ej. el médico da doble clic
// en "Iniciar", o vuelve después). Mostrar el formulario editable
// aquí sería mentir sobre qué se puede hacer con estos datos.
export function ConsultaReadonly({ encounter, patientId }: { encounter: EncounterDetail; patientId: string }) {
  const note = encounter.notes[0];

  return (
    <div className="flex flex-col gap-4">
      <Aviso variant="info" title={`Consulta firmada${encounter.signedAt ? ` el ${formatMxDateTime(encounter.signedAt)}` : ""}`}>
        Esta nota ya fue firmada y no se puede editar. Para corregirla, agrega una nota nueva desde el expediente del paciente.
      </Aviso>

      {!note ? (
        <p className="text-base text-gray-500">No se encontró el contenido de la nota.</p>
      ) : (
        <>
          <Card>
            <p className="text-sm font-medium text-gray-500">{ENCOUNTER_TYPE_LABEL[encounter.encounterType]}</p>
            <dl className="mt-3 flex flex-col gap-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Motivo de consulta</dt>
                <dd className="text-base text-gray-900">{note.chiefComplaint}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Padecimiento actual</dt>
                <dd className="whitespace-pre-wrap text-base text-gray-900">{note.currentIllness}</dd>
              </div>
              {note.physicalExam && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Exploración física</dt>
                  <dd className="whitespace-pre-wrap text-base text-gray-900">{note.physicalExam}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500">Análisis</dt>
                <dd className="whitespace-pre-wrap text-base text-gray-900">{note.assessment}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Plan</dt>
                <dd className="whitespace-pre-wrap text-base text-gray-900">{note.plan}</dd>
              </div>
              {note.prognosis && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Pronóstico</dt>
                  <dd className="text-base text-gray-900">{note.prognosis}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <p className="text-sm font-medium text-gray-500">Diagnósticos</p>
            <ul className="mt-2 flex flex-col gap-1">
              {encounter.diagnoses.map((d) => (
                <li key={d.id} className="text-base text-gray-900">
                  {d.icd10Code} — {d.description} ({d.diagnosisType === "PRINCIPAL" ? "Principal" : "Secundario"},{" "}
                  {d.certainty === "CONFIRMED" ? "confirmado" : "sospechado"})
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Link href={`/pacientes/${patientId}`} className="text-base font-medium text-brand-700 underline">
        Ver expediente completo del paciente
      </Link>
    </div>
  );
}
