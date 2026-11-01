import { createHash, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// RESTRICCIÓN explícita de PR-EXP-03: el OTP se compara en tiempo
// constante. Ambos lados son siempre hex de SHA-256 (64 caracteres),
// así que el largo nunca filtra información por sí mismo — igual se
// valida por si algún día cambia el algoritmo.
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
