"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { Card, ErrorState } from "@/components/ui/states";

type Category = "HEREDOFAMILIAR" | "PERSONAL_NO_PATOLOGICO" | "PERSONAL_PATOLOGICO";
type Status = "PRESENTE" | "NEGADO" | "DESCONOCIDO" | "NO_INVESTIGADO";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "PRESENTE", label: "Presente" },
  { value: "NEGADO", label: "Niega" },
  { value: "DESCONOCIDO", label: "Desconoce" },
  { value: "NO_INVESTIGADO", label: "No investigado" },
];

const STATUS_CLASS: Record<Status, string> = {
  PRESENTE: "border-warn-600 bg-warn-100 text-warn-700",
  NEGADO: "border-gray-300 bg-gray-100 text-gray-700",
  DESCONOCIDO: "border-gray-300 bg-gray-100 text-gray-700",
  NO_INVESTIGADO: "border-gray-300 bg-white text-gray-500",
};

// §10.1-10.3 de especificacion-plataforma-clinica-con-ia.md: vocabulario
// transcrito literal — nada agregado. Alergias y medicamentos actuales
// se excluyen porque ya viven en PatientAllergy/PatientMedication.
const HEREDOFAMILIAR_LABELS: Record<string, string> = {
  estado_vital: "Estado vital",
  diabetes: "Diabetes",
  hipertension: "Hipertensión",
  cardiopatia_evento_vascular: "Cardiopatía o evento vascular",
  cancer: "Cáncer",
  enfermedad_renal: "Enfermedad renal",
  enfermedad_hereditaria_congenita: "Enfermedad hereditaria o congénita",
  trastorno_neurologico_psiquiatrico: "Trastorno neurológico o psiquiátrico",
  enfermedad_autoinmune: "Enfermedad autoinmune",
  otro: "Otro antecedente",
};

const PERSONAL_NO_PATOLOGICO_LABELS: Record<string, string> = {
  vivienda_servicios: "Vivienda y servicios",
  alimentacion_hidratacion: "Alimentación e hidratación",
  higiene: "Higiene",
  actividad_fisica: "Actividad física",
  sueno: "Sueño",
  ocupacion_exposiciones: "Ocupación y exposiciones",
  viajes_relevantes: "Viajes relevantes",
  tabaquismo: "Tabaquismo",
  alcohol: "Alcohol",
  otras_sustancias: "Otras sustancias",
  vacunacion: "Vacunación",
  animales_vectores_riesgos: "Animales, vectores y riesgos ambientales",
};

const PERSONAL_PATOLOGICO_LABELS: Record<string, string> = {
  enfermedades_previas_activas: "Enfermedades previas y activas",
  hospitalizaciones: "Hospitalizaciones",
  cirugias: "Cirugías",
  traumatismos: "Traumatismos",
  transfusiones: "Transfusiones",
  enfermedades_infecciosas_relevantes: "Enfermedades infecciosas relevantes",
  discapacidad_apoyos: "Discapacidad y apoyos",
  salud_mental: "Salud mental",
};

const FAMILY_RELATIONSHIPS: { value: string; label: string }[] = [
  { value: "MADRE", label: "Madre" },
  { value: "PADRE", label: "Padre" },
  { value: "HERMANOS", label: "Hermanos" },
  { value: "HIJOS", label: "Hijos" },
  { value: "ABUELOS", label: "Abuelos" },
  { value: "OTRO", label: "Otro familiar" },
];

function findItem(
  items: PatientHistoryItem[],
  category: Category,
  subtype: string,
  familyRelationship: string
): PatientHistoryItem | undefined {
  return items.find((i) => i.category === category && i.subtype === subtype && i.familyRelationship === familyRelationship);
}

function HistoryRow({
  patientId,
  accessToken,
  category,
  subtype,
  label,
  familyRelationship,
  existing,
  onChanged,
}: {
  patientId: string;
  accessToken: string;
  category: Category;
  subtype: string;
  label: string;
  familyRelationship?: string;
  existing: PatientHistoryItem | undefined;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(existing?.freeText ?? "");
  const [savingStatus, setSavingStatus] = useState<Status | null>(null);
  const [error, setError] = useState<unknown>(null);
  const currentStatus: Status = existing?.status ?? "NO_INVESTIGADO";

  async function save(status: Status, freeText: string) {
    setError(null);
    setSavingStatus(status);
    try {
      await apiFetch(`/records/patients/${patientId}/history`, {
        method: "POST",
        accessToken,
        body: {
          category,
          subtype,
          ...(familyRelationship ? { familyRelationship } : {}),
          status,
          ...(freeText ? { freeText } : {}),
        },
      });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setSavingStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-medium text-gray-900">{label}</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label={`Estado de ${label}`}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={currentStatus === opt.value}
              disabled={savingStatus !== null}
              onClick={() => void save(opt.value, detail)}
              className={`min-h-11 rounded-full border px-3 text-sm font-medium ${
                currentStatus === opt.value ? STATUS_CLASS[opt.value] : "border-gray-300 bg-white text-gray-500 hover:bg-gray-100"
              }`}
            >
              {savingStatus === opt.value ? "Guardando…" : opt.label}
            </button>
          ))}
        </div>
      </div>
      <input
        type="text"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        onBlur={() => {
          if (detail !== (existing?.freeText ?? "")) void save(currentStatus, detail);
        }}
        placeholder="Detalle (opcional)"
        className="min-h-11 rounded-md border border-gray-300 px-3 text-base text-gray-900"
      />
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function PersonalSection({
  title,
  patientId,
  accessToken,
  category,
  labels,
  historyItems,
  onChanged,
}: {
  title: string;
  patientId: string;
  accessToken: string;
  category: Category;
  labels: Record<string, string>;
  historyItems: PatientHistoryItem[];
  onChanged: () => void;
}) {
  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold text-gray-900">{title}</h3>
      <div>
        {Object.entries(labels).map(([subtype, label]) => (
          <HistoryRow
            key={subtype}
            patientId={patientId}
            accessToken={accessToken}
            category={category}
            subtype={subtype}
            label={label}
            existing={findItem(historyItems, category, subtype, "NONE")}
            onChanged={onChanged}
          />
        ))}
      </div>
    </Card>
  );
}

function FamilyCard({
  patientId,
  accessToken,
  relationship,
  label,
  historyItems,
  onChanged,
}: {
  patientId: string;
  accessToken: string;
  relationship: string;
  label: string;
  historyItems: PatientHistoryItem[];
  onChanged: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const familyItems = historyItems.filter((i) => i.category === "HEREDOFAMILIAR" && i.familyRelationship === relationship);
  const positives = familyItems.filter((i) => i.status === "PRESENTE");

  return (
    <div className="rounded-md border border-gray-300">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left"
      >
        <span className="text-base font-medium text-gray-900">{label}</span>
        <span className="text-sm text-gray-500">
          {positives.length > 0 ? positives.map((p) => HEREDOFAMILIAR_LABELS[p.subtype] ?? p.subtype).join(", ") : "Sin antecedentes registrados"}
          {" · "}
          {isOpen ? "Ocultar" : "Ver / editar"}
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 px-4">
          {Object.entries(HEREDOFAMILIAR_LABELS).map(([subtype, label2]) => (
            <HistoryRow
              key={subtype}
              patientId={patientId}
              accessToken={accessToken}
              category="HEREDOFAMILIAR"
              subtype={subtype}
              label={label2}
              familyRelationship={relationship}
              existing={findItem(historyItems, "HEREDOFAMILIAR", subtype, relationship)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// M8-RN-012/§10: antecedentes heredofamiliares, personales no
// patológicos y personales patológicos — se capturan una vez en el
// paciente y se arrastran a cada consulta (nunca se recapturan).
// Componente compartido: se monta igual en la pestaña Antecedentes del
// expediente (TabAntecedentes) y, para consultas de primera vez,
// dentro de la propia consulta (consulta-form.tsx) — mismo patrón que
// ya usa AddAllergyForm/AddMedicationForm, cada acción guarda de
// inmediato contra /records/patients/:id/history, no depende del
// ciclo draft/firma del encuentro.
export function AntecedentesEditor({
  patientId,
  accessToken,
  historyItems,
  onChanged,
}: {
  patientId: string;
  accessToken: string;
  historyItems: PatientHistoryItem[];
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-base font-semibold text-gray-900">Antecedentes heredofamiliares</h3>
        <div className="flex flex-col gap-2">
          {FAMILY_RELATIONSHIPS.map((rel) => (
            <FamilyCard
              key={rel.value}
              patientId={patientId}
              accessToken={accessToken}
              relationship={rel.value}
              label={rel.label}
              historyItems={historyItems}
              onChanged={onChanged}
            />
          ))}
        </div>
      </Card>

      <PersonalSection
        title="Antecedentes personales no patológicos"
        patientId={patientId}
        accessToken={accessToken}
        category="PERSONAL_NO_PATOLOGICO"
        labels={PERSONAL_NO_PATOLOGICO_LABELS}
        historyItems={historyItems}
        onChanged={onChanged}
      />

      <PersonalSection
        title="Antecedentes personales patológicos"
        patientId={patientId}
        accessToken={accessToken}
        category="PERSONAL_PATOLOGICO"
        labels={PERSONAL_PATOLOGICO_LABELS}
        historyItems={historyItems}
        onChanged={onChanged}
      />
    </div>
  );
}

// Resumen compacto de solo lectura — usado en consulta-sidebar.tsx
// (DOC-06: "antecedentes visibles sin scroll ni clic") y
// consulta-readonly.tsx / el resumen colapsado de seguimiento en
// consulta-form.tsx. Solo positivos: es lo clínicamente relevante de
// un vistazo (§10.1 UX: "resumen automático editable").
export function AntecedentesSummary({ historyItems }: { historyItems: PatientHistoryItem[] }) {
  const positives = historyItems.filter((i) => i.status === "PRESENTE");
  if (positives.length === 0) {
    return <p className="text-sm text-gray-500">Sin antecedentes positivos registrados.</p>;
  }
  const labelsByCategory: Record<Category, Record<string, string>> = {
    HEREDOFAMILIAR: HEREDOFAMILIAR_LABELS,
    PERSONAL_NO_PATOLOGICO: PERSONAL_NO_PATOLOGICO_LABELS,
    PERSONAL_PATOLOGICO: PERSONAL_PATOLOGICO_LABELS,
  };
  return (
    <ul className="flex flex-col gap-1">
      {positives.map((item) => {
        const label = labelsByCategory[item.category][item.subtype] ?? item.subtype;
        const familyLabel = FAMILY_RELATIONSHIPS.find((r) => r.value === item.familyRelationship)?.label;
        return (
          <li key={item.id} className="text-sm text-gray-700">
            {label}
            {familyLabel ? ` (${familyLabel})` : ""}
            {item.freeText ? ` — ${item.freeText}` : ""}
          </li>
        );
      })}
    </ul>
  );
}
