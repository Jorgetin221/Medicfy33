// Sprint 5c: thin fetch wrapper. credentials:"include" always — the
// refresh token travels as an httpOnly cookie (M1-RN-007), never
// touched directly by frontend code.
import { acceptLanguageHeader, getRuntimeLocale } from "./i18n/runtime-locale";
import { getDictionary } from "./i18n/dictionaries";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// Este módulo no es un componente y no puede usar useT(). Solo
// traduce los mensajes que genera ÉL (fallos de red, respuesta
// malformada); los del servidor llegan ya traducidos porque cada
// petición manda Accept-Language.
function msg(key: "sinConexion" | "formatoInesperado"): string {
  return getDictionary(getRuntimeLocale()).red[key];
}

// Pantallas de lista (Auditoría, Publicaciones...) tipan la respuesta
// como T[] por generics de TypeScript, que no validan nada en runtime.
// Si el servidor (o un mock, o un proxy intermedio) responde con una
// forma distinta a un arreglo, sin este guard la pantalla no cae en
// ninguna de sus 4 ramas de estado (ni null, ni error, ni .length) y
// se queda en blanco sin avisar — el peor resultado posible en una
// pantalla de auditoría. Úsalo en el .then() de cualquier fetch que
// se vaya a tratar como lista.
export function expectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    throw new ApiError("UNEXPECTED_SHAPE", msg("formatoInesperado"), 200, value);
  }
  return value as T[];
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
}

// El access token dura 15 min (token.service.ts, ACCESS_TOKEN_TTL_SECONDS)
// — más corto que una Historia Clínica completa (DOC-06, 12-15 min por
// diseño) o que cualquier sesión de "configurar disponibilidad + crear
// cita" con calma. Sin reintento transparente, cualquier flujo así
// termina en "Token inválido o expirado" a media tarea. AuthProvider
// registra estos dos callbacks una vez al montar — este módulo no es un
// componente de React y no puede leer/escribir el estado de accessToken
// directamente.
let onTokenRefreshed: ((token: string) => void) | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAuthRefreshHandlers(handlers: { onTokenRefreshed: (token: string) => void; onSessionExpired: () => void }): void {
  onTokenRefreshed = handlers.onTokenRefreshed;
  onSessionExpired = handlers.onSessionExpired;
}

// Deduplicado: si 3 llamadas fallan por token vencido casi al mismo
// tiempo, solo la primera dispara POST /auth/refresh; las otras dos
// esperan la misma promesa en vez de pedir 3 refresh tokens nuevos.
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Accept-Language": acceptLanguageHeader() },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string };
        return data.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

// Cómo se manda UNA petición con un token dado: cada función pública
// (JSON, subida, archivo) arma la suya; el reintento es común.
type SendWithToken = (token: string | null | undefined) => Promise<Response>;

function authHeaders(token: string | null | undefined): Record<string, string> {
  return {
    "Accept-Language": acceptLanguageHeader(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function sendOrNetworkError(send: SendWithToken, token: string | null | undefined): Promise<Response> {
  try {
    return await send(token);
  } catch {
    // Network failure (offline, DNS, server down) — distinct from a
    // real HTTP error response, so screens can show "sin conexión"
    // instead of a generic error (CLAUDE.md §5: cuatro estados).
    throw new ApiError("NETWORK_ERROR", msg("sinConexion"), 0);
  }
}

// Un solo reintento con un access token renovado. null = no hay
// sesión que renovar: el refresh token (cookie httpOnly, 30 días)
// también expiró. AuthProvider limpia accessToken a null, y cada
// pantalla ya redirige sola a /login cuando eso pasa.
async function resendWithFreshToken(send: SendWithToken): Promise<Response | null> {
  const freshToken = await refreshAccessToken();
  if (!freshToken) {
    onSessionExpired?.();
    return null;
  }
  onTokenRefreshed?.(freshToken);
  return sendOrNetworkError(send, freshToken);
}

async function readJsonBody(res: Response): Promise<unknown> {
  return res.headers.get("content-type")?.includes("application/json") ? res.json() : undefined;
}

// apiFetch y apiUpload: respuesta JSON, errores con el formato
// uniforme { error: { code, message, details } } del servidor.
async function requestJson<T>(send: SendWithToken, accessToken: string | null | undefined): Promise<T> {
  let res = await sendOrNetworkError(send, accessToken);
  let data = await readJsonBody(res);

  if (res.status === 401 && (data as ApiErrorBody | undefined)?.error?.code === "AUTH_INVALID_CREDENTIALS" && accessToken) {
    const retried = await resendWithFreshToken(send);
    if (retried) {
      res = retried;
      data = await readJsonBody(res);
    }
  }

  if (!res.ok) {
    const body = data as ApiErrorBody | undefined;
    throw new ApiError(body?.error?.code ?? "UNKNOWN_ERROR", body?.error?.message ?? res.statusText, res.status, body?.error?.details);
  }
  return data as T;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestJson<T>(
    (token) =>
      fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      }),
    options.accessToken
  );
}

// Perfil (Parte B §1.2/§5.1): subida de logo/firma visual. Sin
// Content-Type manual — el navegador arma el boundary de multipart.
export async function apiUpload<T>(path: string, file: File, options: { accessToken?: string | null } = {}): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  return requestJson<T>(
    (token) => fetch(`${API_BASE_URL}${path}`, { method: "POST", credentials: "include", headers: authHeaders(token), body: formData }),
    options.accessToken
  );
}

// Perfil: pide un archivo ya subido (logo/firma) como Blob. Un
// <img src> no puede mandar el header Authorization, así que la
// pantalla que lo use hace fetch autenticado → Blob → object URL.
// null = el archivo no existe (404).
export async function apiFetchBlob(path: string, options: { accessToken?: string | null } = {}): Promise<Blob | null> {
  const send: SendWithToken = (token) => fetch(`${API_BASE_URL}${path}`, { method: "GET", credentials: "include", headers: authHeaders(token) });

  let res = await sendOrNetworkError(send, options.accessToken);
  // Un archivo no trae cuerpo JSON con el código de error: cualquier
  // 401 con token se trata como token vencido.
  if (res.status === 401 && options.accessToken) {
    res = (await resendWithFreshToken(send)) ?? res;
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError("UNKNOWN_ERROR", res.statusText, res.status);
  }
  return res.blob();
}
