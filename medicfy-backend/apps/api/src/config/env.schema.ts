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
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
