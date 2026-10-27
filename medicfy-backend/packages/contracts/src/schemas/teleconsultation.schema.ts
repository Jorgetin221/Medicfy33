import { z } from "zod";

// M7 (Teleconsulta, MVP — "la cita de modalidad en línea genera un
// enlace de videollamada de proveedor externo... No construimos
// WebRTC"). Igual que atlasSessionOutcomeSchema: el backend pide el
// enlace al proveedor y solo devuelve al navegador lo necesario para
// montarlo — una URL, nunca una credencial del proveedor.
export const teleconsultationRoomSchema = z.object({
  url: z.string().url(),
});
export type TeleconsultationRoom = z.infer<typeof teleconsultationRoomSchema>;

// Misma "degradación honesta" que el asistente/atlas: sin credenciales
// del proveedor, o si el proveedor falla, la pantalla lo dice y el
// resto de la consulta sigue funcionando.
export const teleconsultationRoomOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), room: teleconsultationRoomSchema }),
  z.object({ kind: z.literal("unavailable"), reason: z.enum(["NOT_CONFIGURED", "PROVIDER_ERROR"]) }),
]);
export type TeleconsultationRoomOutcome = z.infer<typeof teleconsultationRoomOutcomeSchema>;
