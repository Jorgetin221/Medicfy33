import { createHash } from "node:crypto";

// M8-CA-004/M9-CA-006: hash del contenido firmado, encadenado con el
// anterior — alterar una fila en base de datos directamente rompe la
// cadena. Serialización canónica simple (JSON.stringify de un objeto
// ya ordenado por el llamador) — suficiente para detectar alteración,
// no pretende ser un formato de interoperabilidad.
export function sha256Hex(input: unknown): string {
  const canonical = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(canonical).digest("hex");
}
