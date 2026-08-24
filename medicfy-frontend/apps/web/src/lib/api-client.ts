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

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    // Network failure (offline, DNS, server down) — distinct from a
    // real HTTP error response, so screens can show "sin conexión"
    // instead of a generic error (CLAUDE.md §5: cuatro estados).
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }

  const contentType = res.headers.get("content-type");
  const data: unknown = contentType?.includes("application/json") ? await res.json() : undefined;

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
export async function apiUpload<T>(path: string, file: File, options: { accessToken?: string | null } = {}): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {},
      body: formData,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }

  const contentType = res.headers.get("content-type");
  const data: unknown = contentType?.includes("application/json") ? await res.json() : undefined;

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
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {},
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError("UNKNOWN_ERROR", res.statusText, res.status);
  }
  return res.blob();
}
