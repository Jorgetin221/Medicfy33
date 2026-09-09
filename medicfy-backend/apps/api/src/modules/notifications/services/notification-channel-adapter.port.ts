// Puerto genérico "enviar (asunto, cuerpo) por un canal" para el
// pipeline transaccional de M12 (recordatorios de cita, documentos
// disponibles, verificación de médico...). Es deliberadamente distinto
// del NOTIFICATION_PORT que ya existe en identity/services —ese puerto
// es de M1 (códigos de verificación, invitación de asistente,
// contraseña) con un método por propósito y ya tiene su propio
// ConsoleNotificationAdapter probado; tocarlo para generalizarlo
// habría significado modificar un flujo ya enviado y con pruebas sin
// una razón real. Los dos puertos pueden compartir un proveedor real
// (SendGrid, SES...) el día que exista — eso se decide en ese momento,
// no ahora.
export interface NotificationChannelAdapter {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  // WhatsApp exige plantillas aprobadas por Meta Business (M12-RN-004,
  // trámite externo de 2-3 semanas) — no hay proveedor todavía. El
  // método existe en la interfaz para que NotificationsService pueda
  // programar el fallback a email (M12-RN-005) sin un `if` especial;
  // la implementación de abajo simplemente falla siempre.
  sendWhatsApp(to: string, body: string): Promise<void>;
}

export const NOTIFICATION_CHANNEL_ADAPTER = Symbol("NOTIFICATION_CHANNEL_ADAPTER");
