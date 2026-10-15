import type { AtlasApiPort, AtlasRemoteSession, CreateAtlasSessionInput } from "./atlas-api.port";

// Adaptador real contra la API del atlas. Porta lo mínimo de
// @atlas/integration-sdk (AtlasClient): ese paquete vive en otro repo
// sin publicar, y aquí solo hacen falta tres llamadas — mismo criterio
// que packages/contracts, copia propia en vez de dependencia cruzada.
//
// Variables leídas de forma PEREZOSA (al llamar, no al construir), como
// ClaudeModelAdapter: sin ellas la app arranca y solo el atlas se
// degrada a "no disponible".
const EXTERNAL_SYSTEM = "medicfy";
// INTEGRATION_GUIDE §3: el visor puede leer hallazgos y leer/escribir
// anotaciones. findings:write (confirmar lateralidad en el visor) queda
// fuera hasta que se decida cómo se elige el lado — ver plan
// 20261014-atlas-anatomico-3d.md.
const SESSION_PERMISSIONS = ["findings:read", "annotations:read", "annotations:write"];
// El SDK renueva el token 30 s antes de vencer; mismo margen aquí.
const TOKEN_RENEWAL_MARGIN_MS = 30_000;

export class AtlasHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string
  ) {
    // Sin el mensaje del atlas: podría citar datos de la petición y
    // este error termina en logs (R2).
    super(`Atlas respondió ${status} ${code}`);
  }
}

interface AtlasConfig {
  apiUrl: string;
  viewerUrl: string;
  clientId: string;
  clientSecret: string;
  hostOrigin: string;
}

// Sin @Injectable: AtlasModule lo construye con useFactory, y el
// parámetro `http` existe solo para que las pruebas inyecten un fetch falso.
export class AtlasHttpAdapter implements AtlasApiPort {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly http: typeof fetch = fetch) {}

  isConfigured(): boolean {
    return this.config() !== null;
  }

  viewerUrl(): string {
    return this.requireConfig().viewerUrl;
  }

  async createSession(input: CreateAtlasSessionInput): Promise<AtlasRemoteSession> {
    const cfg = this.requireConfig();
    const link = await this.call<{ id: string }>(cfg, "/api/v1/patient-links", {
      externalSystem: EXTERNAL_SYSTEM,
      externalPatientId: input.externalPatientId,
    });
    return this.call<AtlasRemoteSession>(cfg, "/api/v1/viewer-sessions", {
      patientId: link.id,
      practitionerRef: input.practitionerRef,
      mode: "clinician",
      permissions: SESSION_PERMISSIONS,
      // Origen exacto de la página que incrusta el visor: el atlas
      // rechaza el canje del launchCode desde cualquier otro.
      origin: cfg.hostOrigin,
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.call(this.requireConfig(), `/api/v1/viewer-sessions/${encodeURIComponent(sessionId)}/revoke`);
  }

  private config(): AtlasConfig | null {
    const { ATLAS_API_URL, ATLAS_VIEWER_URL, ATLAS_CLIENT_ID, ATLAS_CLIENT_SECRET } = process.env;
    if (!ATLAS_API_URL || !ATLAS_VIEWER_URL || !ATLAS_CLIENT_ID || !ATLAS_CLIENT_SECRET) return null;
    return {
      apiUrl: ATLAS_API_URL.replace(/\/+$/, ""),
      viewerUrl: ATLAS_VIEWER_URL,
      clientId: ATLAS_CLIENT_ID,
      clientSecret: ATLAS_CLIENT_SECRET,
      hostOrigin: new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000").origin,
    };
  }

  private requireConfig(): AtlasConfig {
    const cfg = this.config();
    if (!cfg) throw new Error("Atlas no configurado");
    return cfg;
  }

  private async accessToken(cfg: AtlasConfig): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_RENEWAL_MARGIN_MS > Date.now()) return this.token.value;
    const res = await this.http(`${cfg.apiUrl}/api/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret }),
    });
    if (!res.ok) throw await this.error(res);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  private async call<T>(cfg: AtlasConfig, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.accessToken(cfg)}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this.http(`${cfg.apiUrl}${path}`, {
      method: "POST",
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw await this.error(res);
    return (await res.json()) as T;
  }

  private async error(res: Response): Promise<AtlasHttpError> {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; request_id?: string } } | null;
    return new AtlasHttpError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.request_id);
  }
}
