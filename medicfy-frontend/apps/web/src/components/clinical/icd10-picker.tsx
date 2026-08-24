"use client";

import { useEffect, useState } from "react";
import type { EncounterDiagnosisInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { TextInput } from "@/components/ui/field";
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

  function removeDiagnosis(code: string) {
    onChange(selected.filter((d) => d.icd10Code !== code));
  }

  function makePrincipal(code: string) {
    onChange(selected.map((d) => ({ ...d, diagnosisType: d.icd10Code === code ? "PRINCIPAL" : "SECONDARY" })));
  }

  function toggleCertainty(code: string) {
    onChange(selected.map((d) => (d.icd10Code === code ? { ...d, certainty: d.certainty === "CONFIRMED" ? "SUSPECTED" : "CONFIRMED" } : d)));
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

      {selected.length === 0 ? (
        <p className="text-sm text-gray-500">Sin diagnósticos agregados todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {selected.map((d) => (
            <li key={d.icd10Code} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-300 px-3 py-2">
              <div>
                <p className="text-base font-medium text-gray-900">
                  {d.icd10Code} — {d.description}
                </p>
                <p className="text-sm text-gray-500">
                  {d.diagnosisType === "PRINCIPAL" ? "Principal" : "Secundario"} · {d.certainty === "CONFIRMED" ? "Confirmado" : "Sospechado"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {d.diagnosisType !== "PRINCIPAL" && (
                  <button type="button" onClick={() => makePrincipal(d.icd10Code)} className="min-h-11 text-sm font-medium text-brand-700 underline">
                    Marcar principal
                  </button>
                )}
                <button type="button" onClick={() => toggleCertainty(d.icd10Code)} className="min-h-11 text-sm font-medium text-brand-700 underline">
                  {d.certainty === "CONFIRMED" ? "Marcar sospechado" : "Marcar confirmado"}
                </button>
                <Button type="button" variant="danger" onClick={() => removeDiagnosis(d.icd10Code)} className="min-h-11 px-3 text-sm">
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
