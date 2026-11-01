// PR-EXP-07 (batería: "ningún OTP ni dato clínico en logs") / RE9 / R2:
// un error de Prisma trae en `message` los argumentos de la consulta
// (p. ej. nombre y fecha de nacimiento del paciente buscado). En logs
// solo viaja la clase del error y, si existe, su código (P2002…) —
// suficiente para diagnosticar sin exponer datos.
export function safeErrorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name} (${code})` : error.name;
}
