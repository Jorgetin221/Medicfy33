"use client";

import type { PatientAllergy } from "@/lib/use-patient-clinical";
import { useT } from "@/lib/i18n/context";

// Auditoría 2026-10-21 (C-04): una lista vacía NO significa "sin
// alergias" — puede significar "todavía no llega" o "falló la carga".
// El llamador declara cuál de los tres es, y "Sin alergias activas
// registradas" solo se pinta con una respuesta del servidor confirmada.
export type AllergyLoadState = "loading" | "error" | "ready";

// CLAUDE.md §5: "el color nunca es el único portador de significado.
// Alergia = color + icono + texto" — toda alergia ACTIVE se trata como
// crítica (severity es texto libre del médico, no un enum con niveles
// que podamos inventar; mostrarla tal cual el médico la redactó es lo
// correcto, no intentar clasificarla en una escala que no existe).
// Texto clínico siempre ≥16 px (text-base), también en la columna de
// DOC-06 (A-22).
export function AllergySummary({
  allergies,
  loadState,
  onRetry,
}: {
  allergies: PatientAllergy[];
  loadState: AllergyLoadState;
  onRetry?: (() => void) | undefined;
}) {
  const t = useT();

  if (loadState === "error") {
    return (
      <div role="alert" className="rounded-md border border-critical-600 bg-critical-50 px-3 py-2 text-base">
        <p className="flex items-center gap-2 font-semibold text-critical-600">
          <span aria-hidden="true">⚠</span>
          {t("clinico.alergias.errorTitulo")}
        </p>
        <p className="mt-0.5 text-gray-700">{t("clinico.alergias.errorCuerpo")}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-11 rounded-md border border-gray-300 bg-white px-3 text-base font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {t("clinico.alergias.reintentar")}
          </button>
        ) : null}
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <p role="status" className="text-base text-gray-500">
        {t("clinico.alergias.cargando")}
      </p>
    );
  }

  const active = allergies.filter((a) => a.status === "ACTIVE");

  if (active.length === 0) {
    return (
      <p className="flex items-center gap-2 text-base text-gray-500">
        <span aria-hidden="true">✓</span>
        {t("clinico.alergias.sinActivas")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {active.map((allergy) => (
        <li key={allergy.id} role="alert" className="rounded-md border border-critical-600 bg-critical-50 px-3 py-2 text-base">
          <p className="flex items-center gap-2 font-semibold text-critical-600">
            <span aria-hidden="true">⚠</span>
            {allergy.substance}
          </p>
          <p className="mt-0.5 text-gray-700">
            {allergy.severity}
            {allergy.reaction ? ` — ${allergy.reaction}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
