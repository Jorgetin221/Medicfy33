// Rutas con punto ("pacientes.vacio.titulo") derivadas del diccionario
// español, que es el canónico. Si te equivocas al escribir una clave,
// o borras una del diccionario y queda una llamada huérfana, esto lo
// convierte en un error de compilación en vez de en un "pacientes.
// vacio.titulo" impreso en pantalla delante de un médico.
export type TranslationKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${TranslationKey<T[K]>}`;
}[keyof T & string];

// Valores que se pueden interpolar en {marcadores}.
export type TranslationParams = Record<string, string | number>;

// Reemplaza {nombre} por el valor correspondiente. Un marcador sin
// valor se deja tal cual: es más fácil de detectar en pantalla que
// una cadena vacía, que se lee como un bug de datos.
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

// Resuelve "a.b.c" dentro del diccionario. Devuelve la clave misma si
// no existe — visible en pantalla y en pruebas, nunca un undefined
// que reviente el render de una pantalla clínica.
export function lookup(dictionary: unknown, key: string): string {
  let current: unknown = dictionary;
  for (const segment of key.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : key;
}
