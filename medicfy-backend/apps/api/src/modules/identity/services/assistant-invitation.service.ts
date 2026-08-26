import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { NOTIFICATION_PORT, type NotificationPort } from "./notification.port";

const MAX_PENDING_INVITATIONS = 3;
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

// M1-RN-008: up to 3 pending invitations per doctor, 72h expiry.
@Injectable()
export class AssistantInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort
  ) {}

  async invite(doctorUserId: string, email: string): Promise<{ invitationId: string }> {
    const now = new Date();
    const pendingCount = await this.prisma.assistantInvitation.count({
      where: { doctorUserId, status: "PENDING", expiresAt: { gt: now } },
    });
    if (pendingCount >= MAX_PENDING_INVITATIONS) {
      throw new ApiException(
        "ASSISTANT_INVITATION_LIMIT_REACHED",
        "Ya tienes el máximo de invitaciones pendientes (3).",
        HttpStatus.CONFLICT
      );
    }

    const token = randomBytes(24).toString("base64url");
    const invitation = await this.prisma.assistantInvitation.create({
      data: {
        doctorUserId,
        email,
        token,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      },
    });

    const inviteUrl = `${mustGetAppBaseUrl()}/invitaciones/asistente?token=${token}`;
    await this.notifications.sendAssistantInvitation(email, inviteUrl);

    return { invitationId: invitation.id };
  }

  // DOC-16: sin esto un médico no tenía forma de ver a quién ya
  // invitó ni quién aceptó — invite()/accept() existían pero no había
  // lectura (hallazgo de la auditoría de M2, que la daba por
  // completa sin serlo). expiresAt se filtra en memoria, no en el
  // WHERE — MAX_PENDING_INVITATIONS ya cuenta así (línea de arriba),
  // mismo criterio de "pendiente" en los dos lugares.
  async list(doctorUserId: string): Promise<{
    pending: { id: string; email: string; expiresAt: Date }[];
    accepted: { id: string; email: string; acceptedAt: Date }[];
  }> {
    const now = new Date();
    const invitations = await this.prisma.assistantInvitation.findMany({
      where: { doctorUserId },
      orderBy: { createdAt: "desc" },
    });
    return {
      pending: invitations
        .filter((i) => i.status === "PENDING" && i.expiresAt > now)
        .map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt })),
      accepted: invitations
        .filter((i): i is typeof i & { acceptedAt: Date } => i.status === "ACCEPTED" && i.acceptedAt !== null)
        .map((i) => ({ id: i.id, email: i.email, acceptedAt: i.acceptedAt })),
    };
  }

  // M4: an ASSISTANT's scope lives on their UserRole row (scopeId =
  // the inviting doctor's userId — see accept() below), not on
  // AccessTokenPayload.primaryRole, since accepting an invitation
  // never changes the accepting user's own primary role. Returns null
  // if this user holds no ASSISTANT role at all.
  async getAssistantScope(userId: string): Promise<string | null> {
    const role = await this.prisma.userRole.findFirst({
      where: { userId, role: "ASSISTANT" },
    });
    return role?.scopeId ?? null;
  }

  async accept(token: string, acceptingUserId: string): Promise<void> {
    const invitation = await this.prisma.assistantInvitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      throw new ApiException(
        "ASSISTANT_INVITATION_INVALID",
        "Invitación inválida o expirada.",
        HttpStatus.BAD_REQUEST
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assistantInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: acceptingUserId },
      });
      await tx.userRole.create({
        data: { userId: acceptingUserId, role: "ASSISTANT", scopeId: invitation.doctorUserId },
      });
    });
  }
}

function mustGetAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL is not set");
  }
  return url;
}
