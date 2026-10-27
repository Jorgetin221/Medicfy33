import type { CreateVideoRoomInput, VideoProviderPort, VideoRoom } from "./video-provider.port";

// Adaptador real contra la API REST de Daily.co (§4 de la
// especificación: "Daily.co o LiveKit Cloud, HIPAA-ready, sin
// construir WebRTC"). Mismo criterio que AtlasHttpAdapter: variables
// de entorno leídas de forma PEREZOSA (al llamar, no al construir),
// así sin ellas el resto de la app arranca y solo la teleconsulta se
// degrada a "no disponible".
const DEFAULT_API_BASE_URL = "https://api.daily.co/v1";

// Daily.co solo acepta [A-Za-z0-9_-] en el nombre de la sala — un UUID
// ya cumple eso; el prefijo evita chocar con cualquier sala creada a
// mano en la misma cuenta.
function roomNameFor(appointmentId: string): string {
  return `medicfy-${appointmentId}`;
}

export class DailyHttpError extends Error {
  constructor(
    public readonly status: number,
    // Sin el cuerpo de la respuesta de Daily.co: podría citar el
    // nombre de la sala (que incluye el appointmentId) en un log (R2).
    public readonly dailyErrorCode?: string
  ) {
    super(`Daily.co respondió ${status}${dailyErrorCode ? ` ${dailyErrorCode}` : ""}`);
  }
}

interface DailyConfig {
  apiKey: string;
  apiBaseUrl: string;
}

interface DailyRoomResponse {
  name: string;
  url: string;
}

// Sin @Injectable: SchedulingModule lo construye con useFactory, y el
// parámetro `http` existe solo para que las pruebas inyecten un fetch
// falso (mismo patrón que AtlasHttpAdapter).
export class DailyVideoProviderAdapter implements VideoProviderPort {
  constructor(private readonly http: typeof fetch = fetch) {}

  isConfigured(): boolean {
    return this.config() !== null;
  }

  async createRoom(input: CreateVideoRoomInput): Promise<VideoRoom> {
    const cfg = this.requireConfig();
    const name = roomNameFor(input.appointmentId);
    try {
      const room = await this.call(cfg, "POST", "/rooms", {
        name,
        privacy: "public",
        properties: {
          // M7: "Nunca grabar la consulta sin consentimiento expreso de
          // ambas partes." Medicfy no implementa ese consentimiento
          // todavía, así que la grabación queda bloqueada por completo,
          // no "apagada por defecto pero disponible".
          enable_recording: false,
          exp: Math.floor(input.expiresAt.getTime() / 1000),
        },
      });
      return { providerRef: room.name, roomUrl: room.url };
    } catch (error) {
      // La sala ya existe (reintento, o dos pestañas pidiendo el
      // enlace a la vez): Daily.co decide, igual que la restricción
      // EXCLUDE de la base de datos decide SLOT_TAKEN (M4-CA-001) — se
      // recupera la sala ya creada en vez de fallar.
      if (error instanceof DailyHttpError && error.status === 400) {
        const existing = await this.call(cfg, "GET", `/rooms/${encodeURIComponent(name)}`);
        return { providerRef: existing.name, roomUrl: existing.url };
      }
      throw error;
    }
  }

  private config(): DailyConfig | null {
    const { DAILY_API_KEY, DAILY_API_BASE_URL } = process.env;
    if (!DAILY_API_KEY) return null;
    return { apiKey: DAILY_API_KEY, apiBaseUrl: (DAILY_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "") };
  }

  private requireConfig(): DailyConfig {
    const cfg = this.config();
    if (!cfg) throw new Error("Daily.co no configurado");
    return cfg;
  }

  private async call(cfg: DailyConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<DailyRoomResponse> {
    const res = await this.http(`${cfg.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw await this.error(res);
    return (await res.json()) as DailyRoomResponse;
  }

  private async error(res: Response): Promise<DailyHttpError> {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return new DailyHttpError(res.status, body?.error);
  }
}
