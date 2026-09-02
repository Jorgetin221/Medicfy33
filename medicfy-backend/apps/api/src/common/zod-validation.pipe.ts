import { HttpStatus, type PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";
import { ApiException } from "./api-exception";

export class ZodValidationPipe<T> implements PipeTransform {
  // ZodType<T, ZodTypeDef, unknown>, no ZodSchema<T> (= input defaults
  // to T): un esquema con .transform() (p. ej. query booleans "true"/
  // "false" -> boolean) tiene un tipo de ENTRADA distinto del de
  // salida, y transform() ya recibe `unknown` en tiempo de ejecución —
  // el input real llega crudo desde Express, nunca ya validado.
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException("VALIDATION_ERROR", "Datos de entrada inválidos.", HttpStatus.BAD_REQUEST, {
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
