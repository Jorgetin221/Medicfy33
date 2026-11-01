import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { RecordShareNotificationPort } from "./record-share-notification.port";

// Buzón de desarrollo: archivo local FUERA de los logs de la
// aplicación. PR-EXP-07 (batería de seguridad): "ningún OTP ni dato
// clínico en logs de aplicación" y RE9 ("ningún dato personal en logs")
// — antes este adaptador imprimía el código y el correo del paciente
// con Logger; ahora el mensaje completo solo va a este archivo, que
// es el equivalente local de la bandeja del proveedor real.
export const DEV_OUTBOX_PATH = join(tmpdir(), "medicfy-dev-outbox.log");

const PRODUCTION_ERROR =
  "ConsoleRecordShareNotificationAdapter must not run in production — wire a real provider (D-EXP-13) before deploying.";

// Dev-only — mismo guardia que ConsoleNotificationAdapter (M1) y
// ConsoleEmailChannelAdapter (M12), más uno al ARRANCAR (PR-EXP-07:
// "producción no arranca con el adaptador de desarrollo"): no espera
// al primer envío para descubrirlo. Proveedor real: 🔒 D-EXP-13.
@Injectable()
export class ConsoleRecordShareNotificationAdapter implements RecordShareNotificationPort, OnModuleInit {
  private readonly logger = new Logger(ConsoleRecordShareNotificationAdapter.name);

  onModuleInit(): void {
    this.assertNotProduction();
  }

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === "production") {
      throw new Error(PRODUCTION_ERROR);
    }
  }

  // El log de la aplicación solo dice QUÉ tipo de mensaje se depositó
  // y dónde — nunca destino, código, nombres ni enlaces.
  private deliver(kind: string, lines: string[]): void {
    this.assertNotProduction();
    appendFileSync(DEV_OUTBOX_PATH, `--- ${new Date().toISOString()} · ${kind}\n${lines.join("\n")}\n`);
    this.logger.log(`[dev-only] mensaje "${kind}" depositado en el buzón de desarrollo (${DEV_OUTBOX_PATH}).`);
  }

  async sendAuthorizationRequest(input: {
    channel: "EMAIL" | "PHONE";
    destination: string;
    requesterDisplayName: string;
    requesterLicense: string;
    requesterSpecialtyName: string | null;
    authorizationUrl: string;
  }): Promise<void> {
    this.deliver("solicitud de autorización", [
      `para: ${input.destination} (${input.channel})`,
      `${input.requesterDisplayName} (cédula ${input.requesterLicense}${input.requesterSpecialtyName ? `, ${input.requesterSpecialtyName}` : ""})`,
      `autorizar: ${input.authorizationUrl}`,
    ]);
  }

  async sendOtpCode(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }): Promise<void> {
    this.deliver("código de verificación", [`para: ${input.destination} (${input.channel})`, `código: ${input.code}`]);
  }

  async sendApprovalConfirmation(input: {
    channel: "EMAIL" | "PHONE";
    destination: string;
    requesterDisplayName: string;
    scope: string[];
    expiresAt: Date;
    revocationUrl: string;
  }): Promise<void> {
    this.deliver("confirmación de autorización", [
      `para: ${input.destination} (${input.channel})`,
      `${input.requesterDisplayName} — alcance [${input.scope.join(", ")}] hasta ${input.expiresAt.toISOString()}`,
      `revocar: ${input.revocationUrl}`,
    ]);
  }

  async sendRevocationNotice(input: { channel: "EMAIL" | "PHONE"; destination: string; requesterDisplayName: string }): Promise<void> {
    this.deliver("revocación confirmada", [`para: ${input.destination} (${input.channel})`, `${input.requesterDisplayName} ya no tiene acceso.`]);
  }
}
