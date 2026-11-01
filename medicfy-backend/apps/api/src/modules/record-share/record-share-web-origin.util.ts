// Origen del frontend para los enlaces que salen del track
// (autorizar, revocar, avisos a médicos). Antes estaba repetido en
// tres servicios; uno solo aquí (Boyscout, PR-EXP-07).
export function recordShareWebOrigin(): string {
  return process.env.WEB_ORIGIN ?? "http://localhost:3000";
}
