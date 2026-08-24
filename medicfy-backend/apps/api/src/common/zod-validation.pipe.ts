import { HttpStatus, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ApiException } from "./api-exception";

export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

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
