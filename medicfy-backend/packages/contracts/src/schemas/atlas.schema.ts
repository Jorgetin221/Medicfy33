import { z } from "zod";

// Atlas Anatómico 3D (INTEGRATION_GUIDE.md del atlas, §2–§4). El
// backend de Medicfy pide la sesión al atlas y devuelve al navegador
// SOLO lo necesario para montar el visor: el launchCode de un solo uso
// (60 s) y la URL del visor. El secreto del cliente nunca sale del
// servidor.
export const atlasViewerSessionSchema = z.object({
  id: z.string(),
  launchCode: z.string(),
  launchCodeExpiresAt: z.string(),
  expiresAt: z.string(),
  viewerUrl: z.string().url(),
  mode: z.enum(["clinician", "education"]),
});
export type AtlasViewerSession = z.infer<typeof atlasViewerSessionSchema>;

// Mismo patrón de "degradación honesta" que el asistente: si el atlas
// no está configurado o no responde, la pantalla lo dice y el resto
// del expediente sigue funcionando.
export const atlasSessionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), session: atlasViewerSessionSchema }),
  z.object({ kind: z.literal("unavailable"), reason: z.enum(["NOT_CONFIGURED", "ATLAS_ERROR"]) }),
]);
export type AtlasSessionOutcome = z.infer<typeof atlasSessionOutcomeSchema>;
