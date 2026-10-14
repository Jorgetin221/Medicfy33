// Idioma de la RESPUESTA. El servidor no guarda preferencia de
// idioma: la toma del header Accept-Language que manda el cliente en
// cada petición (apps/web lo pone desde la cookie del navegador).
//
// IMPORTANTE: esto solo afecta el `message` que viaja al cliente. No
// toca nada de lo que se persiste: el expediente, la receta, la orden
// de laboratorio y el audit_log se guardan y se emiten SIEMPRE en
// español — son documentos con validez legal bajo NOM-004 y el art.
// 33 del Reglamento de Insumos para la Salud (R6).
export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// Accept-Language en su forma real: "en-US, es-MX;q=0.8". Se ordena
// por q (1.0 por omisión) y gana el primero que sepamos hablar. Un
// header ausente o ilegible cae a español, nunca a un idioma que
// nadie pidió.
export function parseAcceptLanguage(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: (tag ?? "").trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((c) => c.tag.length > 0 && c.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    // "en-US" y "en" cuentan igual: solo distinguimos el idioma base.
    const base = tag.split("-")[0] ?? "";
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}
