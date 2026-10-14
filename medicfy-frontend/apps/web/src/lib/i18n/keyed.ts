"use client";

import type { TranslateFn } from "./context";
import type { MessageKey } from "./dictionaries";

// Traduce un valor que viene del servidor (un enum: estado de cita,
// tipo de documento, rol…) a través de un mapa valor → clave.
//
// Existe para no sembrar `map[v]!` por todo el código: el servidor
// puede mandar un valor que el cliente todavía no conoce, y en ese
// caso se muestra el valor crudo en vez de dejar un hueco. El `!`
// además está prohibido por el eslint del proyecto.
export function translateKeyed(
  t: TranslateFn,
  map: Record<string, MessageKey | undefined>,
  value: string,
  fallback?: string
): string {
  const key = map[value];
  return key ? t(key) : (fallback ?? value);
}
