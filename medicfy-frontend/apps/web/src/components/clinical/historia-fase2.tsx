"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, expectArray } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { Card, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { translateKeyed } from "@/lib/i18n/keyed";

// Fase 2 — bloques estructurados de la historia clínica (prompts
// 19-23). Todo se captura MARCANDO contra el catálogo cerrado, nunca
// redactando: el texto libre queda solo en los comentarios.

// ── Prompt 10/19: "solicitar término nuevo" — NUNCA un campo de texto
// que cree términos: lo único que sale de aquí es una solicitud que la
// bandeja del curador resuelve.
export function SolicitarTermino({ accessToken, domain = "ANTECEDENTE" }: { accessToken: string; domain?: string }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function submit() {
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/catalogs/${domain}/term-requests`, { method: "POST", accessToken, body: { proposedTerm: term.trim() } });
      setMessage(`Solicitud enviada al curador: "${term.trim()}". Podrás usarlo cuando se apruebe.`);
      setTerm("");
      setIsOpen(false);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {!isOpen ? (
        <button type="button" onClick={() => setIsOpen(true)} className="min-h-11 w-fit text-sm font-medium text-brand-700 underline">
          {t("clinico.historiaFase2.solicitarTermino")}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("clinico.historiaFase2.terminoPlaceholder")}
            aria-label={t("clinico.historiaFase2.terminoEtiqueta")}
            className="w-64"
          />
          <Button type="button" disabled={term.trim().length < 2} onClick={() => void submit()} className="min-h-11 px-3 text-sm">
            {t("clinico.historiaFase2.solicitar")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} className="min-h-11 px-3 text-sm">
            {t("common.acciones.cancelar")}
          </Button>
        </div>
      )}
      {message ? <p className="text-sm text-success-600">{message}</p> : null}
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

// ── Prompt 20: matriz heredofamiliar ───────────────────────────────
// Filas = padecimientos del catálogo; columnas = parentescos por
// línea. Cada celda cicla — (no investigado) → ✓ presente → ✗ negado
// → ? se desconoce — UNA interacción por dato. "Se desconoce" es un
// estado distinto de "no lo tiene" (24.4 del prompt 20).
const MATRIX_DISEASES: { key: string; labelKey: MessageKey }[] = [
  { key: "diabetes", labelKey: "clinico.historiaFase2.enfermedades.diabetes" },
  { key: "hipertension", labelKey: "clinico.historiaFase2.enfermedades.hipertension" },
  { key: "cardiopatia_evento_vascular", labelKey: "clinico.historiaFase2.enfermedades.cardiopatia_evento_vascular" },
  { key: "cancer", labelKey: "clinico.historiaFase2.enfermedades.cancer" },
  { key: "enfermedad_renal", labelKey: "clinico.historiaFase2.enfermedades.enfermedad_renal" },
  { key: "enfermedad_hereditaria_congenita", labelKey: "clinico.historiaFase2.enfermedades.enfermedad_hereditaria_congenita" },
  { key: "trastorno_neurologico_psiquiatrico", labelKey: "clinico.historiaFase2.enfermedades.trastorno_neurologico_psiquiatrico" },
  { key: "enfermedad_autoinmune", labelKey: "clinico.historiaFase2.enfermedades.enfermedad_autoinmune" },
];
const MATRIX_COLUMNS: { value: string; labelKey: MessageKey }[] = [
  { value: "PADRE", labelKey: "clinico.historiaFase2.columnas.PADRE" },
  { value: "MADRE", labelKey: "clinico.historiaFase2.columnas.MADRE" },
  { value: "ABUELOS_PATERNOS", labelKey: "clinico.historiaFase2.columnas.ABUELOS_PATERNOS" },
  { value: "ABUELOS_MATERNOS", labelKey: "clinico.historiaFase2.columnas.ABUELOS_MATERNOS" },
  { value: "HERMANOS", labelKey: "clinico.historiaFase2.columnas.HERMANOS" },
  { value: "HIJOS", labelKey: "clinico.historiaFase2.columnas.HIJOS" },
];
const CONTRACEPTIVE_METHOD_KEYS: [string, MessageKey][] = [
  ["NINGUNO", "clinico.historiaFase2.anticonceptivos.NINGUNO"],
  ["CONDON", "clinico.historiaFase2.anticonceptivos.CONDON"],
  ["DIU", "clinico.historiaFase2.anticonceptivos.DIU"],
  ["HORMONAL_ORAL", "clinico.historiaFase2.anticonceptivos.HORMONAL_ORAL"],
  ["HORMONAL_INYECTABLE", "clinico.historiaFase2.anticonceptivos.HORMONAL_INYECTABLE"],
  ["IMPLANTE", "clinico.historiaFase2.anticonceptivos.IMPLANTE"],
  ["OTB", "clinico.historiaFase2.anticonceptivos.OTB"],
  ["VASECTOMIA_PAREJA", "clinico.historiaFase2.anticonceptivos.VASECTOMIA_PAREJA"],
  ["NATURAL", "clinico.historiaFase2.anticonceptivos.NATURAL"],
  ["OTRO", "clinico.historiaFase2.anticonceptivos.OTRO"],
];

type MatrixStatus = "NO_INVESTIGADO" | "PRESENTE" | "NEGADO" | "DESCONOCIDO";
const CYCLE: MatrixStatus[] = ["NO_INVESTIGADO", "PRESENTE", "NEGADO", "DESCONOCIDO"];
const CELL_GLYPH: Record<MatrixStatus, { text: string; labelKey: MessageKey; cls: string }> = {
  NO_INVESTIGADO: { text: "—", labelKey: "clinico.historiaFase2.celda.NO_INVESTIGADO", cls: "text-gray-500 bg-white" },
  PRESENTE: { text: "✓", labelKey: "clinico.historiaFase2.celda.PRESENTE", cls: "text-danger-600 bg-danger-50 font-bold" },
  NEGADO: { text: "✗", labelKey: "clinico.historiaFase2.celda.NEGADO", cls: "text-success-600 bg-success-50" },
  DESCONOCIDO: { text: "?", labelKey: "clinico.historiaFase2.celda.DESCONOCIDO", cls: "text-warn-600 bg-warn-50" },
};

const SUBSTANCE_STATUS_KEYS: Record<string, MessageKey> = {
  ACTIVO: "clinico.historiaFase2.estadoSustancia.ACTIVO",
  SUSPENDIDO: "clinico.historiaFase2.estadoSustancia.SUSPENDIDO",
  NUNCA: "clinico.historiaFase2.estadoSustancia.NUNCA",
  DESCONOCIDO: "clinico.historiaFase2.estadoSustancia.DESCONOCIDO",
};

export function HeredofamiliarMatrix({
  patientId,
  accessToken,
  historyItems,
  onChanged,
  filter,
}: {
  patientId: string;
  accessToken: string;
  historyItems: PatientHistoryItem[];
  onChanged: () => void;
  filter?: string;
}) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  function cellStatus(subtype: string, relationship: string): MatrixStatus {
    const item = historyItems.find(
      (i) => i.category === "HEREDOFAMILIAR" && i.subtype === subtype && i.familyRelationship === relationship
    );
    return (item?.status as MatrixStatus) ?? "NO_INVESTIGADO";
  }

  async function cycleCell(subtype: string, relationship: string) {
    const current = cellStatus(subtype, relationship);
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length] as MatrixStatus;
    setError(null);
    setSavingCell(`${subtype}:${relationship}`);
    try {
      await apiFetch(`/records/patients/${patientId}/history`, {
        method: "POST",
        accessToken,
        body: { category: "HEREDOFAMILIAR", subtype, familyRelationship: relationship, status: next },
      });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setSavingCell(null);
    }
  }

  const rows = MATRIX_DISEASES.filter((d) => !filter || t(d.labelKey).toLowerCase().includes(filter.toLowerCase()));

  return (
    <CollapsibleCard title={t("clinico.historiaFase2.matrizTitulo")}>
      <p className="mb-3 text-sm text-gray-500">
        {t("clinico.historiaFase2.matrizAyuda")}
        <span className="text-danger-600">{t("clinico.historiaFase2.presente")}</span> ·{" "}
        <span className="text-success-600">{t("clinico.historiaFase2.negado")}</span> ·{" "}
        <span className="text-warn-600">{t("clinico.historiaFase2.desconocido")}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-2 text-left font-medium text-gray-500">
                Padecimiento
              </th>
              {MATRIX_COLUMNS.map((col) => (
                <th key={col.value} scope="col" className="p-1 text-center font-medium text-gray-500">
                  {t(col.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((disease) => (
              <tr key={disease.key} className="border-t border-gray-100">
                <th scope="row" className="p-2 text-left text-base font-medium text-gray-900">
                  {t(disease.labelKey)}
                </th>
                {MATRIX_COLUMNS.map((col) => {
                  const status = cellStatus(disease.key, col.value);
                  const glyph = CELL_GLYPH[status];
                  const saving = savingCell === `${disease.key}:${col.value}`;
                  return (
                    <td key={col.value} className="p-1 text-center">
                      <button
                        type="button"
                        aria-label={t("clinico.historiaFase2.celdaEtiqueta", {
                          enfermedad: t(disease.labelKey),
                          parentesco: t(col.labelKey),
                          estado: t(glyph.labelKey),
                        })}
                        disabled={saving}
                        onClick={() => void cycleCell(disease.key, col.value)}
                        className={`min-h-11 min-w-11 rounded-md border border-gray-300 text-base ${glyph.cls}`}
                      >
                        {saving ? "…" : glyph.text}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <ErrorState error={error} /> : null}
    </CollapsibleCard>
  );
}

// ── Prompt 21: toxicomanías con cuantificación ─────────────────────
interface SubstanceUseRecord {
  id: string;
  status: "ACTIVO" | "SUSPENDIDO" | "NEGADO";
  quantity: string | null;
  unit: string | null;
  ageOfOnset: number | null;
  suspendedAt: string | null;
  packYears: string | null;
  stdDrinksPerWeek: string | null;
  computeVersion: string | null;
  substanceTerm: { key: string; preferredTerm: string };
}
interface CatalogTermLite {
  key: string;
  preferredTerm: string;
}

const UNIT_LABEL_KEYS: Record<string, MessageKey> = {
  CIGARROS_POR_DIA: "clinico.historiaFase2.unidades.CIGARROS_POR_DIA",
  UNIDADES_POR_SEMANA: "clinico.historiaFase2.unidades.UNIDADES_POR_SEMANA",
  UNIDADES_POR_DIA: "clinico.historiaFase2.unidades.UNIDADES_POR_DIA",
  OTRA: "clinico.historiaFase2.unidades.OTRA",
};

function SubstanceRow({
  patientId,
  accessToken,
  substance,
  existing,
  onChanged,
}: {
  patientId: string;
  accessToken: string;
  substance: CatalogTermLite;
  existing: SubstanceUseRecord | undefined;
  onChanged: () => void;
}) {
  const t = useT();
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState<"ACTIVO" | "SUSPENDIDO">("ACTIVO");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("CIGARROS_POR_DIA");
  const [ageOfOnset, setAgeOfOnset] = useState("");
  const [suspendedAt, setSuspendedAt] = useState("");
  const [error, setError] = useState<unknown>(null);

  async function save(body: Record<string, unknown>) {
    setError(null);
    try {
      await apiFetch(`/records/patients/${patientId}/substance-uses`, {
        method: "POST",
        accessToken,
        body: { substanceKey: substance.key, ...body },
      });
      setIsEditing(false);
      onChanged();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-medium text-gray-900">
          {substance.preferredTerm}
          {existing ? (
            <span className="ml-2 text-sm font-normal text-gray-500">
              {translateKeyed(t, SUBSTANCE_STATUS_KEYS, existing.status, existing.status.toLowerCase())}
              {existing.quantity
                ? t("clinico.historiaFase2.consumo", {
                    cantidad: Number(existing.quantity),
                    unidad: translateKeyed(t, UNIT_LABEL_KEYS, existing.unit ?? "", ""),
                  })
                : ""}
              {existing.packYears ? (
                <span className="font-medium text-warn-600">
                  {t("clinico.historiaFase2.indiceTabaquico", { valor: Number(existing.packYears), version: existing.computeVersion ?? "" })}
                </span>
              ) : null}
              {existing.stdDrinksPerWeek ? (
                <span className="font-medium text-warn-600">
                  {t("clinico.historiaFase2.unidadesSemana", { valor: Number(existing.stdDrinksPerWeek) })}
                </span>
              ) : null}
            </span>
          ) : null}
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setIsEditing((v) => !v)}>
            {existing ? "Actualizar" : "Registrar"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 px-3 text-sm"
            onClick={() => void save({ status: "NEGADO" })}
          >
            Negado
          </Button>
        </div>
      </div>
      {isEditing ? (
        <div className="flex flex-wrap items-end gap-2">
          <SelectInput aria-label={t("clinico.estado")} value={status} onChange={(e) => setStatus(e.target.value as "ACTIVO" | "SUSPENDIDO")}>
            <option value="ACTIVO">Activo</option>
            <option value="SUSPENDIDO">Suspendido</option>
          </SelectInput>
          <TextInput aria-label={t("clinico.historiaFase2.cantidad")} placeholder={t("clinico.historiaFase2.cantidad")} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-24" />
          <SelectInput aria-label={t("clinico.historiaFase2.unidadFrecuencia")} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {Object.entries(UNIT_LABEL_KEYS).map(([value, labelKey]) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </SelectInput>
          <TextInput aria-label={t("clinico.historiaFase2.edadInicio")} placeholder={t("clinico.historiaFase2.edadInicioCorto")} inputMode="numeric" value={ageOfOnset} onChange={(e) => setAgeOfOnset(e.target.value)} className="w-28" />
          {status === "SUSPENDIDO" ? (
            <DateInput aria-label={t("clinico.historiaFase2.fechaSuspension")} value={suspendedAt} onChange={setSuspendedAt} className="w-44" />
          ) : null}
          <Button
            type="button"
            className="min-h-11 px-3 text-sm"
            disabled={quantity.trim() === ""}
            onClick={() =>
              void save({
                status,
                quantity: Number(quantity),
                unit,
                ...(ageOfOnset ? { ageOfOnset: Number(ageOfOnset) } : {}),
                ...(status === "SUSPENDIDO" && suspendedAt ? { suspendedAt } : {}),
              })
            }
          >
            {t("common.acciones.guardar")}
          </Button>
        </div>
      ) : null}
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

export function ToxicomaniasBlock({
  patientId,
  accessToken,
  filter,
}: {
  patientId: string;
  accessToken: string;
  filter?: string;
}) {
  const t = useT();
  const [substances, setSubstances] = useState<CatalogTermLite[]>([]);
  const [uses, setUses] = useState<SubstanceUseRecord[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<unknown>("/catalogs/SUSTANCIA_PSICOACTIVA", { accessToken }),
      apiFetch<unknown>(`/records/patients/${patientId}/substance-uses`, { accessToken }),
    ])
      .then(([catalog, existing]) => {
        setSubstances(expectArray<CatalogTermLite>(catalog));
        setUses(expectArray<SubstanceUseRecord>(existing));
      })
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(load, [load]);

  const visible = substances.filter((s) => !filter || s.preferredTerm.toLowerCase().includes(filter.toLowerCase()));

  return (
    <CollapsibleCard title={t("clinico.historiaFase2.toxicomanias")}>
      <p className="mb-2 text-sm text-gray-500">
        {t("clinico.historiaFase2.toxicomaniasAyuda")}
      </p>
      {visible.map((substance) => (
        <SubstanceRow
          key={substance.key}
          patientId={patientId}
          accessToken={accessToken}
          substance={substance}
          existing={uses.find((u) => u.substanceTerm.key === substance.key)}
          onChanged={load}
        />
      ))}
      {error ? <ErrorState error={error} /> : null}
    </CollapsibleCard>
  );
}

// ── Prompt 22: bloque gineco-obstétrico condicionado ───────────────
interface GynecoRecord {
  id: string;
  menarcheAge: number | null;
  cycleDurationDays: number | null;
  cycleFrequencyDays: number | null;
  cycleAmount: string | null;
  dysmenorrhea: boolean | null;
  otherDischarge: string | null;
  sexualOnsetAge: number | null;
  sexualPartners: number | null;
  contraceptiveMethod: string | null;
  sexualFrequency: string | null;
  stiHistory: string | null;
  gestas: number | null;
  partos: number | null;
  cesareas: number | null;
  abortos: number | null;
  perinatalHistory: string | null;
}

export function GinecoBlock({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const t = useT();
  const [visible, setVisible] = useState<boolean | null>(null);
  const [history, setHistory] = useState<GynecoRecord | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ visible: boolean; history: GynecoRecord | null }>(`/records/patients/${patientId}/gyneco-history`, { accessToken })
      .then((res) => {
        setVisible(res.visible);
        setHistory(res.history);
        if (res.history) {
          const h = res.history;
          setForm({
            menarcheAge: h.menarcheAge?.toString() ?? "",
            cycleDurationDays: h.cycleDurationDays?.toString() ?? "",
            cycleFrequencyDays: h.cycleFrequencyDays?.toString() ?? "",
            cycleAmount: h.cycleAmount ?? "",
            otherDischarge: h.otherDischarge ?? "",
            sexualOnsetAge: h.sexualOnsetAge?.toString() ?? "",
            sexualPartners: h.sexualPartners?.toString() ?? "",
            contraceptiveMethod: h.contraceptiveMethod ?? "",
            stiHistory: h.stiHistory ?? "",
            gestas: h.gestas?.toString() ?? "",
            partos: h.partos?.toString() ?? "",
            cesareas: h.cesareas?.toString() ?? "",
            abortos: h.abortos?.toString() ?? "",
            perinatalHistory: h.perinatalHistory ?? "",
          });
        }
      })
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(load, [load]);

  async function enable() {
    setError(null);
    try {
      await apiFetch(`/records/patients/${patientId}/gyneco-history/enable`, { method: "POST", accessToken });
      load();
    } catch (err) {
      setError(err);
    }
  }

  function num(name: string): number | undefined {
    const raw = form[name];
    return raw !== undefined && raw !== "" ? Number(raw) : undefined;
  }
  function str(name: string): string | undefined {
    const raw = form[name];
    return raw !== undefined && raw !== "" ? raw : undefined;
  }

  async function save() {
    setError(null);
    setSaved(false);
    const body: Record<string, unknown> = {};
    for (const key of ["menarcheAge", "cycleDurationDays", "cycleFrequencyDays", "sexualOnsetAge", "sexualPartners", "gestas", "partos", "cesareas", "abortos"]) {
      const value = num(key);
      if (value !== undefined) body[key] = value;
    }
    for (const key of ["cycleAmount", "otherDischarge", "contraceptiveMethod", "stiHistory", "perinatalHistory"]) {
      const value = str(key);
      if (value !== undefined) body[key] = value;
    }
    try {
      await apiFetch(`/records/patients/${patientId}/gyneco-history`, { method: "POST", accessToken, body });
      setSaved(true);
      load();
    } catch (err) {
      setError(err);
    }
  }

  if (visible === null) return null;
  if (!visible) {
    // Prompt 22: NO se muestra a todos por omisión — solo el botón de
    // habilitación explícita cuando corresponda.
    return (
      <Card>
        <h3 className="mb-1 text-base font-semibold text-gray-900">{t("clinico.historiaFase2.gineco")}</h3>
        <p className="mb-2 text-sm text-gray-500">{t("clinico.historiaFase2.ginecoOculto")}</p>
        <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => void enable()}>
          {t("clinico.historiaFase2.habilitarBloque")}
        </Button>
        {error ? <ErrorState error={error} /> : null}
      </Card>
    );
  }

  function field(label: string, name: string, props: Record<string, unknown> = {}, span = "") {
    return (
      <label className={cn("flex flex-col gap-1 text-sm font-medium text-gray-700", span)}>
        {label}
        <TextInput
          value={form[name] ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          {...props}
        />
      </label>
    );
  }

  return (
    <Card data-testid="gyneco-block">
      <h3 className="mb-3 text-base font-semibold text-gray-900">{t("clinico.historiaFase2.gineco")}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {field(t("clinico.historiaFase2.menarca"), "menarcheAge", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.duracionCiclo"), "cycleDurationDays", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.frecuenciaCiclo"), "cycleFrequencyDays", { inputMode: "numeric" })}
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          {t("clinico.historiaFase2.cantidadCiclo")}
          <SelectInput value={form.cycleAmount ?? ""} onChange={(e) => setForm((f) => ({ ...f, cycleAmount: e.target.value }))}>
            <option value="">—</option>
            <option value="LEVE">{t("clinico.historiaFase2.leve")}</option>
            <option value="MODERADA">{t("clinico.historiaFase2.moderada")}</option>
            <option value="ABUNDANTE">{t("clinico.historiaFase2.abundante")}</option>
          </SelectInput>
        </label>
        {field(t("clinico.historiaFase2.ivsa"), "sexualOnsetAge", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.parejas"), "sexualPartners", { inputMode: "numeric" })}
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          {t("clinico.historiaFase2.metodoAnticonceptivo")}
          <SelectInput value={form.contraceptiveMethod ?? ""} onChange={(e) => setForm((f) => ({ ...f, contraceptiveMethod: e.target.value }))}>
            <option value="">—</option>
            {CONTRACEPTIVE_METHOD_KEYS.map(([value, labelKey]) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </SelectInput>
        </label>
        {field(t("clinico.historiaFase2.gestas"), "gestas", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.partos"), "partos", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.cesareas"), "cesareas", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.abortos"), "abortos", { inputMode: "numeric" })}
        {field(t("clinico.historiaFase2.its"), "stiHistory", {}, "sm:col-span-2")}
        {field(t("clinico.historiaFase2.otrasSecreciones"), "otherDischarge", {}, "sm:col-span-2")}
        {field(t("clinico.historiaFase2.perinatales"), "perinatalHistory", {}, "col-span-full")}
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-gray-200 pt-3">
        <Button type="button" className="min-h-11 px-3 text-sm" onClick={() => void save()}>
          {t("clinico.historiaFase2.guardarBloque")}
        </Button>
        {saved ? <p className="text-sm text-success-600">{t("clinico.historiaFase2.guardado")}</p> : null}
        {history ? <p className="text-sm text-gray-500">{t("clinico.historiaFase2.conservaAnterior")}</p> : null}
      </div>
      {error ? <ErrorState error={error} /> : null}
    </Card>
  );
}

// ── Prompt 23B: plantillas + heredados pendientes ──────────────────
interface TemplateRecord {
  id: string;
  name: string;
  specialty: { code: string; nameEs: string } | null;
}
interface PendingInherited {
  id: string;
  category: string;
  subtype: string;
  familyRelationship: string;
}

export function PlantillasAntecedentes({
  patientId,
  accessToken,
  onChanged,
}: {
  patientId: string;
  accessToken: string;
  onChanged: () => void;
}) {
  const t = useT();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<PendingInherited[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<unknown>("/records/antecedentes-templates", { accessToken }),
      apiFetch<unknown>(`/records/patients/${patientId}/history-pending-inherited`, { accessToken }),
    ])
      .then(([tpls, pend]) => {
        setTemplates(expectArray<TemplateRecord>(tpls));
        setPending(expectArray<PendingInherited>(pend));
      })
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(load, [load]);

  async function apply() {
    setError(null);
    try {
      await apiFetch(`/records/patients/${patientId}/antecedentes-templates/${selected}/apply`, { method: "POST", accessToken });
      load();
      onChanged();
    } catch (err) {
      setError(err);
    }
  }

  async function confirmItem(itemId: string) {
    setError(null);
    try {
      await apiFetch(`/records/patients/${patientId}/history/${itemId}/confirm-inherited`, { method: "POST", accessToken });
      load();
      onChanged();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold text-gray-900">{t("clinico.historiaFase2.plantillasTitulo")}</h3>
      <p className="mb-2 text-sm text-gray-500">
        {t("clinico.historiaFase2.plantillasAyudaInicio")}
        <strong>{t("clinico.historiaFase2.plantillasHeredado")}</strong>
        {t("clinico.historiaFase2.plantillasAyudaFin")}
      </p>
      {templates.length === 0 ? (
        <p className="text-sm text-gray-500">{t("clinico.historiaFase2.sinPlantillas")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput aria-label={t("clinico.historiaFase2.plantilla")} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{t("clinico.historiaFase2.eligePlantilla")}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.specialty ? ` (${t.specialty.nameEs})` : ""}
              </option>
            ))}
          </SelectInput>
          <Button type="button" disabled={!selected} className="min-h-11 px-3 text-sm" onClick={() => void apply()}>
            {t("clinico.historiaFase2.aplicarPlantilla")}
          </Button>
        </div>
      )}

      {pending.length > 0 ? (
        <div role="alert" className="mt-3 rounded-md border border-warn-600 bg-warn-50 p-3" data-testid="pending-inherited">
          <p className="text-base font-medium text-gray-900">
            {t("clinico.historiaFase2.heredadosPendientes", { n: pending.length })}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {pending.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
                <span>
                  {item.subtype.replace(/_/g, " ")}
                  {item.familyRelationship !== "NONE" ? ` (${item.familyRelationship.toLowerCase().replace(/_/g, " ")})` : ""}
                </span>
                <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => void confirmItem(item.id)}>
                  {t("clinico.historiaFase2.revisado")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <ErrorState error={error} /> : null}
    </Card>
  );
}
