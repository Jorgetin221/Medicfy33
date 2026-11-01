// PR-EXP-02 (00-DESCUBRIMIENTO.md Q4; 02-solicitud-del-medico.md §2):
// el prompt maestro asigna la construcción del NotificationPort del
// track a PR-EXP-03, pero PR-EXP-02 ya necesita enviar el mensaje
// inicial de autorización (RE6/RE9: nunca lleva datos clínicos). Este
// puerto nace MÍNIMO, con solo lo que PR-EXP-02 usa — PR-EXP-03 lo
// extiende (OTP, confirmación, revocación) en vez de crear uno nuevo.
export interface RecordShareNotificationPort {
  sendAuthorizationRequest(input: {
    channel: "EMAIL" | "PHONE";
    // El contacto real del Patient (único — ver Q1). Nunca se registra
    // en logs ni en audit_log (RE9) — solo viaja hasta este método.
    destination: string;
    requesterDisplayName: string;
    requesterLicense: string;
    requesterSpecialtyName: string | null;
    authorizationUrl: string;
  }): Promise<void>;

  // PR-EXP-03. Sección B: el código viaja aquí en texto plano (es el
  // único lugar donde debe existir así) — nunca se loggea, nunca llega
  // a audit_log (RE9); el modelo solo guarda su hash.
  sendOtpCode(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }): Promise<void>;

  // PR-EXP-03/06: confirmación con el enlace para revocar en
  // cualquier momento (PR-EXP-06 construyó la ruta — antes se omitía
  // a propósito para no mandar un enlace roto).
  sendApprovalConfirmation(input: {
    channel: "EMAIL" | "PHONE";
    destination: string;
    requesterDisplayName: string;
    scope: string[];
    expiresAt: Date;
    revocationUrl: string;
  }): Promise<void>;

  // PR-EXP-06: aviso al paciente de que su revocación surtió efecto.
  sendRevocationNotice(input: { channel: "EMAIL" | "PHONE"; destination: string; requesterDisplayName: string }): Promise<void>;
}

export const RECORD_SHARE_NOTIFICATION_PORT = Symbol("RECORD_SHARE_NOTIFICATION_PORT");
