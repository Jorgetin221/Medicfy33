import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PR-EXP-07 — batería de seguridad, lado web: "ningún dato personal en
// URL ni query string (inspección de las rutas generadas)". Recorre
// todas las rutas y fuentes del track y verifica que (1) los segmentos
// dinámicos solo son identificadores opacos/tokens, (2) ninguna
// llamada a la API ni navegación lleva query string, y (3) nadie lee
// parámetros de búsqueda (useSearchParams) para datos del paciente.
const APP = path.resolve(__dirname, "..");
const TRACK_DIRS = [
  path.join(APP, "expediente-compartido"),
  path.join(APP, "(app)", "expediente-compartido"),
  path.join(APP, "(app)", "admin", "expediente-compartido"),
];
const TRACK_FILES = [path.join(APP, "(app)", "pacientes", "[id]", "tab-compartido.tsx")];
const ALLOWED_DYNAMIC_SEGMENTS = new Set(["[token]", "[grantId]", "[id]"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? [full, ...walk(full)] : [full];
  });
}

const entries = TRACK_DIRS.flatMap(walk);
const sources = [...entries.filter((f) => /\.tsx?$/.test(f) && !/\.spec\.tsx?$/.test(f)), ...TRACK_FILES];

describe("expediente compartido — URLs sin datos personales", () => {
  it("los segmentos dinámicos de ruta son solo token o identificadores opacos", () => {
    const dynamic = entries.map((f) => path.basename(f)).filter((name) => name.startsWith("["));
    expect(dynamic.length).toBeGreaterThan(0);
    for (const segment of dynamic) expect(ALLOWED_DYNAMIC_SEGMENTS.has(segment), segment).toBe(true);
  });

  it("ninguna llamada a la API ni navegación del track lleva query string", () => {
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      const urls = text.match(/[`"']\/(record-share|admin\/record-share|expediente-compartido|pacientes)[^`"']*[`"']/g) ?? [];
      for (const url of urls) expect(url, `${path.relative(APP, file)}: ${url}`).not.toContain("?");
      expect(text, path.relative(APP, file)).not.toMatch(/useSearchParams|URLSearchParams|searchParams/);
    }
  });
});
