import { HttpStatus, Injectable } from "@nestjs/common";
import type { NotificationChannel } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";

// M12: GET/PATCH /notification-preferences (única entrada de la
// especificación para este endpoint). M12-RN-003: los recordatorios
// de cita son transaccionales y no se pueden desactivar del todo —
// por eso no existe un booleano "activado/desactivado" aquí, solo la
// elección de canal. Cuando el canal es WHATSAPP, NotificationsService
// hace fallback automático a email hasta que exista un proveedor
// (M12-RN-004/005) — esa es una decisión de envío, no de preferencia:
// la preferencia guardada del usuario no se sobreescribe.
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreference(userId: string): Promise<{ channel: NotificationChannel }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationChannelPreference: true },
    });
    if (!user) {
      throw new ApiException("USER_NOT_FOUND", "Usuario no encontrado.", HttpStatus.NOT_FOUND);
    }
    return { channel: user.notificationChannelPreference };
  }

  async setPreference(userId: string, channel: NotificationChannel): Promise<{ channel: NotificationChannel }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationChannelPreference: channel },
      select: { notificationChannelPreference: true },
    });
    return { channel: user.notificationChannelPreference };
  }
}
