import { tokenPrimaryRole } from "./jwt-claims";

// M-31 (auditoría 2026-10-21): no había protección por rol en el
// frontend — un PACIENTE o un ADMIN entraba a /agenda con el menú de
// médico. No es una barrera de seguridad (el servidor valida cada
// petición: CareRelationshipGuard, AdminGuard); es que cada rol vea
// solo las pantallas que le corresponden y aterrice en la suya.
const ADMIN_ROLES = new Set(["ADMIN", "SUPERADMIN"]);
const PRACTICE_ROLES = new Set(["DOCTOR", "ASSISTANT"]);

export function homeRouteForRole(role: string | null): string {
  if (role === "PATIENT") return "/mi-cuenta";
  if (role && ADMIN_ROLES.has(role)) return "/admin";
  return "/agenda";
}

export function isAppRouteAllowed(role: string | null, pathname: string): boolean {
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  if (role === "PATIENT") return false; // su área es /mi-cuenta, fuera de este grupo
  if (role !== null && ADMIN_ROLES.has(role)) return isAdminRoute;
  if (role !== null && PRACTICE_ROLES.has(role)) return !isAdminRoute;
  return true; // sin rol legible u otros roles (curador, soporte): decide el servidor
}

// M-22: "?redirect=//evil.com" pasaba el chequeo startsWith("/") y el
// navegador lo trata como URL absoluta de otro dominio. Solo se acepta
// una ruta interna de un solo "/" inicial, sin "\" ni esquema.
export function safeInternalRedirect(target: string | null): string | null {
  if (!target) return null;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return null;
  if (/[\\\u0000-\u001f]/.test(target)) return null;
  return target;
}

export function landingRouteFor(accessToken: string, redirectTo: string | null): string {
  return safeInternalRedirect(redirectTo) ?? homeRouteForRole(tokenPrimaryRole(accessToken));
}
