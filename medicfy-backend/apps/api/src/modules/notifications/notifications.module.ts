import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { NotificationsService } from "./services/notifications.service";
import { NotificationLinkService } from "./services/notification-link.service";
import { NotificationPreferencesService } from "./services/notification-preferences.service";
import { NotificationPreferencesController } from "./notification-preferences.controller";
import { NOTIFICATION_CHANNEL_ADAPTER } from "./services/notification-channel-adapter.port";
import { ConsoleEmailChannelAdapter } from "./services/console-email-channel.adapter";
import { AppointmentReminderSchedulerService } from "./services/appointment-reminder-scheduler.service";

// M12 (notificaciones). Construido "de verdad" el 2026-09-08 por
// decisión explícita del usuario: esquema + plantillas + idempotencia
// + preferencias, conectado a un adaptador de consola documentado en
// vez de un proveedor real (no hay API key de correo todavía) y sin
// cola de reintentos (decisión explícita: enviar una vez y marcar
// éxito/fallo). Reemplazar ConsoleEmailChannelAdapter por un proveedor
// real es el único cambio necesario para "encender" el envío real —
// ver el comentario en ese archivo.
//
// El flujo de M1 (códigos de verificación, invitación de asistente,
// contraseña vía NOTIFICATION_PORT en identity/services) se dejó sin
// tocar a propósito: ya funciona, ya tiene pruebas, y no es parte del
// alcance de "los 12 disparadores transaccionales de M12".
//
// AppointmentReminderSchedulerService (recordatorios 24h/2h) se
// registra aquí y no en SchedulingModule porque encapsula la conexión
// a Redis+BullMQ (decisión explícita del usuario, 2026-09-08) junto
// con el resto de la infraestructura de notificaciones; se exporta
// para que SchedulingModule la inyecte igual que ya inyecta
// NotificationsService/NotificationLinkService.
@Module({
  imports: [IdentityModule],
  controllers: [NotificationPreferencesController],
  providers: [
    NotificationsService,
    NotificationLinkService,
    NotificationPreferencesService,
    AppointmentReminderSchedulerService,
    { provide: NOTIFICATION_CHANNEL_ADAPTER, useClass: ConsoleEmailChannelAdapter },
  ],
  exports: [NotificationsService, NotificationLinkService, AppointmentReminderSchedulerService],
})
export class NotificationsModule {}
