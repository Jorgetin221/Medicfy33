"use client";

import { useEffect, useId, useState } from "react";
import { apiFetch, ApiError, expectArray } from "@/lib/api-client";
import { TextInput, FieldWrapper, SelectInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/alert";
import { useI18n } from "@/lib/i18n/context";
import { formatDateLong } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";

export interface MedicationCatalogEntry {
  id: string;
  genericName: string;
  brandNames: string[];
  presentations: { label?: string }[];
  controlGroup: "I" | "II" | "III" | "IV" | "V" | "VI";
  isElectronicallyPrescribable: boolean;
}

// Prompt 32/36 (F4): la línea lleva dosis+unidad, indicación por
// línea y PROCEDENCIA — nueva, heredada de una receta anterior, o
// heredada y modificada (con la receta y fecha de origen).
export type PrescriptionLineOrigin = "NUEVA" | "HEREDADA" | "HEREDADA_MODIFICADA";

export interface PrescriptionDraftItem {
  medicationCatalogId: string;
  genericName: string;
  presentation: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  specialInstructions: string;
  indication: string;
  origin: PrescriptionLineOrigin;
  sourcePrescriptionId?: string;
  sourceIssuedAt?: string;
}

const MAX_ITEMS = 10;

function emptyDraftFields() {
  return { dose: "", doseUnit: "", route: "", frequency: "", duration: "", quantity: "", specialInstructions: "", indication: "" };
}

const ORIGIN_LABEL_KEY: Record<PrescriptionLineOrigin, MessageKey | null> = {
  NUEVA: null,
  HEREDADA: "clinico.medicamentos.origen.HEREDADA",
  HEREDADA_MODIFICADA: "clinico.medicamentos.origen.HEREDADA_MODIFICADA",
};

// Autoservicio de catálogo (decisión explícita del usuario,
// 2026-09-02): el médico agrega un medicamento que no encontró, sin
// esperar aprobación de un admin. controlGroup es obligatorio y sin
// opción preseleccionada — el propio médico lo declara a propósito
// (nunca un default silencioso), porque de eso depende que R5 siga
// bloqueando Grupos I/II exactamente igual que a un medicamento
// sembrado.
const CONTROL_GROUP_OPTIONS: { value: "I" | "II" | "III" | "IV" | "V" | "VI"; labelKey: MessageKey }[] = [
  { value: "I", labelKey: "clinico.medicamentos.grupos.I" },
  { value: "II", labelKey: "clinico.medicamentos.grupos.II" },
  { value: "III", labelKey: "clinico.medicamentos.grupos.III" },
  { value: "IV", labelKey: "clinico.medicamentos.grupos.IV" },
  { value: "V", labelKey: "clinico.medicamentos.grupos.V" },
  { value: "VI", labelKey: "clinico.medicamentos.grupos.VI" },
];
const CONTROLLED_GROUPS = new Set(["I", "II"]);

function emptyNewMedicationForm(genericName: string) {
  return { genericName, presentation: "", brandName: "", atcCode: "", controlGroup: "" as "" | (typeof CONTROL_GROUP_OPTIONS)[number]["value"] };
}

// R5: Grupos I/II se muestran bloqueados EN LA BÚSQUEDA (antes de que
// el médico llene todo el formulario) y nunca se dejan seleccionar
// aquí — onBlockedSelected() le pasa la decisión al panel de receta,
// que ofrece el registro de receta física en su lugar.
function originKey(origin: PrescriptionLineOrigin): MessageKey | null {
  return ORIGIN_LABEL_KEY[origin];
}

export function MedicationPicker({
  accessToken,
  items,
  onChange,
  onBlockedSelected,
}: {
  accessToken: string;
  items: PrescriptionDraftItem[];
  onChange: (items: PrescriptionDraftItem[]) => void;
  onBlockedSelected: (medication: MedicationCatalogEntry) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicationCatalogEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // M-25: un fallo de red ya no se ve como "sin resultados" (que invitaba
  // a dar de alta un duplicado del medicamento).
  const [searchError, setSearchError] = useState(false);
  // M-25: navegación por teclado del combobox (consulta sin ratón, §6).
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const [selected, setSelected] = useState<MedicationCatalogEntry | null>(null);
  const [fields, setFields] = useState(emptyDraftFields());
  // Prompt 36: al editar una línea heredada, se conserva su receta de
  // origen y la procedencia pasa a HEREDADA_MODIFICADA si algo cambió.
  const [editing, setEditing] = useState<{ index: number; item: PrescriptionDraftItem } | null>(null);
  // Autoservicio: "no lo encuentro, agregarlo" cuando la búsqueda no
  // regresa nada.
  const [addingNew, setAddingNew] = useState<ReturnType<typeof emptyNewMedicationForm> | null>(null);
  const [addNewError, setAddNewError] = useState<{ message: string; existingGenericName?: string } | null>(null);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError(false);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    setSearchError(false);
    setActiveIndex(-1);
    const timeout = setTimeout(() => {
      apiFetch<unknown>(`/medications?search=${encodeURIComponent(query)}`, { accessToken })
        .then((data) => {
          if (!cancelled) setResults(expectArray<MedicationCatalogEntry>(data));
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setSearchError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, accessToken]);

  function pick(entry: MedicationCatalogEntry) {
    setQuery("");
    setResults([]);
    if (!entry.isElectronicallyPrescribable) {
      onBlockedSelected(entry);
      return;
    }
    setSelected(entry);
    setFields(emptyDraftFields());
  }

  function startAddingNew() {
    setAddNewError(null);
    setAddingNew(emptyNewMedicationForm(query.trim()));
  }

  async function submitNewMedication() {
    if (!addingNew || !addingNew.presentation || !addingNew.controlGroup) return;
    setIsSubmittingNew(true);
    setAddNewError(null);
    try {
      const created = await apiFetch<MedicationCatalogEntry>("/medications", {
        method: "POST",
        accessToken,
        body: {
          genericName: addingNew.genericName,
          presentations: [{ label: addingNew.presentation }],
          controlGroup: addingNew.controlGroup,
          ...(addingNew.brandName ? { brandNames: [addingNew.brandName] } : {}),
          ...(addingNew.atcCode ? { atcCode: addingNew.atcCode } : {}),
        },
      });
      setAddingNew(null);
      pick(created);
    } catch (error) {
      if (error instanceof ApiError && error.code === "MEDICATION_ALREADY_EXISTS") {
        const details = error.details as { existingGenericName?: string } | undefined;
        setAddNewError({ message: error.message, ...(details?.existingGenericName ? { existingGenericName: details.existingGenericName } : {}) });
      } else {
        setAddNewError({ message: t("clinico.medicamentos.noSePudoAgregar") });
      }
    } finally {
      setIsSubmittingNew(false);
    }
  }

  function addToList() {
    if (!selected || !fields.dose || !fields.route || !fields.frequency || !fields.duration) return;
    if (editing) {
      const base = editing.item;
      const changed =
        base.dose !== fields.dose || base.doseUnit !== fields.doseUnit || base.route !== fields.route ||
        base.frequency !== fields.frequency || base.duration !== fields.duration ||
        base.quantity !== fields.quantity || base.specialInstructions !== fields.specialInstructions ||
        base.indication !== fields.indication;
      const updated: PrescriptionDraftItem = {
        ...base,
        ...fields,
        origin: base.origin === "NUEVA" ? "NUEVA" : changed ? "HEREDADA_MODIFICADA" : base.origin,
      };
      onChange(items.map((it, i) => (i === editing.index ? updated : it)));
      setEditing(null);
      setSelected(null);
      setFields(emptyDraftFields());
      return;
    }
    onChange([
      ...items,
      {
        medicationCatalogId: selected.id,
        genericName: selected.genericName,
        presentation: selected.presentations[0]?.label ?? "N/A",
        origin: "NUEVA",
        ...fields,
      },
    ]);
    setSelected(null);
    setFields(emptyDraftFields());
  }

  function editItem(index: number) {
    const item = items[index];
    if (!item) return;
    setEditing({ index, item });
    setSelected({
      id: item.medicationCatalogId,
      genericName: item.genericName,
      brandNames: [],
      presentations: [{ label: item.presentation }],
      controlGroup: "VI",
      isElectronicallyPrescribable: true,
    });
    setFields({
      dose: item.dose,
      doseUnit: item.doseUnit,
      route: item.route,
      frequency: item.frequency,
      duration: item.duration,
      quantity: item.quantity,
      specialInstructions: item.specialInstructions,
      indication: item.indication,
    });
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  const canAddMore = items.length < MAX_ITEMS;

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={`${item.medicationCatalogId}-${index}`} className="rounded-md border border-gray-300 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-gray-900">
                    {item.genericName} — {item.presentation}
                  </p>
                  {/* A-22: dosis y frecuencia nunca por debajo de 16 px. */}
                  <p className="text-base text-gray-700">
                    {item.dose}
                    {item.doseUnit ? ` ${item.doseUnit}` : ""} · {item.route} · {item.frequency} · {item.duration}
                  </p>
                  {item.indication && <p className="text-base text-gray-500">{t("clinico.medicamentos.indicacion", { texto: item.indication })}</p>}
                  {item.specialInstructions && <p className="text-sm text-gray-500">{item.specialInstructions}</p>}
                  {originKey(item.origin) && (
                    <p className="mt-1 w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {t(originKey(item.origin) ?? "clinico.medicamentos.origen.HEREDADA")}
                      {item.sourceIssuedAt ? ` · ${formatDateLong(locale, item.sourceIssuedAt)}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" variant="secondary" onClick={() => editItem(index)} className="min-h-11 px-3 text-sm">
                    {t("common.acciones.editar")}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => removeItem(index)} className="min-h-11 px-3 text-sm">
                    {t("common.acciones.quitar")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canAddMore && <Aviso variant="advertencia" title={t("clinico.medicamentos.maximo")} />}

      {canAddMore && !selected && (
        <div className="relative">
          <TextInput
            placeholder={t("clinico.medicamentos.buscar")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && results.length > 0) {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp" && results.length > 0) {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
                e.preventDefault();
                pick(results[activeIndex]);
              } else if (e.key === "Escape") {
                setQuery("");
              }
            }}
            role="combobox"
            aria-expanded={query.trim().length >= 2 && results.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
            aria-label={t("clinico.medicamentos.buscarEtiqueta")}
          />
          {query.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-card">
              {isSearching ? (
                <p className="p-3 text-base text-gray-500">{t("clinico.medicamentos.buscando")}</p>
              ) : searchError ? (
                <p role="alert" className="p-3 text-base text-danger-600">
                  {t("clinico.medicamentos.errorBusqueda")}
                </p>
              ) : results.length === 0 ? (
                <div className="p-3">
                  <p className="text-sm text-gray-500">{t("clinico.medicamentos.sinResultadosPara", { consulta: query })}</p>
                  <button
                    type="button"
                    onClick={startAddingNew}
                    className="mt-2 min-h-11 text-sm font-medium text-brand-700 underline"
                  >
                    {t("clinico.medicamentos.noLoEncuentro", { consulta: query })}
                  </button>
                </div>
              ) : (
                <div id={listboxId} role="listbox" aria-label={t("clinico.medicamentos.buscarEtiqueta")}>
                {results.map((entry, index) => (
                  <button
                    key={entry.id}
                    id={`${listboxId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(entry)}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-100 last:border-0 ${index === activeIndex ? "bg-gray-100" : ""}`}
                  >
                    <span>
                      <span className="block text-base font-medium text-gray-900">{entry.genericName}</span>
                      <span className="block text-sm text-gray-500">{entry.presentations[0]?.label ?? ""}</span>
                    </span>
                    {!entry.isElectronicallyPrescribable && (
                      <span className="whitespace-nowrap rounded-full border border-critical-600 px-2 py-0.5 text-sm font-medium text-critical-600">
                        {t("clinico.medicamentos.grupoBloqueadoEtiqueta", { grupo: entry.controlGroup })}
                      </span>
                    )}
                  </button>
                ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {addingNew && (
        <div className="flex flex-col gap-3 rounded-md border border-brand-700 bg-brand-100 p-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium text-brand-900">{t("clinico.medicamentos.agregarAlCatalogo")}</p>
            <button
              type="button"
              onClick={() => {
                setAddingNew(null);
                setAddNewError(null);
              }}
              className="min-h-11 text-sm font-medium text-brand-700 underline"
            >
              {t("common.acciones.cancelar")}
            </button>
          </div>
          <p className="text-sm text-gray-700">
            {t("clinico.medicamentos.avisoAutoservicio")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label={t("clinico.medicamentos.nombreGenerico")} htmlFor="new-med-name">
              <TextInput
                id="new-med-name"
                value={addingNew.genericName}
                onChange={(e) => setAddingNew({ ...addingNew, genericName: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.presentacion")} htmlFor="new-med-presentation" hint={t("clinico.medicamentos.presentacionEjemplo")}>
              <TextInput
                id="new-med-presentation"
                value={addingNew.presentation}
                onChange={(e) => setAddingNew({ ...addingNew, presentation: e.target.value })}
                placeholder={t("clinico.medicamentos.presentacionEjemplo")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.marca")} htmlFor="new-med-brand">
              <TextInput
                id="new-med-brand"
                value={addingNew.brandName}
                onChange={(e) => setAddingNew({ ...addingNew, brandName: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.atc")} htmlFor="new-med-atc">
              <TextInput
                id="new-med-atc"
                value={addingNew.atcCode}
                onChange={(e) => setAddingNew({ ...addingNew, atcCode: e.target.value })}
              />
            </FieldWrapper>
          </div>
          <FieldWrapper label={t("clinico.medicamentos.grupoControl")} htmlFor="new-med-control-group">
            <SelectInput
              id="new-med-control-group"
              value={addingNew.controlGroup}
              onChange={(e) => setAddingNew({ ...addingNew, controlGroup: e.target.value as typeof addingNew.controlGroup })}
            >
              <option value="">{t("clinico.medicamentos.seleccionaGrupo")}</option>
              {CONTROL_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
          {addingNew.controlGroup && CONTROLLED_GROUPS.has(addingNew.controlGroup) && (
            <Aviso variant="advertencia" title={t("clinico.medicamentos.grupoBloqueado")}>
              {t("clinico.medicamentos.grupoBloqueadoCuerpo")}
            </Aviso>
          )}
          {addNewError && (
            <Aviso variant="advertencia" title={addNewError.message}>
              {addNewError.existingGenericName && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingNew(null);
                    setAddNewError(null);
                    setQuery(addNewError.existingGenericName as string);
                  }}
                  className="min-h-11 text-sm font-medium underline"
                >
                  Buscar &quot;{addNewError.existingGenericName}&quot;
                </button>
              )}
            </Aviso>
          )}
          <Button
            type="button"
            onClick={submitNewMedication}
            disabled={!addingNew.presentation || !addingNew.controlGroup || isSubmittingNew}
          >
            {isSubmittingNew ? t("clinico.medicamentos.agregando") : t("clinico.medicamentos.agregarYUsar")}
          </Button>
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-md border border-brand-700 bg-brand-100 p-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium text-brand-900">
              {selected.genericName} — {selected.presentations[0]?.label ?? ""}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setEditing(null);
              }}
              className="min-h-11 text-sm font-medium text-brand-700 underline"
            >
              {editing ? t("clinico.medicamentos.cancelarEdicion") : t("clinico.medicamentos.cambiar")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label={t("clinico.medicamentos.dosis")} htmlFor="med-dose">
              <TextInput id="med-dose" value={fields.dose} onChange={(e) => setFields({ ...fields, dose: e.target.value })} placeholder={t("clinico.medicamentos.dosisEjemplo")} />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.unidad")} htmlFor="med-dose-unit">
              <TextInput id="med-dose-unit" value={fields.doseUnit} onChange={(e) => setFields({ ...fields, doseUnit: e.target.value })} placeholder={t("clinico.medicamentos.unidadEjemplo")} />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.via")} htmlFor="med-route">
              <TextInput id="med-route" value={fields.route} onChange={(e) => setFields({ ...fields, route: e.target.value })} placeholder={t("clinico.medicamentos.viaEjemplo")} />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.frecuencia")} htmlFor="med-frequency">
              <TextInput
                id="med-frequency"
                value={fields.frequency}
                onChange={(e) => setFields({ ...fields, frequency: e.target.value })}
                placeholder={t("clinico.medicamentos.frecuenciaEjemplo")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.duracion")} htmlFor="med-duration">
              <TextInput id="med-duration" value={fields.duration} onChange={(e) => setFields({ ...fields, duration: e.target.value })} placeholder={t("clinico.medicamentos.duracionEjemplo")} />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.cantidad")} htmlFor="med-quantity">
              <TextInput id="med-quantity" value={fields.quantity} onChange={(e) => setFields({ ...fields, quantity: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.instrucciones")} htmlFor="med-instructions">
              <TextInput
                id="med-instructions"
                value={fields.specialInstructions}
                onChange={(e) => setFields({ ...fields, specialInstructions: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.medicamentos.indicacionLinea")} htmlFor="med-indication">
              <TextInput
                id="med-indication"
                value={fields.indication}
                onChange={(e) => setFields({ ...fields, indication: e.target.value })}
                placeholder={t("clinico.medicamentos.indicacionEjemplo")}
              />
            </FieldWrapper>
          </div>
          <Button type="button" onClick={addToList} disabled={!fields.dose || !fields.route || !fields.frequency || !fields.duration}>
            {editing ? t("clinico.medicamentos.guardarCambios") : t("clinico.medicamentos.agregarAReceta")}
          </Button>
        </div>
      )}
    </div>
  );
}
