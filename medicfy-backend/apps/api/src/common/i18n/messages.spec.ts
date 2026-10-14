import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAcceptLanguage } from "./locale";
import { translateMessage } from "./translate";

const SRC_ROOT = join(__dirname, "..", "..");

function allSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return allSourceFiles(full);
    return entry.endsWith(".ts") && !entry.includes(".spec.") ? [full] : [];
  });
}

// Parser de argumentos, no regex: el 3.er argumento de ApiException a
// veces es `HttpStatus.X` y a veces una constante del módulo, y la
// primera versión de esta prueba — que exigía `HttpStatus.` — dejó
// pasar en silencio los 10 mensajes de autenticación. Contar paréntesis
// y comillas es la única forma de leer una llamada de verdad.
function callArguments(src: string, openParen: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = openParen; i < src.length; i += 1) {
    const char = src[i] as string;
    if (inString) {
      current += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      if (depth === 1 && char === "(") continue;
      current += char;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        args.push(current.trim());
        return args;
      }
      current += char;
      continue;
    }
    if (char === "," && depth === 1) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  return args;
}

function staticMessagesInSource(): { message: string; file: string }[] {
  const found: { message: string; file: string }[] = [];
  for (const file of allSourceFiles(SRC_ROOT)) {
    const text = readFileSync(file, "utf8");
    let from = 0;
    for (;;) {
      const at = text.indexOf("new ApiException(", from);
      if (at < 0) break;
      const args = callArguments(text, at + "new ApiException".length);
      const message = args[1]?.trim() ?? "";
      // Solo los literales con comillas dobles: los construidos con
      // plantilla se cubren por patrón y no se pueden leer así.
      if (message.startsWith('"') && message.endsWith('"') && message.length > 1) {
        found.push({ message: JSON.parse(message) as string, file: file.slice(SRC_ROOT.length + 1) });
      }
      from = at + 1;
    }
  }
  return found;
}

describe("i18n de los mensajes de error de la API", () => {
  // Esta es la prueba que importa: si alguien agrega un ApiException
  // nuevo y olvida traducirlo, la suite falla y nombra el archivo. Sin
  // ella la tabla se queda atrás en silencio y el médico ve media
  // pantalla en inglés y media en español.
  it("traduce TODOS los mensajes literales que lanza la API", () => {
    const sinTraducir = staticMessagesInSource()
      .filter(({ message }) => translateMessage(message, "en") === message)
      .map(({ message, file }) => `${file}: "${message}"`);

    expect(sinTraducir).toEqual([]);
  });

  it("encuentra mensajes reales — si el extractor se rompe, esta prueba avisa antes que la de arriba", () => {
    expect(staticMessagesInSource().length).toBeGreaterThan(150);
  });

  it("deja el español intacto", () => {
    expect(translateMessage("Paciente no encontrado.", "es")).toBe("Paciente no encontrado.");
  });

  it("devuelve el español cuando no hay traducción, nunca una cadena vacía", () => {
    expect(translateMessage("Mensaje que nadie tradujo todavía.", "en")).toBe("Mensaje que nadie tradujo todavía.");
  });

  it("traduce los mensajes con valores interpolados sin tocar el valor", () => {
    expect(translateMessage('La especialidad "CARDIOLOGIA" no existe.', "en")).toBe('Specialty "CARDIOLOGIA" does not exist.');
    expect(translateMessage("Código(s) CIE-10 inexistentes en el catálogo: E11.9, I10.", "en")).toBe(
      "ICD-10 code(s) not present in the catalog: E11.9, I10."
    );
  });
});

describe("Accept-Language", () => {
  it("elige el idioma de mayor q que sabemos hablar", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(parseAcceptLanguage("es-MX,es;q=0.9")).toBe("es");
    expect(parseAcceptLanguage("en-US, es-MX;q=0.8")).toBe("en");
  });

  it("cae a español ante un header ausente, vacío o de un idioma que no hablamos", () => {
    expect(parseAcceptLanguage(undefined)).toBe("es");
    expect(parseAcceptLanguage("")).toBe("es");
    expect(parseAcceptLanguage("fr-FR,de;q=0.9")).toBe("es");
  });

  it("ignora un idioma con q=0 aunque venga primero", () => {
    expect(parseAcceptLanguage("en;q=0,es")).toBe("es");
  });
});
