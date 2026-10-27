import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import type { Appointment } from "@prisma/client";
import type { TeleconsultationRoomOutcome } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { VIDEO_PROVIDER_PORT, type VideoProviderPort } from "./video-provider.port";
import { DailyHttpError } from "./daily-video-provider.adapter";

// M7 (Teleconsulta, MVP): genera/recupera un enlace de videollamada de
// proveedor externo para una cita. Pedido explícito del usuario
// (2026-10-27): disponible para CUALQUIER cita, sin importar su
// modalidad — el médico puede abrir una videollamada ad hoc incluso
// en una cita agendada como presencial, no solo en las agendadas como
// "en línea". AppointmentsController resuelve "¿esta cita es del
// médico que llama?" antes de llegar aquí, igual que con el resto de
// acciones de la cita.
@Injectable()
export class TeleconsultationService {
  private readonly logger = new Logger(TeleconsultationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(VIDEO_PROVIDER_PORT) private readonly videoProvider: VideoProviderPort
  ) {}

  async openRoom(appointment: Appointment): Promise<TeleconsultationRoomOutcome> {
    // "al momento de que el doctor inicie la consulta": el enlace solo
    // se pide mientras la cita está en curso, nunca antes.
    if (appointment.status !== "IN_PROGRESS") {
      throw new ApiException(
        "APPOINTMENT_TRANSITION_INVALID",
        "La teleconsulta solo está disponible mientras la consulta está en curso.",
        HttpStatus.CONFLICT
      );
    }

    // Idempotente: una cita ya con enlace (reintento, otra pestaña)
    // devuelve el mismo enlace sin volver a llamar al proveedor.
    if (appointment.videoRoomUrl) {
      return { kind: "ok", room: { url: appointment.videoRoomUrl } };
    }

    if (!this.videoProvider.isConfigured()) {
      return { kind: "unavailable", reason: "NOT_CONFIGURED" };
    }

    try {
      const room = await this.videoProvider.createRoom({ appointmentId: appointment.id, expiresAt: appointment.endsAt });
      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { videoRoomUrl: room.roomUrl, videoProviderRef: room.providerRef },
      });
      return { kind: "ok", room: { url: room.roomUrl } };
    } catch (error) {
      this.logFailure(appointment.id, error);
      return { kind: "unavailable", reason: "PROVIDER_ERROR" };
    }
  }

  private logFailure(appointmentId: string, error: unknown): void {
    // Solo estado del proveedor — nunca el cuerpo de su respuesta,
    // que podría citar el nombre de sala (incluye el appointmentId) o
    // detalles internos del proveedor (R2).
    const detail = error instanceof DailyHttpError ? `status=${error.status}` : "error de red";
    this.logger.warn(`teleconsultation.createRoom falló para la cita ${appointmentId}: ${detail}`);
  }
}
