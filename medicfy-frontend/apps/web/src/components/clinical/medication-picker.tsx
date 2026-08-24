"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { TextInput, FieldWrapper } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/alert";

export interface MedicationCatalogEntry {
  id: string;
  genericName: string;
  brandNames: string[];
  presentations: { label?: string }[];
  controlGroup: "I" | "II" | "III" | "IV" | "V" | "VI";
  isElectronicallyPrescribable: boolean;
}

export interface PrescriptionDraftItem {
  medicationCatalogId: string;
  genericName: string;
  presentation: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  specialInstructions: string;
}

const MAX_ITEMS = 10;

function emptyDraftFields() {
  return { dose: "", route: "", frequency: "", duration: "", quantity: "", specialInstructions: "" };
}

// R5: Grupos I/II se muestran bloqueados EN LA BÚSQUEDA (antes de que
// el médico llene todo el formulario) y nunca se dejan seleccionar
// aquí — onBlockedSelected() le pasa la decisión al panel de receta,
// que ofrece el registro de receta física en su lugar.
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicationCatalogEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<MedicationCatalogEntry | null>(null);
  const [fields, setFields] = useState(emptyDraftFields());

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    const timeout = setTimeout(() => {
      apiFetch<MedicationCatalogEntry[]>(`/medications?search=${encodeURIComponent(query)}`, { accessToken })
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
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

  function addToList() {
    if (!selected || !fields.dose || !fields.route || !fields.frequency || !fields.duration) return;
    onChange([
      ...items,
      {
        medicationCatalogId: selected.id,
        genericName: selected.genericName,
        presentation: selected.presentations[0]?.label ?? "N/A",
        ...fields,
      },
    ]);
    setSelected(null);
    setFields(emptyDraftFields());
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
                  <p className="text-sm text-gray-700">
                    {item.dose} · {item.route} · {item.frequency} · {item.duration}
                  </p>
                  {item.specialInstructions && <p className="text-sm text-gray-500">{item.specialInstructions}</p>}
                </div>
                <Button type="button" variant="danger" onClick={() => removeItem(index)} className="min-h-11 px-3 text-sm">
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canAddMore && <Aviso variant="advertencia" title="Máximo 10 medicamentos por receta." />}

      {canAddMore && !selected && (
        <div className="relative">
          <TextInput
            placeholder="Buscar medicamento por nombre genérico o comercial…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar medicamento"
          />
          {query.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-card">
              {isSearching ? (
                <p className="p-3 text-sm text-gray-500">Buscando…</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">Sin resultados para &quot;{query}&quot;.</p>
              ) : (
                results.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => pick(entry)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-100 last:border-0"
                  >
                    <span>
                      <span className="block text-base font-medium text-gray-900">{entry.genericName}</span>
                      <span className="block text-sm text-gray-500">{entry.presentations[0]?.label ?? ""}</span>
                    </span>
                    {!entry.isElectronicallyPrescribable && (
                      <span className="whitespace-nowrap rounded-full border border-critical-600 px-2 py-0.5 text-xs font-medium text-critical-600">
                        Grupo {entry.controlGroup} — bloqueado
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-md border border-brand-700 bg-brand-100 p-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium text-brand-900">
              {selected.genericName} — {selected.presentations[0]?.label ?? ""}
            </p>
            <button type="button" onClick={() => setSelected(null)} className="min-h-11 text-sm font-medium text-brand-700 underline">
              Cambiar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="Dosis" htmlFor="med-dose">
              <TextInput id="med-dose" value={fields.dose} onChange={(e) => setFields({ ...fields, dose: e.target.value })} placeholder="p. ej. 500 mg" />
            </FieldWrapper>
            <FieldWrapper label="Vía" htmlFor="med-route">
              <TextInput id="med-route" value={fields.route} onChange={(e) => setFields({ ...fields, route: e.target.value })} placeholder="p. ej. oral" />
            </FieldWrapper>
            <FieldWrapper label="Frecuencia" htmlFor="med-frequency">
              <TextInput
                id="med-frequency"
                value={fields.frequency}
                onChange={(e) => setFields({ ...fields, frequency: e.target.value })}
                placeholder="p. ej. cada 8h"
              />
            </FieldWrapper>
            <FieldWrapper label="Duración" htmlFor="med-duration">
              <TextInput id="med-duration" value={fields.duration} onChange={(e) => setFields({ ...fields, duration: e.target.value })} placeholder="p. ej. 7 días" />
            </FieldWrapper>
            <FieldWrapper label="Cantidad a surtir (opcional)" htmlFor="med-quantity">
              <TextInput id="med-quantity" value={fields.quantity} onChange={(e) => setFields({ ...fields, quantity: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Instrucciones especiales (opcional)" htmlFor="med-instructions">
              <TextInput
                id="med-instructions"
                value={fields.specialInstructions}
                onChange={(e) => setFields({ ...fields, specialInstructions: e.target.value })}
              />
            </FieldWrapper>
          </div>
          <Button type="button" onClick={addToList} disabled={!fields.dose || !fields.route || !fields.frequency || !fields.duration}>
            Agregar a la receta
          </Button>
        </div>
      )}
    </div>
  );
}
