"use client";

import { useEffect, useState } from "react";
import type { EncounterDiagnosisInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { TextInput, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

interface Icd10Result {
  code: string;
  description: string;
}

// M8-RN-006: "al menos un diagnóstico con CIE-10" para firmar. Un solo
// PRINCIPAL a la vez (el resto SECONDARY) — no es una regla clínica
// inventada, es la cardinalidad que ya implica diagnosisType siendo
// un enum de dos valores en clinical.schema.ts, aplicada como
// guardrail de UI.
//
// Segunda ruta (a petición explícita del usuario, apartándose a
// sabiendas de "texto libre... nunca como sustituto" de M8-RN-006):
// un diagnóstico puede quedar sin icd10Code si trae codeAbsentReason
// en su lugar — ver encounterDiagnosisSchema. Como ya no hay
// icd10Code garantizado como identificador único, remover/marcar
// principal/cambiar certeza se hacen por índice en el arreglo, no por
// código.
export function Icd10Picker({
  accessToken,
  selected,
  onChange,
}: {
  accessToken: string;
  selected: EncounterDiagnosisInput[];
  onChange: (diagnoses: EncounterDiagnosisInput[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Icd10Result[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDescription, setManualDescription] = useState("");
  const [manualReason, setManualReason] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    const timeout = setTimeout(() => {
      apiFetch<Icd10Result[]>(`/icd10?search=${encodeURIComponent(query)}`, { accessToken })
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

  function addDiagnosis(result: Icd10Result) {
    if (selected.some((d) => d.icd10Code === result.code)) return;
    const diagnosisType = selected.length === 0 ? "PRINCIPAL" : "SECONDARY";
    onChange([...selected, { icd10Code: result.code, description: result.description, diagnosisType, certainty: "CONFIRMED" }]);
    setQuery("");
    setResults([]);
  }

  function addManualDiagnosis() {
    if (manualDescription.trim().length === 0 || manualReason.trim().length < 10) return;
    const diagnosisType = selected.length === 0 ? "PRINCIPAL" : "SECONDARY";
    onChange([...selected, { codeAbsentReason: manualReason.trim(), description: manualDescription.trim(), diagnosisType, certainty: "CONFIRMED" }]);
    setManualDescription("");
    setManualReason("");
    setShowManualForm(false);
  }

  function removeDiagnosis(index: number) {
    onChange(selected.filter((_, i) => i !== index));
  }

  function makePrincipal(index: number) {
    onChange(selected.map((d, i) => ({ ...d, diagnosisType: i === index ? "PRINCIPAL" : "SECONDARY" })));
  }

  function toggleCertainty(index: number) {
    onChange(selected.map((d, i) => (i === index ? { ...d, certainty: d.certainty === "CONFIRMED" ? "SUSPECTED" : "CONFIRMED" } : d)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <TextInput
          placeholder="Buscar por código o descripción (CIE-10)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar diagnóstico CIE-10"
        />
        {query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-card">
            {isSearching ? (
              <p className="p-3 text-sm text-gray-500">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">Sin resultados para &quot;{query}&quot;.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => addDiagnosis(r)}
                  className="flex min-h-11 w-full flex-col items-start border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-100 last:border-0"
                >
                  <span className="text-base font-medium text-gray-900">{r.code}</span>
                  <span className="text-sm text-gray-500">{r.description}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {!showManualForm ? (
        <button type="button" onClick={() => setShowManualForm(true)} className="min-h-11 w-fit text-sm font-medium text-brand-700 underline">
          No tengo un código CIE-10 para este diagnóstico
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-gray-300 p-4">
          <p className="text-sm text-gray-500">
            El diagnóstico principal necesita un código CIE-10 (M8-RN-006). Usa esto solo cuando de verdad no aplique ninguno — se guarda con
            tu justificación como parte del expediente.
          </p>
          <TextInput
            placeholder="Descripción del diagnóstico"
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
            aria-label="Descripción del diagnóstico sin código CIE-10"
          />
          <Textarea
            placeholder="¿Por qué no hay código CIE-10? (mínimo 10 caracteres)"
            rows={2}
            value={manualReason}
            onChange={(e) => setManualReason(e.target.value)}
            aria-label="Razón por la que no hay código CIE-10"
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowManualForm(false);
                setManualDescription("");
                setManualReason("");
              }}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={manualDescription.trim().length === 0 || manualReason.trim().length < 10} onClick={addManualDiagnosis}>
              Agregar sin código
            </Button>
          </div>
        </div>
      )}

      {selected.length === 0 ? (
        <p className="text-sm text-gray-500">Sin diagnósticos agregados todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selected.map((d, index) => (
            <li key={`${d.icd10Code ?? "sin-codigo"}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-300 px-3 py-2">
              <div>
                {d.icd10Code ? (
                  <p className="text-base font-medium text-gray-900">
                    {d.icd10Code} — {d.description}
                  </p>
                ) : (
                  <>
                    <p className="text-base font-medium text-warn-700">Sin código CIE-10 — {d.description}</p>
                    <p className="text-sm text-gray-500">Razón: {d.codeAbsentReason}</p>
                  </>
                )}
                <p className="text-sm text-gray-500">
                  {d.diagnosisType === "PRINCIPAL" ? "Principal" : "Secundario"} · {d.certainty === "CONFIRMED" ? "Confirmado" : "Sospechado"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {d.diagnosisType !== "PRINCIPAL" && (
                  <button type="button" onClick={() => makePrincipal(index)} className="min-h-11 text-sm font-medium text-brand-700 underline">
                    Marcar principal
                  </button>
                )}
                <button type="button" onClick={() => toggleCertainty(index)} className="min-h-11 text-sm font-medium text-brand-700 underline">
                  {d.certainty === "CONFIRMED" ? "Marcar sospechado" : "Marcar confirmado"}
                </button>
                <Button type="button" variant="danger" onClick={() => removeDiagnosis(index)} className="min-h-11 px-3 text-sm">
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
