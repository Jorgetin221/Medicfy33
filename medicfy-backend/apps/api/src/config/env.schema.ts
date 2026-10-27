import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  // The running app connects as the restricted medicfy_app role, never
  // as the schema owner. DATABASE_URL (owner) is used only by
  // `prisma migrate` / `prisma generate`, outside the app process.
  APP_DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  // Base64, must decode to exactly 32 bytes — validated again in
  // CryptoService. AES-256-GCM key for MFA secrets at rest
  // (M15-RN-004); KMS-backed rotation arrives with M15.
  MFA_SECRET_ENCRYPTION_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  // Sprint 5c: apps/web's own origin, for CORS. Separate from
  // APP_BASE_URL (that one is the API's own base URL, used to build
  // links like the assistant-invitation email — arguably should
  // point at the frontend too, flagged, not changed here to avoid
  // touching an already-shipped M1 env contract for an unrelated fix).
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  // A-16: cuántos proxies inversos hay delante del API (nginx = 1). Sin
  // valor: 1 en producción (siempre detrás de nginx), 0 en local.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
  // A-18: Swagger solo fuera de producción, salvo que se active aquí.
  ENABLE_API_DOCS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Fase 8 · Prompt 51 ("El Segundo Lector"). Opcional a propósito: el
  // resto de la aplicación arranca y sirve todo lo demás sin esta
  // clave — ClaudeModelAdapter la lee de forma perezosa y se degrada
  // ("no disponible") si falta, en vez de tumbar el proceso entero.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ASSISTANT_MODEL_ID: z.string().min(1).optional(),
  ASSISTANT_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // M12 (recordatorios de cita 24h/2h, BullMQ). Mismo patrón que
  // ANTHROPIC_API_KEY arriba: opcional a propósito — el resto de la
  // aplicación arranca y agenda/cancela/reagenda citas con
  // normalidad sin esto, solo el encolado de recordatorios se degrada
  // a "no disponible" (se registra en log, nunca tumba una operación
  // de agenda). Decisión explícita del usuario, 2026-09-08: construir
  // el productor/consumidor de verdad aunque no haya Redis real en
  // este entorno para probarlo end-to-end.
  REDIS_URL: z.string().min(1).optional(),
  // PENDIENTE(jorge): el tope de gasto por consulta es una decisión
  // de negocio/costos, no algo para inventar — ver el comentario en
  // AssistantPassOrchestratorService. Este default es solo un piso de
  // arranque conservador.
  ASSISTANT_MAX_TOKENS_PER_ENCOUNTER: z.coerce.number().int().positive().optional(),
  // v2.5 — Capa 1 de lectura de laboratorio: reutiliza
  // ANTHROPIC_API_KEY (misma clave, ClaudeLabOcrAdapter la lee de
  // forma perezosa igual que ClaudeModelAdapter) — sin variable de
  // credencial propia. Solo el tope de tiempo es específico de esta
  // llamada (visión + potencialmente muchos analitos).
  ASSISTANT_LAB_OCR_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Atlas Anatómico 3D (INTEGRATION_GUIDE.md del atlas). Mismo patrón
  // que ANTHROPIC_API_KEY: opcionales a propósito, AtlasHttpAdapter las
  // lee de forma perezosa y sin ellas solo el atlas se degrada a "no
  // disponible". ATLAS_CLIENT_SECRET nunca llega al navegador.
  ATLAS_API_URL: z.string().url().optional(),
  ATLAS_VIEWER_URL: z.string().url().optional(),
  ATLAS_CLIENT_ID: z.string().min(1).optional(),
  ATLAS_CLIENT_SECRET: z.string().min(1).optional(),
  // M7 (Teleconsulta, MVP). Mismo patrón que ANTHROPIC_API_KEY/ATLAS_*:
  // opcionales a propósito — DailyVideoProviderAdapter las lee de forma
  // perezosa y sin ellas solo "Iniciar teleconsulta" se degrada a "no
  // disponible", el resto de la cita funciona igual.
  DAILY_API_KEY: z.string().min(1).optional(),
  DAILY_API_BASE_URL: z.string().url().optional(),
});

export type Env = Omit<z.infer<typeof envSchema>, "TRUST_PROXY_HOPS"> & { TRUST_PROXY_HOPS: number };

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  const defaultHops = result.data.NODE_ENV === "production" ? 1 : 0;
  return { ...result.data, TRUST_PROXY_HOPS: result.data.TRUST_PROXY_HOPS ?? defaultHops };
}
