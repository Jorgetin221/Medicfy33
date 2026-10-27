import { HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiException } from "./api-exception";

// Auditoría 2026-10-21 (A-14). CLAUDE.md §4: "Idempotencia obligatoria
// en creación de citas, recetas y pagos". El cliente genera una
// Idempotency-Key (UUID) por acción del usuario y la repite en cada
// reintento; el servidor la guarda en la fila con unicidad por médico.
const idempotencyKeySchema = z.string().uuid();

export function parseIdempotencyKey(header: string | string[] | undefined): string | undefined {
  if (header === undefined) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiException("VALIDATION_ERROR", "Idempotency-Key debe ser un UUID.", HttpStatus.BAD_REQUEST);
  }
  return parsed.data;
}

// P2002 sobre la llave (doctorId, idempotencyKey): dos solicitudes con
// la misma llave llegaron a la vez y la otra ya insertó.
export function isIdempotencyKeyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  return fields.some((field) => field.includes("idempotencyKey"));
}
