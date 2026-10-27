import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { z } from "zod";
import { verifyPurposeToken } from "./purpose-token.util";

// M15-RN-010: "Rate limiting por IP y por usuario en autenticación,
// búsqueda y descarga de archivos." La especificación no fija cifras
// concretas — interpretación operativa (sin más detalle en la
// documentación existente), documentada aquí en un solo lugar en vez
// de repetida por archivo, y fácil de ajustar el día que haya datos
// reales de tráfico para calibrarla. No es más estricta que lo común
// en la industria para estos tres tipos de endpoint (anti fuerza
// bruta en auth, anti scraping en búsqueda, anti abuso en descarga).
//
// getTrackerByIpAndUser (abajo; registrado en app.module.ts) combina IP + user_id
// cuando la ruta ya está autenticada, e IP sola en las rutas públicas
// de auth (login, registro) donde todavía no hay usuario resuelto —
// eso es exactamente "por IP y por usuario" del texto de la regla.
const ONE_MINUTE_MS = 60_000;

export const AuthThrottle = () => Throttle({ default: { limit: 10, ttl: ONE_MINUTE_MS } });
export const SearchThrottle = () => Throttle({ default: { limit: 30, ttl: ONE_MINUTE_MS } });
export const DownloadThrottle = () => Throttle({ default: { limit: 20, ttl: ONE_MINUTE_MS } });

// M15-RN-010: "por IP y por usuario". ThrottlerGuard está registrado
// como guard GLOBAL (APP_GUARD), y en Nest los guards globales corren
// ANTES que los de controlador/método — JwtAuthGuard (que llena
// request.user) todavía no se ejecutó cuando esto corre, así que no
// se puede depender de request.user aquí.
//
// A-01: antes se usaba jwt.decode() SIN verificar firma, y eso
// permitía evadir el límite inventando un `sub` distinto en cada
// petición (cada uno era una cubeta nueva). Ahora el token se VERIFICA
// (HMAC, barato) y solo un token de acceso válido agrega el usuario a
// la llave; cualquier otra cosa cae a "solo IP".
const trackerTokenSchema = z.object({ sub: z.string().uuid() });

export function getTrackerByIpAndUser(req: Record<string, unknown>): string {
  const request = req as unknown as Request;
  const ip = request.ip ?? "unknown-ip";
  const header = request.headers?.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return ip;
  try {
    const { sub } = verifyPurposeToken("access", token, trackerTokenSchema);
    return `${ip}:${sub}`;
  } catch {
    return ip;
  }
}
