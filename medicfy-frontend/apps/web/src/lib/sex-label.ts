import type { TranslateFn } from "./i18n/context";

// B-13 (auditoría 2026-10-21): `sexAtBirth === "F" ? mujer : hombre`
// mostraba como "Hombre" cualquier valor que no fuera "F" (un dato
// faltante o uno nuevo del servidor). Solo F y M tienen etiqueta; lo
// demás se muestra como no registrado.
export function sexAtBirthLabel(t: TranslateFn, sexAtBirth: string | null | undefined): string {
  if (sexAtBirth === "F") return t("pacientes.mujer");
  if (sexAtBirth === "M") return t("pacientes.hombre");
  return "—";
}
