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

// Igual de no-autoritativo que tokenSubject: solo para decidir si el
// rail de navegación muestra el ícono de Admin. Un usuario sin este
// rol que llegue igual a /admin recibe 403 del AdminGuard del backend.
export function tokenPrimaryRole(accessToken: string | null): string | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { primaryRole?: string };
    return json.primaryRole ?? null;
  } catch {
    return null;
  }
}
