// M7 (Teleconsulta) — puerto hacia el proveedor externo de
// videollamada (mismo patrón puerto/adaptador que ATLAS_API_PORT /
// ASSISTANT_MODEL_PORT): TeleconsultationService no conoce HTTP ni al
// proveedor concreto, así que sus pruebas usan un doble y nunca tocan
// la red.
//
// Deliberadamente más chico que el texto de la especificación
// ("Interfaz VideoProvider con métodos createRoom, getJoinToken,
// endRoom"): esos tres métodos son la versión v1.1 COMPLETA (tokens de
// unión por participante, cierre explícito de sala). El MVP es "solo
// enlace generado" (§7 M7) — un único enlace que médico y paciente
// usan, igual que M5-RN-005 habla de "el enlace" en singular.
// PENDIENTE(jorge): cuando v1.1 completo sea alcance real, agregar
// getJoinToken (unión por participante) y endRoom (cierre explícito)
// a este puerto. Ref: M7.
export const VIDEO_PROVIDER_PORT = Symbol("VIDEO_PROVIDER_PORT");

export interface CreateVideoRoomInput {
  // UUID de Medicfy de la cita — nunca nombre ni dato clínico del
  // paciente llega al proveedor (R2).
  appointmentId: string;
  // El proveedor expira la sala sola a partir de esta fecha; evita
  // salas de citas viejas acumulándose indefinidamente del lado del
  // proveedor.
  expiresAt: Date;
}

export interface VideoRoom {
  // Referencia opaca del proveedor (p. ej. el nombre de la sala en
  // Daily.co) — se guarda en appointments.videoProviderRef.
  providerRef: string;
  // Enlace de la sala — se guarda en appointments.videoRoomUrl.
  roomUrl: string;
}

export interface VideoProviderPort {
  // Lectura perezosa de credenciales: sin ellas el resto de la app
  // arranca y solo la teleconsulta se degrada a "no disponible".
  isConfigured(): boolean;
  // Idempotente del lado del proveedor: pedir la sala de la misma cita
  // dos veces devuelve el mismo enlace (ver DailyVideoProviderAdapter).
  createRoom(input: CreateVideoRoomInput): Promise<VideoRoom>;
}
