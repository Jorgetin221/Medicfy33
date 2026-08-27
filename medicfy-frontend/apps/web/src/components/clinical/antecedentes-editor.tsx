"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { ErrorState } from "@/components/ui/states";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { GinecoBlock, HeredofamiliarMatrix, PlantillasAntecedentes, SolicitarTermino, ToxicomaniasBlock } from "./historia-fase2";

type Category = "HEREDOFAMILIAR" | "PERSONAL_NO_PATOLOGICO" | "PERSONAL_PATOLOGICO";
type Status = "PRESENTE" | "NEGADO" | "DESCONOCIDO" | "NO_INVESTIGADO";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "PRESENTE", label: "Presente" },
  { value: "NEGADO", label: "Niega" },
  { value: "DESCONOCIDO", label: "Desconoce" },
  { value: "NO_INVESTIGADO", label: "No investigado" },
];

// bg-warn-100/text-warn-700 no existen en el sistema de diseño (solo
// warn-600/warn-50 — ver tailwind.config.ts) y Tailwind los descarta en
// silencio, así que "Presente" solo mostraba el borde. Niega/Desconoce
// además usaban el mismo border-gray-300 que el estado sin seleccionar,
// con fondo/texto casi idénticos — nada distinguía visualmente lo
// seleccionado. brand-* (mismo color que ya usan los anillos de foco)
// marca una elección neutra ya revisada; gray-500 para "no investigado"
// se mantiene neutro mientras es claramente más oscuro que el estado
// vacío (border-gray-300/bg-white).
const STATUS_CLASS: Record<Status, string> = {
  PRESENTE: "border-warn-600 bg-warn-50 text-warn-600",
  NEGADO: "border-brand-700 bg-brand-100 text-brand-900",
  DESCONOCIDO: "border-brand-700 bg-brand-100 text-brand-900",
  NO_INVESTIGADO: "border-gray-500 bg-gray-100 text-gray-900",
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
    <CollapsibleCard title={title}>
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
    </CollapsibleCard>
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
// Prompt 19: "el objetivo de diseño es que documentar una primera
// consulta sea marcar, no redactar". Interacciones por bloque típico:
// matriz heredofamiliar = 1 pulsación por celda (8 filas × lo
// relevante); personales = 1 pulsación por renglón + comentario
// opcional. El avance se mide por bloques completos (sin
// NO_INVESTIGADO pendiente en sus renglones base).
function blockProgress(historyItems: PatientHistoryItem[]): { done: number; total: number } {
  const investigated = (category: Category, keys: string[]) =>
    keys.every((k) => historyItems.some((i) => i.category === category && i.subtype === k && i.status !== "NO_INVESTIGADO"));
  const blocks = [
    // Matriz heredofamiliar: al menos una celda investigada por fila núcleo.
    ["diabetes", "hipertension", "cancer"].every((k) =>
      historyItems.some((i) => i.category === "HEREDOFAMILIAR" && i.subtype === k && i.status !== "NO_INVESTIGADO")
    ),
    investigated("PERSONAL_NO_PATOLOGICO", Object.keys(PERSONAL_NO_PATOLOGICO_LABELS)),
    investigated("PERSONAL_PATOLOGICO", Object.keys(PERSONAL_PATOLOGICO_LABELS)),
  ];
  return { done: blocks.filter(Boolean).length, total: blocks.length };
}

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
  const [filter, setFilter] = useState("");
  const progress = blockProgress(historyItems);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700" data-testid="antecedentes-progress">
          Avance: {progress.done} de {progress.total} bloques base completos
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar en el catálogo de antecedentes…"
          aria-label="Buscar antecedente"
          className="min-h-11 w-72 rounded-md border border-gray-300 px-3 text-base text-gray-900"
        />
      </div>
      <SolicitarTermino accessToken={accessToken} />
      <PlantillasAntecedentes patientId={patientId} accessToken={accessToken} onChanged={onChanged} />

      <div id="bloque-heredofamiliares" className="scroll-mt-20">
        <HeredofamiliarMatrix
          patientId={patientId}
          accessToken={accessToken}
          historyItems={historyItems}
          onChanged={onChanged}
          filter={filter}
        />
      </div>

      <div id="bloque-no-patologicos" className="flex flex-col gap-6 scroll-mt-20">
        <ToxicomaniasBlock patientId={patientId} accessToken={accessToken} filter={filter} />
        <PersonalSection
          title="Antecedentes personales no patológicos"
          patientId={patientId}
          accessToken={accessToken}
          category="PERSONAL_NO_PATOLOGICO"
          labels={PERSONAL_NO_PATOLOGICO_LABELS}
          historyItems={historyItems}
          onChanged={onChanged}
        />
      </div>

      <div id="bloque-patologicos" className="scroll-mt-20">
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

      <div id="bloque-gineco" className="scroll-mt-20">
        <GinecoBlock patientId={patientId} accessToken={accessToken} />
      </div>
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
