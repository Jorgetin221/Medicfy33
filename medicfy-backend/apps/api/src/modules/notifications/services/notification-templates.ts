// M12-RN-001 ("ningún canal externo transporta contenido clínico") y
// M12-CA-001 ("verificado por prueba automatizada sobre las
// plantillas") se cumplen aquí por CONSTRUCCIÓN, no por disciplina:
// cada tipo de datos de abajo declara exactamente los campos que esa
// plantilla puede usar (nombre, fecha, un enlace, un código de
// referencia) y ninguno incluye diagnóstico, medicamento ni valor de
// resultado. Es imposible pasarle un campo clínico a un renderer sin
// que TypeScript lo rechace en tiempo de compilación — la prueba en
// notification-templates.spec.ts verifica además, en tiempo de
// ejecución, que el texto renderizado nunca contiene palabras clínicas
// aunque alguien intente colar una a mano en el futuro.
//
// "pago fallido" (listada en la spec) no tiene renderer: M6
// (facturación) no existe todavía, así que no hay nada real que
// disparar esa plantilla — ver notification-template-code en el
// schema.

export interface RenderedNotification {
  subject: string;
  body: string;
}

interface AppointmentScheduledData {
  recipientFirstName: string;
  doctorDisplayName: string;
  appointmentDateLabel: string; // ya formateada en America/Mexico_City — ver nota de CLAUDE.md §4
  actionLink: string;
}
export function renderAppointmentScheduled(d: AppointmentScheduledData): RenderedNotification {
  return {
    subject: "Tu cita en Medicfy quedó agendada",
    body: `Hola ${d.recipientFirstName}, tu cita con ${d.doctorDisplayName} el ${d.appointmentDateLabel} quedó agendada. Ver detalles: ${d.actionLink}`,
  };
}

interface AppointmentConfirmedData {
  recipientFirstName: string;
  doctorDisplayName: string;
  appointmentDateLabel: string;
  actionLink: string;
}
export function renderAppointmentConfirmed(d: AppointmentConfirmedData): RenderedNotification {
  return {
    subject: "Tu cita en Medicfy fue confirmada",
    body: `Hola ${d.recipientFirstName}, tu cita con ${d.doctorDisplayName} el ${d.appointmentDateLabel} fue confirmada. Ver detalles: ${d.actionLink}`,
  };
}

interface AppointmentReminderData {
  recipientFirstName: string;
  doctorDisplayName: string;
  appointmentDateLabel: string;
  videoLink?: string;
  actionLink: string;
}
export function renderAppointmentReminder24h(d: AppointmentReminderData): RenderedNotification {
  return {
    subject: "Recordatorio: tu cita en Medicfy es mañana",
    body: `Hola ${d.recipientFirstName}, tu cita con ${d.doctorDisplayName} es el ${d.appointmentDateLabel}. Ver detalles: ${d.actionLink}`,
  };
}
export function renderAppointmentReminder2h(d: AppointmentReminderData): RenderedNotification {
  const videoLine = d.videoLink ? ` Enlace de videoconsulta: ${d.videoLink}.` : "";
  return {
    subject: "Tu cita en Medicfy es en 2 horas",
    body: `Hola ${d.recipientFirstName}, tu cita con ${d.doctorDisplayName} es el ${d.appointmentDateLabel}.${videoLine} Ver detalles: ${d.actionLink}`,
  };
}

interface AppointmentCancelledData {
  recipientFirstName: string;
  doctorDisplayName: string;
  appointmentDateLabel: string;
  actionLink: string;
}
export function renderAppointmentCancelled(d: AppointmentCancelledData): RenderedNotification {
  return {
    subject: "Tu cita en Medicfy fue cancelada",
    body: `Hola ${d.recipientFirstName}, tu cita con ${d.doctorDisplayName} el ${d.appointmentDateLabel} fue cancelada. Ver detalles: ${d.actionLink}`,
  };
}

interface AppointmentRescheduledData {
  recipientFirstName: string;
  doctorDisplayName: string;
  newAppointmentDateLabel: string;
  actionLink: string;
}
export function renderAppointmentRescheduled(d: AppointmentRescheduledData): RenderedNotification {
  return {
    subject: "Tu cita en Medicfy cambió de horario",
    body: `Hola ${d.recipientFirstName}, tu cita con ${d.doctorDisplayName} se reagendó para el ${d.newAppointmentDateLabel}. Ver detalles: ${d.actionLink}`,
  };
}

interface DocumentAvailableData {
  recipientFirstName: string;
  doctorDisplayName: string;
  actionLink: string;
}
// Deliberadamente sin nombre de medicamento ni de estudio en el
// cuerpo — "está disponible" es todo lo que este canal puede decir
// (M12-RN-001); el contenido real solo se ve tras entrar por
// actionLink, autenticado.
export function renderPrescriptionAvailable(d: DocumentAvailableData): RenderedNotification {
  return {
    subject: "Tienes una receta nueva en Medicfy",
    body: `Hola ${d.recipientFirstName}, ${d.doctorDisplayName} emitió una receta para ti. Consúltala aquí: ${d.actionLink}`,
  };
}
export function renderLabOrderAvailable(d: DocumentAvailableData): RenderedNotification {
  return {
    subject: "Tienes una orden de laboratorio nueva en Medicfy",
    body: `Hola ${d.recipientFirstName}, ${d.doctorDisplayName} emitió una orden de laboratorio para ti. Consúltala aquí: ${d.actionLink}`,
  };
}
export function renderLabResultAvailable(d: DocumentAvailableData): RenderedNotification {
  return {
    subject: "Tienes un resultado de laboratorio nuevo en Medicfy",
    body: `Hola ${d.recipientFirstName}, hay un resultado de laboratorio nuevo disponible. Consúltalo aquí: ${d.actionLink}`,
  };
}

interface DoctorVerificationDecidedData {
  recipientFirstName: string;
  actionLink: string;
}
export function renderDoctorVerificationApproved(d: DoctorVerificationDecidedData): RenderedNotification {
  return {
    subject: "Tu cuenta de médico en Medicfy fue verificada",
    body: `Hola Dr(a). ${d.recipientFirstName}, tu cédula profesional fue verificada. Ya puedes usar Medicfy sin restricciones: ${d.actionLink}`,
  };
}
export function renderDoctorVerificationRejected(d: DoctorVerificationDecidedData): RenderedNotification {
  return {
    subject: "No pudimos verificar tu cuenta de médico en Medicfy",
    body: `Hola Dr(a). ${d.recipientFirstName}, no pudimos verificar tu cédula profesional con los documentos enviados. Revisa los detalles aquí: ${d.actionLink}`,
  };
}

interface PasswordResetData {
  recipientFirstName: string;
  actionLink: string;
}
export function renderPasswordReset(d: PasswordResetData): RenderedNotification {
  return {
    subject: "Restablece tu contraseña de Medicfy",
    body: `Hola ${d.recipientFirstName}, usa este enlace para restablecer tu contraseña (vigente 15 minutos, un solo uso): ${d.actionLink}`,
  };
}
