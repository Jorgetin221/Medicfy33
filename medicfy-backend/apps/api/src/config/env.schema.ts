import { z } from "zod";

export const envSchema = z.object({
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
  // Fase 8 · Prompt 51 ("El Segundo Lector"). Opcional a propósito: el
  // resto de la aplicación arranca y sirve todo lo demás sin esta
  // clave — ClaudeModelAdapter la lee de forma perezosa y se degrada
  // ("no disponible") si falta, en vez de tumbar el proceso entero.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ASSISTANT_MODEL_ID: z.string().min(1).optional(),
  ASSISTANT_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // PENDIENTE(jorge): el tope de gasto por consulta es una decisión
  // de negocio/costos, no algo para inventar — ver el comentario en
  // AssistantPassOrchestratorService. Este default es solo un piso de
  // arranque conservador.
  ASSISTANT_MAX_TOKENS_PER_ENCOUNTER: z.coerce.number().int().positive().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
