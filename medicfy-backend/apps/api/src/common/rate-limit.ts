import { Throttle } from "@nestjs/throttler";

// M15-RN-010: "Rate limiting por IP y por usuario en autenticación,
// búsqueda y descarga de archivos." La especificación no fija cifras
// concretas — interpretación operativa (sin más detalle en la
// documentación existente), documentada aquí en un solo lugar en vez
// de repetida por archivo, y fácil de ajustar el día que haya datos
// reales de tráfico para calibrarla. No es más estricta que lo común
// en la industria para estos tres tipos de endpoint (anti fuerza
// bruta en auth, anti scraping en búsqueda, anti abuso en descarga).
//
// getTrackerByIpAndUser (ver app.module.ts) combina IP + user_id
// cuando la ruta ya está autenticada, e IP sola en las rutas públicas
// de auth (login, registro) donde todavía no hay usuario resuelto —
// eso es exactamente "por IP y por usuario" del texto de la regla.
const ONE_MINUTE_MS = 60_000;

export const AuthThrottle = () => Throttle({ default: { limit: 10, ttl: ONE_MINUTE_MS } });
export const SearchThrottle = () => Throttle({ default: { limit: 30, ttl: ONE_MINUTE_MS } });
export const DownloadThrottle = () => Throttle({ default: { limit: 20, ttl: ONE_MINUTE_MS } });
