import type { CreateVideoRoomInput, VideoProviderPort, VideoRoom } from "./video-provider.port";

// Pedido explícito del usuario (2026-10-27): Daily.co pide tarjeta de
// crédito para seguir aunque el uso quepa en su tier gratuito —
// SchedulingModule usa este adaptador cuando no hay DAILY_API_KEY, en
// vez de degradar la teleconsulta a "no disponible" (ver
// scheduling.module.ts). Jitsi Meet público (meet.jit.si, operado por
// 8x8): gratis, sin API key, sin tarjeta, sin llamada HTTP que hacer —
// el cuarto nace solo cuando el primer participante entra a la URL.
// Mismo nombre determinista de sala que DailyVideoProviderAdapter.
//
// PENDIENTE(jorge): meet.jit.si es el servidor PÚBLICO de la
// comunidad — no es HIPAA-ready, no hay BAA con 8x8 (la especificación
// §4 pide Daily.co o LiveKit Cloud, HIPAA-ready). Sirve como fallback
// gratuito de desarrollo/pruebas; para producción con pacientes reales
// hace falta Daily.co con tarjeta o un Jitsi autoalojado con el
// acuerdo correspondiente.
const JITSI_BASE_URL = "https://meet.jit.si";

function roomNameFor(appointmentId: string): string {
  return `medicfy-${appointmentId}`;
}

export class JitsiVideoProviderAdapter implements VideoProviderPort {
  // Sin credenciales que leer: siempre "configurado".
  isConfigured(): boolean {
    return true;
  }

  async createRoom(input: CreateVideoRoomInput): Promise<VideoRoom> {
    const name = roomNameFor(input.appointmentId);
    return { providerRef: name, roomUrl: `${JITSI_BASE_URL}/${name}` };
  }
}
