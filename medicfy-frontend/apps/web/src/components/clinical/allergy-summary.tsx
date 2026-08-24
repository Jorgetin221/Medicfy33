import type { PatientAllergy } from "@/lib/use-patient-clinical";
import { cn } from "@/lib/utils";

// CLAUDE.md §5: "el color nunca es el único portador de significado.
// Alergia = color + icono + texto" — toda alergia ACTIVE se trata como
// crítica (severity es texto libre del médico, no un enum con niveles
// que podamos inventar; mostrarla tal cual el médico la redactó es lo
// correcto, no intentar clasificarla en una escala que no existe).
export function AllergySummary({ allergies, compact = false }: { allergies: PatientAllergy[]; compact?: boolean }) {
  const active = allergies.filter((a) => a.status === "ACTIVE");

  if (active.length === 0) {
    return (
      <p className="flex items-center gap-2 text-base text-gray-500">
        <span aria-hidden="true">✓</span>
        Sin alergias activas registradas
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {active.map((allergy) => (
        <li
          key={allergy.id}
          role="alert"
          className={cn("rounded-md border border-critical-600 bg-critical-50 px-3 py-2", compact ? "text-sm" : "text-base")}
        >
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
