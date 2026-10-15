import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import type { AtlasSessionOutcome } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { ATLAS_API_PORT, type AtlasApiPort } from "./atlas-api.port";
import { AtlasHttpError } from "./atlas-http.adapter";

// La sesión del atlas dura 15 min por defecto (INTEGRATION_GUIDE §6);
// guardamos quién la abrió un poco más para que una revocación tardía
// (el médico cierra la ventana al minuto 15) todavía se acepte.
const OWNERSHIP_TTL_MS = 20 * 60_000;

interface SessionOwner {
  doctorId: string;
  patientId: string;
  expiresAt: number;
}

// Orquesta los pasos 1 y 3 de la guía (vincular paciente, pedir sesión
// de visor). El paso 0 — que el médico pueda ver a este paciente — ya
// lo resolvió CareRelationshipGuard antes de llegar aquí.
@Injectable()
export class AtlasSessionService {
  private readonly logger = new Logger(AtlasSessionService.name);
  // Revocar usa las credenciales de CLIENTE del atlas, que pueden
  // revocar cualquier sesión de Medicfy. Este registro limita la
  // revocación al médico que abrió la sesión y para ese paciente. Vive
  // en memoria: tras un reinicio una revocación se rechaza y la sesión
  // simplemente vence sola a los 15 min.
  private readonly owners = new Map<string, SessionOwner>();

  constructor(@Inject(ATLAS_API_PORT) private readonly atlas: AtlasApiPort) {}

  async openSession(patientId: string, doctorId: string): Promise<AtlasSessionOutcome> {
    if (!this.atlas.isConfigured()) return { kind: "unavailable", reason: "NOT_CONFIGURED" };
    try {
      const remote = await this.atlas.createSession({ externalPatientId: patientId, practitionerRef: doctorId });
      this.rememberOwner(remote.id, { doctorId, patientId, expiresAt: Date.now() + OWNERSHIP_TTL_MS });
      return { kind: "ok", session: { ...remote, viewerUrl: this.atlas.viewerUrl() } };
    } catch (error) {
      this.logFailure("create", error);
      return { kind: "unavailable", reason: "ATLAS_ERROR" };
    }
  }

  async revokeSession(sessionId: string, patientId: string, doctorId: string): Promise<void> {
    const owner = this.owners.get(sessionId);
    if (!owner || owner.doctorId !== doctorId || owner.patientId !== patientId || owner.expiresAt <= Date.now()) {
      // 404 igual que si no existiera: no confirma sesiones ajenas.
      throw new ApiException("NOT_FOUND", "Sesión del atlas no encontrada.", HttpStatus.NOT_FOUND);
    }
    this.owners.delete(sessionId);
    try {
      await this.atlas.revokeSession(sessionId);
    } catch (error) {
      // No se reintenta ni se le muestra al médico: la sesión vence
      // sola en minutos y ya no hay ventana abierta que la use.
      this.logFailure("revoke", error);
    }
  }

  private rememberOwner(sessionId: string, owner: SessionOwner) {
    const now = Date.now();
    for (const [id, o] of this.owners) if (o.expiresAt <= now) this.owners.delete(id);
    this.owners.set(sessionId, owner);
  }

  private logFailure(operation: string, error: unknown) {
    // Solo estado/código/request_id del atlas — nunca cuerpos (R2).
    const detail = error instanceof AtlasHttpError ? `${error.status} ${error.code} request_id=${error.requestId ?? "-"}` : "error de red";
    this.logger.warn(`atlas.${operation} falló: ${detail}`);
  }
}
