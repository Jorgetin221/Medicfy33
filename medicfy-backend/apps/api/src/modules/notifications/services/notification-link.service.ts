import { Injectable } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";

// M12-RN-002/M12-CA-002: "enlaces de un solo uso, vigencia 15
// minutos". Mismo patrón exacto que PasswordResetToken en
// auth.service.ts (randomBytes(32) en base64url para el enlace,
// sha256 hex para lo que se guarda) — un token de acceso a
// notificaciones tiene las mismas propiedades de seguridad que uno de
// restablecimiento de contraseña, así que se reutiliza el diseño en
// vez de inventar uno nuevo.
const ACCESS_LINK_TTL_MS = 15 * 60 * 1000;

export interface IssuedNotificationLink {
  plainToken: string;
  expiresAt: Date;
}

@Injectable()
export class NotificationLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, relatedEntityType?: string, relatedEntityId?: string): Promise<IssuedNotificationLink> {
    const plainToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ACCESS_LINK_TTL_MS);
    await this.prisma.notificationAccessToken.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update(plainToken).digest("hex"),
        relatedEntityType: relatedEntityType ?? null,
        relatedEntityId: relatedEntityId ?? null,
        expiresAt,
      },
    });
    return { plainToken, expiresAt };
  }

  buildUrl(appBaseUrl: string, plainToken: string): string {
    return `${appBaseUrl}/n/${plainToken}`;
  }

  // Un solo uso: consumir un token ya usado o vencido siempre falla.
  // No revela cuál de las dos razones fue (mismo principio que
  // resetPassword en auth.service.ts: "enlace inválido o expirado").
  async consume(plainToken: string): Promise<{ userId: string; relatedEntityType: string | null; relatedEntityId: string | null }> {
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");
    const record = await this.prisma.notificationAccessToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new Error("NOTIFICATION_LINK_INVALID");
    }
    await this.prisma.notificationAccessToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return {
      userId: record.userId,
      relatedEntityType: record.relatedEntityType,
      relatedEntityId: record.relatedEntityId,
    };
  }
}
