// M1 §7 "Dependencias": proveedor de email, proveedor de SMS/WhatsApp.
// Neither is wired yet (that provider integration is M12's job). This
// port lets the identity module depend on an abstraction now instead
// of blocking on M12, per the same pattern the spec uses for M9's
// signature abstraction (§3.2).
export interface NotificationPort {
  sendEmailVerificationCode(to: string, code: string): Promise<void>;
  sendPhoneVerificationCode(to: string, code: string): Promise<void>;
  sendPasswordResetLink(to: string, resetUrl: string): Promise<void>;
  sendAssistantInvitation(to: string, inviteUrl: string): Promise<void>;
  // M2-RN-005: al suspender un médico, sus pacientes con cita futura
  // se notifican con su derecho a reembolso. refundPercent es un
  // porcentaje (0-100), no un monto — no hay pasarela de pago (M6)
  // que calcule ni mueva dinero real todavía.
  sendAppointmentCancelledDoctorSuspended(
    to: string,
    details: { appointmentStartsAt: Date; refundPercent: number }
  ): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol("NOTIFICATION_PORT");
