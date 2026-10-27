"use client";

import { useEffect, useState } from "react";
import type { EncounterDiagnosisInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

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
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Icd10Result[]>([]);
  // DOC-06: "consulta completa sin tocar el ratón" — el buscador se
  // navega con ↑/↓ y selecciona con Enter, como cualquier combobox.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDescription, setManualDescription] = useState("");

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
          if (!cancelled) {
            setResults(data);
            setHighlightedIndex(data.length > 0 ? 0 : -1);
          }
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
    if (manualDescription.trim().length === 0) return;
    const diagnosisType = selected.length === 0 ? "PRINCIPAL" : "SECONDARY";
    // Sin código CIE-10 basta la descripción (2026-10-17: sin cuadro de
    // justificación, a petición del usuario).
    onChange([...selected, { description: manualDescription.trim(), diagnosisType, certainty: "CONFIRMED" }]);
    setManualDescription("");
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
          placeholder={t("clinico.diagnosticoPicker.buscar")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              // Enter dentro del buscador SELECCIONA, nunca envía el
              // formulario de la nota.
              e.preventDefault();
              const target = results[highlightedIndex];
              if (target) addDiagnosis(target);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setQuery("");
              setResults([]);
            }
          }}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="icd10-results"
          aria-activedescendant={highlightedIndex >= 0 ? `icd10-option-${highlightedIndex}` : undefined}
          aria-label={t("clinico.diagnosticoPicker.buscarEtiqueta")}
        />
        {query.trim().length >= 2 && (
          <div id="icd10-results" role="listbox" className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-card">
            {isSearching ? (
              <p className="p-3 text-sm text-gray-500">{t("clinico.diagnosticoPicker.buscando")}</p>
            ) : results.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">{t("clinico.diagnosticoPicker.sinResultadosPara", { consulta: query })}</p>
            ) : (
              results.map((r, index) => (
                <button
                  key={r.code}
                  id={`icd10-option-${index}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  type="button"
                  onClick={() => addDiagnosis(r)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex min-h-11 w-full flex-col items-start border-b border-gray-100 px-3 py-2 text-left last:border-0 ${
                    index === highlightedIndex ? "bg-brand-100" : "hover:bg-gray-100"
                  }`}
                >
                  <span className="text-base font-medium text-gray-900">{r.code}</span>
                  <span className="text-base text-gray-500">{r.description}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {!showManualForm ? (
        <button type="button" onClick={() => setShowManualForm(true)} className="min-h-11 w-fit text-sm font-medium text-brand-700 underline">
          {t("clinico.diagnosticoPicker.sinCodigo")}
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-gray-300 p-4">
          <p className="text-sm text-gray-500">
            {t("clinico.diagnosticoPicker.sinCodigoAviso")}
          </p>
          <TextInput
            placeholder={t("clinico.diagnosticoPicker.descripcion")}
            value={manualDescription}
            onChange={(e) => setManualDescription(e.target.value)}
            aria-label={t("clinico.diagnosticoPicker.descripcionEtiqueta")}
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowManualForm(false);
                setManualDescription("");
              }}
            >
              {t("common.acciones.cancelar")}
            </Button>
            <Button type="button" disabled={manualDescription.trim().length === 0} onClick={addManualDiagnosis}>
              {t("clinico.diagnosticoPicker.agregarSinCodigo")}
            </Button>
          </div>
        </div>
      )}

      {selected.length === 0 ? (
        <p className="text-sm text-gray-500">{t("clinico.diagnosticoPicker.sinDiagnosticos")}</p>
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
                    <p className="text-base font-medium text-warn-600">Sin código CIE-10 — {d.description}</p>
                    {d.codeAbsentReason ? <p className="text-base text-gray-500">{t("clinico.diagnosticoPicker.razon", { razon: d.codeAbsentReason })}</p> : null}
                  </>
                )}
                <p className="text-sm text-gray-500">
                  {d.diagnosisType === "PRINCIPAL" ? "Principal" : "Secundario"} · {d.certainty === "CONFIRMED" ? "Confirmado" : "Sospechado"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {d.diagnosisType !== "PRINCIPAL" && (
                  <button type="button" onClick={() => makePrincipal(index)} className="min-h-11 text-sm font-medium text-brand-700 underline">
                    {t("clinico.diagnosticoPicker.marcarPrincipal")}
                  </button>
                )}
                <button type="button" onClick={() => toggleCertainty(index)} className="min-h-11 text-sm font-medium text-brand-700 underline">
                  {d.certainty === "CONFIRMED" ? "Marcar sospechado" : "Marcar confirmado"}
                </button>
                <Button type="button" variant="destructive" onClick={() => removeDiagnosis(index)} className="min-h-11 px-3 text-sm">
                  {t("common.acciones.quitar")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
