// Sprint 5c: thin fetch wrapper. credentials:"include" always — the
// refresh token travels as an httpOnly cookie (M1-RN-007), never
// touched directly by frontend code.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

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
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" });
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

async function doFetch(path: string, options: RequestOptions, token: string | null | undefined): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await doFetch(path, options, options.accessToken);
  } catch {
    // Network failure (offline, DNS, server down) — distinct from a
    // real HTTP error response, so screens can show "sin conexión"
    // instead of a generic error (CLAUDE.md §5: cuatro estados).
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }

  let contentType = res.headers.get("content-type");
  let data: unknown = contentType?.includes("application/json") ? await res.json() : undefined;

  const errorBody = data as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
  if (res.status === 401 && errorBody?.error?.code === "AUTH_INVALID_CREDENTIALS" && options.accessToken) {
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      onTokenRefreshed?.(freshToken);
      try {
        res = await doFetch(path, options, freshToken);
      } catch {
        throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
      }
      contentType = res.headers.get("content-type");
      data = contentType?.includes("application/json") ? await res.json() : undefined;
    } else {
      // El refresh token (cookie httpOnly, 30 días) también expiró o
      // ya no es válido — no hay nada que reintentar. AuthProvider
      // limpia accessToken a null, y cada pantalla ya redirige sola a
      // /login cuando eso pasa (mismo guard que usan todas).
      onSessionExpired?.();
    }
  }

  if (!res.ok) {
    const body = data as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    throw new ApiError(
      body?.error?.code ?? "UNKNOWN_ERROR",
      body?.error?.message ?? res.statusText,
      res.status,
      body?.error?.details
    );
  }

  return data as T;
}

// Perfil (Parte B §1.2/§5.1): subida de logo/firma visual. Sin
// Content-Type manual — el navegador arma el boundary de multipart.
// Mismo reintento-por-token-vencido que apiFetch — ver el comentario
// junto a setAuthRefreshHandlers.
export async function apiUpload<T>(path: string, file: File, options: { accessToken?: string | null } = {}): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  async function send(token: string | null | undefined): Promise<Response> {
    return fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  }

  let res: Response;
  try {
    res = await send(options.accessToken);
  } catch {
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }

  let contentType = res.headers.get("content-type");
  let data: unknown = contentType?.includes("application/json") ? await res.json() : undefined;

  const errorBody = data as { error?: { code?: string } } | undefined;
  if (res.status === 401 && errorBody?.error?.code === "AUTH_INVALID_CREDENTIALS" && options.accessToken) {
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      onTokenRefreshed?.(freshToken);
      try {
        res = await send(freshToken);
      } catch {
        throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
      }
      contentType = res.headers.get("content-type");
      data = contentType?.includes("application/json") ? await res.json() : undefined;
    } else {
      onSessionExpired?.();
    }
  }

  if (!res.ok) {
    const body = data as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    throw new ApiError(body?.error?.code ?? "UNKNOWN_ERROR", body?.error?.message ?? res.statusText, res.status, body?.error?.details);
  }

  return data as T;
}

// Perfil: pide un archivo ya subido (logo/firma) como Blob. Un
// <img src> no puede mandar el header Authorization, así que la
// pantalla que lo use hace fetch autenticado → Blob → object URL.
export async function apiFetchBlob(path: string, options: { accessToken?: string | null } = {}): Promise<Blob | null> {
  async function send(token: string | null | undefined): Promise<Response> {
    return fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  let res: Response;
  try {
    res = await send(options.accessToken);
  } catch {
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }

  if (res.status === 401 && options.accessToken) {
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      onTokenRefreshed?.(freshToken);
      try {
        res = await send(freshToken);
      } catch {
        throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
      }
    } else {
      onSessionExpired?.();
    }
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError("UNKNOWN_ERROR", res.statusText, res.status);
  }
  return res.blob();
}
