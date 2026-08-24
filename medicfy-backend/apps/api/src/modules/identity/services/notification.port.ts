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
}

export const NOTIFICATION_PORT = Symbol("NOTIFICATION_PORT");
