"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { ErrorState } from "@/components/ui/states";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { GinecoBlock, HeredofamiliarMatrix, PlantillasAntecedentes, SolicitarTermino, ToxicomaniasBlock } from "./historia-fase2";

type Category = "HEREDOFAMILIAR" | "PERSONAL_NO_PATOLOGICO" | "PERSONAL_PATOLOGICO";
type Status = "PRESENTE" | "NEGADO" | "DESCONOCIDO" | "NO_INVESTIGADO";

const STATUS_OPTIONS: { value: Status; labelKey: MessageKey }[] = [
  { value: "PRESENTE", labelKey: "clinico.antecedentes.estado.PRESENTE" },
  { value: "NEGADO", labelKey: "clinico.antecedentes.estado.NEGADO" },
  { value: "DESCONOCIDO", labelKey: "clinico.antecedentes.estado.DESCONOCIDO" },
  { value: "NO_INVESTIGADO", labelKey: "clinico.antecedentes.estado.NO_INVESTIGADO" },
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
// Claves de traducción, no texto. El `subtype` del servidor
// (estado_vital, diabetes…) sigue siendo el identificador; solo cambia
// cómo se lee. Un subtype nuevo que el servidor mande y no esté aquí
// cae de vuelta al propio subtype, no deja un hueco.
export const HEREDOFAMILIAR_LABEL_KEYS: Record<string, MessageKey> = {
  estado_vital: "clinico.antecedentes.heredofamiliar.estado_vital",
  diabetes: "clinico.antecedentes.heredofamiliar.diabetes",
  hipertension: "clinico.antecedentes.heredofamiliar.hipertension",
  cardiopatia_evento_vascular: "clinico.antecedentes.heredofamiliar.cardiopatia_evento_vascular",
  cancer: "clinico.antecedentes.heredofamiliar.cancer",
  enfermedad_renal: "clinico.antecedentes.heredofamiliar.enfermedad_renal",
  enfermedad_hereditaria_congenita: "clinico.antecedentes.heredofamiliar.enfermedad_hereditaria_congenita",
  trastorno_neurologico_psiquiatrico: "clinico.antecedentes.heredofamiliar.trastorno_neurologico_psiquiatrico",
  enfermedad_autoinmune: "clinico.antecedentes.heredofamiliar.enfermedad_autoinmune",
  otro: "clinico.antecedentes.heredofamiliar.otro",
};

export const PERSONAL_NO_PATOLOGICO_LABEL_KEYS: Record<string, MessageKey> = {
  vivienda_servicios: "clinico.antecedentes.noPatologico.vivienda_servicios",
  alimentacion_hidratacion: "clinico.antecedentes.noPatologico.alimentacion_hidratacion",
  higiene: "clinico.antecedentes.noPatologico.higiene",
  actividad_fisica: "clinico.antecedentes.noPatologico.actividad_fisica",
  sueno: "clinico.antecedentes.noPatologico.sueno",
  ocupacion_exposiciones: "clinico.antecedentes.noPatologico.ocupacion_exposiciones",
  viajes_relevantes: "clinico.antecedentes.noPatologico.viajes_relevantes",
  tabaquismo: "clinico.antecedentes.noPatologico.tabaquismo",
  alcohol: "clinico.antecedentes.noPatologico.alcohol",
  otras_sustancias: "clinico.antecedentes.noPatologico.otras_sustancias",
  vacunacion: "clinico.antecedentes.noPatologico.vacunacion",
  animales_vectores_riesgos: "clinico.antecedentes.noPatologico.animales_vectores_riesgos",
};

export const PERSONAL_PATOLOGICO_LABEL_KEYS: Record<string, MessageKey> = {
  enfermedades_previas_activas: "clinico.antecedentes.patologico.enfermedades_previas_activas",
  hospitalizaciones: "clinico.antecedentes.patologico.hospitalizaciones",
  cirugias: "clinico.antecedentes.patologico.cirugias",
  traumatismos: "clinico.antecedentes.patologico.traumatismos",
  transfusiones: "clinico.antecedentes.patologico.transfusiones",
  enfermedades_infecciosas_relevantes: "clinico.antecedentes.patologico.enfermedades_infecciosas_relevantes",
  discapacidad_apoyos: "clinico.antecedentes.patologico.discapacidad_apoyos",
  salud_mental: "clinico.antecedentes.patologico.salud_mental",
};

const FAMILY_RELATIONSHIPS: { value: string; labelKey: MessageKey }[] = [
  { value: "MADRE", labelKey: "clinico.antecedentes.parentesco.MADRE" },
  { value: "PADRE", labelKey: "clinico.antecedentes.parentesco.PADRE" },
  { value: "HERMANOS", labelKey: "clinico.antecedentes.parentesco.HERMANOS" },
  { value: "HIJOS", labelKey: "clinico.antecedentes.parentesco.HIJOS" },
  { value: "ABUELOS", labelKey: "clinico.antecedentes.parentesco.ABUELOS" },
  { value: "OTRO", labelKey: "clinico.antecedentes.parentesco.OTRO" },
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
  const t = useT();
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
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("clinico.antecedentes.estadoDe", { etiqueta: label })}>
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
              {savingStatus === opt.value ? t("common.acciones.guardando") : t(opt.labelKey)}
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
        placeholder={t("clinico.antecedentes.detalleOpcional")}
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
  labelKeys,
  historyItems,
  onChanged,
}: {
  title: string;
  patientId: string;
  accessToken: string;
  category: Category;
  labelKeys: Record<string, MessageKey>;
  historyItems: PatientHistoryItem[];
  onChanged: () => void;
}) {
  const t = useT();
  return (
    <CollapsibleCard title={title}>
      <div>
        {Object.entries(labelKeys).map(([subtype, labelKey]) => (
          <HistoryRow
            key={subtype}
            patientId={patientId}
            accessToken={accessToken}
            category={category}
            subtype={subtype}
            label={t(labelKey)}
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
    investigated("PERSONAL_NO_PATOLOGICO", Object.keys(PERSONAL_NO_PATOLOGICO_LABEL_KEYS)),
    investigated("PERSONAL_PATOLOGICO", Object.keys(PERSONAL_PATOLOGICO_LABEL_KEYS)),
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
  const t = useT();
  const [filter, setFilter] = useState("");
  const progress = blockProgress(historyItems);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700" data-testid="antecedentes-progress">
          {t("clinico.antecedentes.avance", { hechos: progress.done, total: progress.total })}
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("clinico.antecedentes.buscarCatalogo")}
          aria-label={t("clinico.antecedentes.buscarAntecedente")}
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
          title={t("clinico.antecedentes.personalesNoPatologicos")}
          patientId={patientId}
          accessToken={accessToken}
          category="PERSONAL_NO_PATOLOGICO"
          labelKeys={PERSONAL_NO_PATOLOGICO_LABEL_KEYS}
          historyItems={historyItems}
          onChanged={onChanged}
        />
      </div>

      <div id="bloque-patologicos" className="scroll-mt-20">
        <PersonalSection
          title={t("clinico.antecedentes.personalesPatologicos")}
          patientId={patientId}
          accessToken={accessToken}
          category="PERSONAL_PATOLOGICO"
          labelKeys={PERSONAL_PATOLOGICO_LABEL_KEYS}
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
  const t = useT();
  const positives = historyItems.filter((i) => i.status === "PRESENTE");
  if (positives.length === 0) {
    return <p className="text-sm text-gray-500">{t("clinico.antecedentes.sinPositivosRegistrados")}</p>;
  }
  const keysByCategory: Record<Category, Record<string, MessageKey>> = {
    HEREDOFAMILIAR: HEREDOFAMILIAR_LABEL_KEYS,
    PERSONAL_NO_PATOLOGICO: PERSONAL_NO_PATOLOGICO_LABEL_KEYS,
    PERSONAL_PATOLOGICO: PERSONAL_PATOLOGICO_LABEL_KEYS,
  };
  return (
    <ul className="flex flex-col gap-1">
      {positives.map((item) => {
        const labelKey = keysByCategory[item.category][item.subtype];
        const label = labelKey ? t(labelKey) : item.subtype;
        const familyKey = FAMILY_RELATIONSHIPS.find((r) => r.value === item.familyRelationship)?.labelKey;
        const familyLabel = familyKey ? t(familyKey) : undefined;
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
