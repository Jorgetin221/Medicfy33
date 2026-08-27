// Lee el `sub` del access token SOLO como clave de preferencia de UI
// (p. ej. "qué pestaña de la Zona 3 dejó abierta este médico"). No es
// verificación: la autoridad del token la valida el servidor siempre.
export function tokenSubject(accessToken: string | null): string {
  if (!accessToken) return "anon";
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
    return json.sub ?? "anon";
  } catch {
    return "anon";
  }
}
