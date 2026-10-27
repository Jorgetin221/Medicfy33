import type { Response } from "express";

export const REFRESH_COOKIE_NAME = "medicfy_refresh_token";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// M1-RN-007: refresh token lives in an httpOnly cookie, never in the
// JSON body — spec §4.3 "refresh rotativo en cookie httpOnly".
//
// Bug real encontrado en Sprint 5c: path apuntaba a "/api/v1/auth",
// pero la API nunca tuvo un prefijo global (main.ts no llama
// setGlobalPrefix) — las rutas reales son /auth/*. Un navegador real
// nunca adjunta la cookie a una ruta que no cae bajo su path, así que
// POST /auth/refresh siempre llegaba sin cookie y devolvía 401. Los
// tests de M1 no lo detectaron porque reenvían el header Set-Cookie a
// mano (ver m1.integration.spec.ts), sin el scoping por path que sí
// aplica un navegador real — exactamente la clase de bug que solo
// aparece al probar con un navegador de verdad.
//
// sameSite "strict" → "lax": esta cookie solo la lee fetch()/XHR del
// propio SPA (nunca una navegación de nivel superior), así que "lax"
// no debilita su protección real contra CSRF. Se cambió tras
// verificar con curl+cookie-jar que el servidor emite y acepta la
// cookie correctamente de punta a punta — el navegador real de
// verificación seguía sin adjuntarla con "strict" entre localhost:3000
// y localhost:3001.
// M-06: antes la cookie solo era Secure si NODE_ENV === "production";
// un despliegue con NODE_ENV mal puesto la mandaba por HTTP en claro.
// Ahora es Secure siempre, salvo cuando el propio API corre en
// localhost por http (desarrollo y pruebas).
function isLocalHttp(): boolean {
  const base = process.env.APP_BASE_URL ?? "";
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(base);
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isLocalHttp(),
    sameSite: "lax",
    maxAge: THIRTY_DAYS_MS,
    path: "/auth",
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
}
