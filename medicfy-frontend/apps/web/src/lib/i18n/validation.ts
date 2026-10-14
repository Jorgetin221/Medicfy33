"use client";

import { useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver, FieldValues, FieldErrors } from "react-hook-form";
import type { ZodType } from "zod";
import { useI18n } from "./context";
import { getDictionary } from "./dictionaries";
import type { Locale } from "./config";

// Traduce un mensaje de validación emitido por @medicfy/contracts.
// Un mensaje sin entrada en el diccionario vuelve tal cual: la regla
// se sigue comunicando, solo que en español. Preferible a una cadena
// vacía — un campo marcado en rojo sin decir por qué es peor que un
// campo marcado en rojo en el idioma equivocado.
export function translateValidationMessage(locale: Locale, message: string | undefined): string | undefined {
  if (!message) return message;
  const table = getDictionary(locale).validacion as Record<string, string | undefined>;
  return table[message] ?? message;
}

export function useValidationMessage(): (message: string | undefined) => string | undefined {
  const { locale } = useI18n();
  return useCallback((message) => translateValidationMessage(locale, message), [locale]);
}

// Reemplazo directo de zodResolver(schema) en useForm(). Traduce los
// mensajes al vuelo, así que ningún formulario tiene que tocar sus
// `errors.campo?.message` uno por uno — y un formulario nuevo que use
// este resolver queda traducido sin trabajo extra.
export function useZodResolver<T extends FieldValues>(schema: ZodType<unknown>): Resolver<T> {
  const { locale } = useI18n();

  return useMemo(() => {
    const base = zodResolver(schema) as Resolver<T>;
    return async (values, context, options) => {
      const result = await base(values, context, options);
      // ResolverResult es una unión discriminada (éxito trae values y
      // errors vacío; fallo trae errors y values vacío). Un spread la
      // aplanaría, así que la rama de error se reconstruye entera.
      if (!result.errors || Object.keys(result.errors).length === 0) return result;
      return { values: {}, errors: translateErrorTree(locale, result.errors) as FieldErrors<T> };
    };
  }, [schema, locale]);
}

// El árbol de errores de react-hook-form no es plano: un
// useFieldArray (medicamentos de una receta, diagnósticos de una
// nota, bloques de disponibilidad) anida arreglos y objetos varios
// niveles. Traducir solo el primer nivel dejaría justo los
// formularios clínicos más largos a medio traducir, que es donde más
// importa entender por qué no deja firmar.
function translateErrorTree(locale: Locale, node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => translateErrorTree(locale, item));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  // `ref` apunta al nodo del DOM: copiarlo recursivamente lo rompería
  // (y no tiene nada que traducir).
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "ref") {
      out[key] = value;
    } else if (key === "message" && typeof value === "string") {
      out[key] = translateValidationMessage(locale, value);
    } else {
      out[key] = translateErrorTree(locale, value);
    }
  }
  return out;
}
