import { randomUUID } from "node:crypto";

// M5-RN-007: "/dr/{slug}" — el enlace público del médico. Se genera
// una sola vez al registrarse (auth.service.ts), a partir del nombre
// LEGAL (siempre presente, a diferencia de displayName que puede
// faltar) — nunca editable por el médico en este pase.
export function slugifyName(firstName: string, lastName: string): string {
  const base = `${firstName} ${lastName}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita acentos/diacríticos (Unicode property escape, sin literales combinantes en el fuente)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return base || "medico";
}

// Sufijo corto derivado de un UUID real — suficiente entropía
// (36^6 ~= 2 mil millones de combinaciones) para que una colisión con
// otro médico del mismo nombre sea prácticamente imposible sin
// necesitar un bucle de reintento contra la base de datos.
export function randomSlugSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 6);
}

export function generateDoctorSlug(firstName: string, lastName: string): string {
  return `${slugifyName(firstName, lastName)}-${randomSlugSuffix()}`;
}
