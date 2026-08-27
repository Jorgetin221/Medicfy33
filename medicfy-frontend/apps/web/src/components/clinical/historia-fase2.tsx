"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { Card, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/field";

// Fase 2 — bloques estructurados de la historia clínica (prompts
// 19-23). Todo se captura MARCANDO contra el catálogo cerrado, nunca
// redactando: el texto libre queda solo en los comentarios.

// ── Prompt 10/19: "solicitar término nuevo" — NUNCA un campo de texto
// que cree términos: lo único que sale de aquí es una solicitud que la
// bandeja del curador resuelve.
export function SolicitarTermino({ accessToken, domain = "ANTECEDENTE" }: { accessToken: string; domain?: string }) {
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
          ¿Falta un término? Solicítalo al curador
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Término que necesitas"
            aria-label="Término nuevo a solicitar"
            className="w-64"
          />
          <Button type="button" disabled={term.trim().length < 2} onClick={() => void submit()} className="min-h-11 px-3 text-sm">
            Solicitar
          </Button>
          <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} className="min-h-11 px-3 text-sm">
            Cancelar
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
const MATRIX_DISEASES: { key: string; label: string }[] = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertensión" },
  { key: "cardiopatia_evento_vascular", label: "Cardiopatía / EVC" },
  { key: "cancer", label: "Cáncer" },
  { key: "enfermedad_renal", label: "Enf. renal" },
  { key: "enfermedad_hereditaria_congenita", label: "Hereditaria / congénita" },
  { key: "trastorno_neurologico_psiquiatrico", label: "Neuro / psiquiátrico" },
  { key: "enfermedad_autoinmune", label: "Autoinmune" },
];
const MATRIX_COLUMNS: { value: string; label: string }[] = [
  { value: "PADRE", label: "Padre" },
  { value: "MADRE", label: "Madre" },
  { value: "ABUELOS_PATERNOS", label: "Ab. paternos" },
  { value: "ABUELOS_MATERNOS", label: "Ab. maternos" },
  { value: "HERMANOS", label: "Hermanos" },
  { value: "HIJOS", label: "Hijos" },
];
type MatrixStatus = "NO_INVESTIGADO" | "PRESENTE" | "NEGADO" | "DESCONOCIDO";
const CYCLE: MatrixStatus[] = ["NO_INVESTIGADO", "PRESENTE", "NEGADO", "DESCONOCIDO"];
const CELL_GLYPH: Record<MatrixStatus, { text: string; label: string; cls: string }> = {
  NO_INVESTIGADO: { text: "—", label: "no investigado", cls: "text-gray-500 bg-white" },
  PRESENTE: { text: "✓", label: "presente", cls: "text-danger-600 bg-danger-50 font-bold" },
  NEGADO: { text: "✗", label: "negado", cls: "text-success-600 bg-success-50" },
  DESCONOCIDO: { text: "?", label: "se desconoce", cls: "text-warn-600 bg-warn-50" },
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

  const rows = MATRIX_DISEASES.filter((d) => !filter || d.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold text-gray-900">Antecedentes heredofamiliares</h3>
      <p className="mb-3 text-sm text-gray-500">
        Una pulsación por celda: — no investigado · <span className="text-danger-600">✓ presente</span> ·{" "}
        <span className="text-success-600">✗ negado</span> · <span className="text-warn-600">? se desconoce</span>
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
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((disease) => (
              <tr key={disease.key} className="border-t border-gray-100">
                <th scope="row" className="p-2 text-left text-base font-medium text-gray-900">
                  {disease.label}
                </th>
                {MATRIX_COLUMNS.map((col) => {
                  const status = cellStatus(disease.key, col.value);
                  const glyph = CELL_GLYPH[status];
                  const saving = savingCell === `${disease.key}:${col.value}`;
                  return (
                    <td key={col.value} className="p-1 text-center">
                      <button
                        type="button"
                        aria-label={`${disease.label} · ${col.label}: ${glyph.label}`}
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
    </Card>
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

const UNIT_LABELS: Record<string, string> = {
  CIGARROS_POR_DIA: "cigarros/día",
  UNIDADES_POR_SEMANA: "unidades/semana",
  UNIDADES_POR_DIA: "unidades/día",
  OTRA: "otra",
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
              {existing.status.toLowerCase()}
              {existing.quantity ? ` · ${Number(existing.quantity)} ${UNIT_LABELS[existing.unit ?? ""] ?? ""}` : ""}
              {existing.packYears ? (
                <span className="font-medium text-warn-600"> · índice tabáquico {Number(existing.packYears)} paquetes-año ({existing.computeVersion})</span>
              ) : null}
              {existing.stdDrinksPerWeek ? (
                <span className="font-medium text-warn-600"> · {Number(existing.stdDrinksPerWeek)} unidades estándar/semana</span>
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
          <SelectInput aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as "ACTIVO" | "SUSPENDIDO")}>
            <option value="ACTIVO">Activo</option>
            <option value="SUSPENDIDO">Suspendido</option>
          </SelectInput>
          <TextInput aria-label="Cantidad" placeholder="Cantidad" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-24" />
          <SelectInput aria-label="Unidad y frecuencia" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {Object.entries(UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
          <TextInput aria-label="Edad de inicio" placeholder="Edad inicio" inputMode="numeric" value={ageOfOnset} onChange={(e) => setAgeOfOnset(e.target.value)} className="w-28" />
          {status === "SUSPENDIDO" ? (
            <TextInput aria-label="Fecha de suspensión" type="date" value={suspendedAt} onChange={(e) => setSuspendedAt(e.target.value)} className="w-40" />
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
            Guardar
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
  const [substances, setSubstances] = useState<CatalogTermLite[]>([]);
  const [uses, setUses] = useState<SubstanceUseRecord[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<CatalogTermLite[]>("/catalogs/SUSTANCIA_PSICOACTIVA", { accessToken }),
      apiFetch<SubstanceUseRecord[]>(`/records/patients/${patientId}/substance-uses`, { accessToken }),
    ])
      .then(([catalog, existing]) => {
        setSubstances(catalog);
        setUses(existing);
      })
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(load, [load]);

  const visible = substances.filter((s) => !filter || s.preferredTerm.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card>
      <h3 className="mb-1 text-base font-semibold text-gray-900">Toxicomanías</h3>
      <p className="mb-2 text-sm text-gray-500">
        Cantidad y frecuencia son obligatorias con estado activo o suspendido — sin ellas no hay cálculo de riesgo. Los índices los
        calcula y guarda el servidor.
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
    </Card>
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
        <h3 className="mb-1 text-base font-semibold text-gray-900">Gineco-obstétricos</h3>
        <p className="mb-2 text-sm text-gray-500">Bloque oculto para este paciente según su sexo registrado.</p>
        <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => void enable()}>
          Habilitar bloque manualmente
        </Button>
        {error ? <ErrorState error={error} /> : null}
      </Card>
    );
  }

  function field(label: string, name: string, props: Record<string, unknown> = {}) {
    return (
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        {label}
        <TextInput
          value={form[name] ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          className="w-36"
          {...props}
        />
      </label>
    );
  }

  return (
    <Card data-testid="gyneco-block">
      <h3 className="mb-2 text-base font-semibold text-gray-900">Gineco-obstétricos</h3>
      <div className="flex flex-wrap gap-3">
        {field("Menarca (edad)", "menarcheAge", { inputMode: "numeric" })}
        {field("Duración del ciclo (días)", "cycleDurationDays", { inputMode: "numeric" })}
        {field("Frecuencia del ciclo (días)", "cycleFrequencyDays", { inputMode: "numeric" })}
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Cantidad
          <SelectInput value={form.cycleAmount ?? ""} onChange={(e) => setForm((f) => ({ ...f, cycleAmount: e.target.value }))}>
            <option value="">—</option>
            <option value="LEVE">Leve</option>
            <option value="MODERADA">Moderada</option>
            <option value="ABUNDANTE">Abundante</option>
          </SelectInput>
        </label>
        {field("IVSA (edad)", "sexualOnsetAge", { inputMode: "numeric" })}
        {field("Parejas", "sexualPartners", { inputMode: "numeric" })}
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Método anticonceptivo
          <SelectInput value={form.contraceptiveMethod ?? ""} onChange={(e) => setForm((f) => ({ ...f, contraceptiveMethod: e.target.value }))}>
            <option value="">—</option>
            {["NINGUNO", "CONDON", "DIU", "HORMONAL_ORAL", "HORMONAL_INYECTABLE", "IMPLANTE", "OTB", "VASECTOMIA_PAREJA", "NATURAL", "OTRO"].map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </SelectInput>
        </label>
        {field("Gestas", "gestas", { inputMode: "numeric" })}
        {field("Partos", "partos", { inputMode: "numeric" })}
        {field("Cesáreas", "cesareas", { inputMode: "numeric" })}
        {field("Abortos", "abortos", { inputMode: "numeric" })}
        {field("ITS", "stiHistory", { className: "w-56" })}
        {field("Otras secreciones", "otherDischarge", { className: "w-56" })}
        {field("Antecedentes perinatales", "perinatalHistory", { className: "w-72" })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" className="min-h-11 px-3 text-sm" onClick={() => void save()}>
          Guardar bloque
        </Button>
        {saved ? <p className="text-sm text-success-600">Guardado.</p> : null}
        {history ? <p className="text-sm text-gray-500">Cada cambio conserva el valor anterior (R1).</p> : null}
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
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<PendingInherited[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<TemplateRecord[]>("/records/antecedentes-templates", { accessToken }),
      apiFetch<PendingInherited[]>(`/records/patients/${patientId}/history-pending-inherited`, { accessToken }),
    ])
      .then(([tpls, pend]) => {
        setTemplates(tpls);
        setPending(pend);
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
      <h3 className="mb-1 text-base font-semibold text-gray-900">Plantillas de antecedentes</h3>
      <p className="mb-2 text-sm text-gray-500">
        Aplicar una plantilla marca cada dato como <strong>heredado</strong> — la nota no se puede firmar mientras haya heredados sin
        revisar.
      </p>
      {templates.length === 0 ? (
        <p className="text-sm text-gray-500">No tienes plantillas todavía.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput aria-label="Plantilla" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Elige una plantilla…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.specialty ? ` (${t.specialty.nameEs})` : ""}
              </option>
            ))}
          </SelectInput>
          <Button type="button" disabled={!selected} className="min-h-11 px-3 text-sm" onClick={() => void apply()}>
            Aplicar plantilla
          </Button>
        </div>
      )}

      {pending.length > 0 ? (
        <div role="alert" className="mt-3 rounded-md border border-warn-600 bg-warn-50 p-3" data-testid="pending-inherited">
          <p className="text-base font-medium text-gray-900">
            ⚠ {pending.length} antecedente(s) heredados sin revisar — bloquean la firma
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {pending.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
                <span>
                  {item.subtype.replace(/_/g, " ")}
                  {item.familyRelationship !== "NONE" ? ` (${item.familyRelationship.toLowerCase().replace(/_/g, " ")})` : ""}
                </span>
                <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => void confirmItem(item.id)}>
                  Revisado ✓
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
