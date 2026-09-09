import { Injectable, Logger } from "@nestjs/common";
import type { NotificationChannelAdapter } from "./notification-channel-adapter.port";

// PENDIENTE(jorge): sin API key de proveedor de correo todavía —
// decisión explícita (no todavía / construir todo menos el envío
// real) tomada 2026-09-08. Este adaptador registra el envío en el
// log del servidor y lo marca como intentado; NotificationsService lo
// trata como éxito de "envío" en el sentido de que el mensaje quedó
// disponible para inspección, no que llegó a una bandeja de entrada
// real. Reemplazar esta clase por un adaptador real (SendGrid, SES,
// Postmark...) es un cambio de una sola línea en notifications.module.ts
// (el `useClass` de NOTIFICATION_CHANNEL_ADAPTER) — nada más en el
// módulo necesita cambiar.
@Injectable()
export class ConsoleEmailChannelAdapter implements NotificationChannelAdapter {
  private readonly logger = new Logger(ConsoleEmailChannelAdapter.name);

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ConsoleEmailChannelAdapter must not run in production — wire a real email provider (M12) before deploying."
      );
    }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    this.assertNotProduction();
    this.logger.log(`[dev-only] email to ${to} — subject: "${subject}" — body: ${body}`);
  }

  async sendWhatsApp(_to: string, _body: string): Promise<void> {
    // M12-RN-004: no hay plantilla de WhatsApp aprobada por Meta
    // todavía. Falla siempre a propósito — NotificationsService debe
    // capturar esto y hacer fallback a email (M12-RN-005), nunca
    // tratarlo como un canal disponible.
    throw new Error("WhatsApp channel not available: pending Meta Business template approval (M12-RN-004).");
  }
}
