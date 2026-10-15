// Atlas Anatómico 3D — puerto hacia la API del atlas (mismo patrón
// puerto/adaptador que ASSISTANT_MODEL_PORT): AtlasSessionService no
// conoce HTTP, así que sus pruebas usan un doble y nunca tocan la red.
export const ATLAS_API_PORT = Symbol("ATLAS_API_PORT");

export interface AtlasRemoteSession {
  id: string;
  launchCode: string;
  launchCodeExpiresAt: string;
  expiresAt: string;
  mode: "clinician" | "education";
}

export interface CreateAtlasSessionInput {
  // UUID de Medicfy del paciente — NUNCA el folio MDF-…, nombre, CURP
  // ni fecha de nacimiento (INTEGRATION_GUIDE §3, R2).
  externalPatientId: string;
  // Referencia opaca del médico (doctor.id), nunca su nombre.
  practitionerRef: string;
}

export interface AtlasApiPort {
  // Lectura perezosa de credenciales: sin ellas el resto de la app
  // arranca y solo el atlas se degrada a "no disponible".
  isConfigured(): boolean;
  viewerUrl(): string;
  createSession(input: CreateAtlasSessionInput): Promise<AtlasRemoteSession>;
  revokeSession(sessionId: string): Promise<void>;
}
