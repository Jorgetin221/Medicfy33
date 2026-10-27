import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";

// Auditoría 2026-10-21 (C-01). El token intermedio de MFA, el del visor
// de documentos y el de acceso se firmaban con el mismo secreto y sin
// audiencia, así que cualquiera de los tres pasaba como token de acceso.
// Cada propósito tiene ahora su propia llave (derivada de
// JWT_ACCESS_SECRET con HMAC, para no exigir variables nuevas), su
// propia claim `aud` y su propio esquema de payload: un token emitido
// para un propósito no verifica en ningún otro.
export type TokenPurpose = "access" | "mfa_pending" | "document_view";

const ALGORITHM = "HS256";

function mustGetBaseSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return secret;
}

function keyFor(purpose: TokenPurpose): Buffer {
  return createHmac("sha256", mustGetBaseSecret()).update(`medicfy-jwt:${purpose}`).digest();
}

export function signPurposeToken(purpose: TokenPurpose, payload: object, ttlSeconds: number): string {
  return jwt.sign(payload, keyFor(purpose), {
    algorithm: ALGORITHM,
    audience: purpose,
    expiresIn: ttlSeconds,
  });
}

/**
 * Verifica firma, vencimiento, algoritmo y audiencia, y valida el
 * payload con `schema`. Cualquier falla lanza; el llamador decide qué
 * error de dominio devuelve (siempre uno genérico).
 */
export function verifyPurposeToken<T extends z.ZodTypeAny>(
  purpose: TokenPurpose,
  token: string,
  schema: T
): z.infer<T> {
  const decoded = jwt.verify(token, keyFor(purpose), {
    algorithms: [ALGORITHM],
    audience: purpose,
  });
  return schema.parse(decoded);
}
