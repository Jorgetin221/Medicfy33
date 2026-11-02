import { randomBytes } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { Patient, PatientActivationLink, User } from "@prisma/client";
import {
  IDENTITY_ERROR_CODES,
  isMinor,
  type PatientAccountStatus,
  type PatientActivationInfo,
  type PatientActivationLinkIssued,
  type PatientActivationSubmitInput,
} from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import { AuthService, isBlockedUserStatus, type IssuedTokens, type RequestMeta } from "../../identity/services/auth.service";
import { sha256Hex } from "../../record-share/record-share-crypto.util";
import type { PatientAccountActor } from "../patient-account-access.service";
import { PatientAccountAccessService } from "../patient-account-access.service";

const ACTIVATION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Mínimo pedido: 32 bytes aleatorios de CSPRNG → 43 caracteres base64url.
const ACTIVATION_TOKEN_BYTES = 32;
// Descarta de entrada lo que no puede ser un token nuestro, sin tocar
// la base de datos.
const ACTIVATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Un solo mensaje para CUALQUIER enlace inválido (no existe, usado,
// vencido, revocado, expediente ya con cuenta): no hay nada que ganar
// distinguiéndolos, y quien adivina tokens no aprende nada.
const LINK_INVALID_MESSAGE = "Este enlace ya no es válido. Pide a tu médico uno nuevo.";

function activationLinkInvalid(): ApiException {
  return new ApiException("PATIENT_ACTIVATION_LINK_INVALID", LINK_INVALID_MESSAGE, HttpStatus.NOT_FOUND);
}

function webOrigin(): string {
  return process.env.WEB_ORIGIN ?? "http://localhost:3000";
}

// Parte 1 — enlace de activación generado por el médico. El médico lo
// comparte él mismo (WhatsApp, en persona): no se envía ningún SMS ni
// correo, así que ningún paso depende de un código. Solo el sha256 del
// token vive en la base, igual que PasswordResetToken.
@Injectable()
export class PatientActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly access: PatientAccountAccessService
  ) {}

  async getAccountStatus(patientId: string, actor: PatientAccountActor): Promise<PatientAccountStatus> {
    const patient = await this.access.findPatientForActor(patientId, actor, "patient.account_status.read");
    await this.expireStaleLinks(patient.id);
    const [pendingLink, pendingLinkRequestCount] = await Promise.all([
      this.prisma.patientActivationLink.findFirst({
        where: { patientId: patient.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.patientLinkRequest.count({ where: { patientId: patient.id, status: "PENDING" } }),
    ]);
    return {
      hasAccount: patient.userId !== null,
      isMinor: isMinor(patient.birthDate),
      pendingActivationLink: pendingLink
        ? { createdAt: pendingLink.createdAt.toISOString(), expiresAt: pendingLink.expiresAt.toISOString() }
        : null,
      pendingLinkRequestCount,
    };
  }

  // Generar uno nuevo revoca el anterior pendiente: en todo momento hay
  // como máximo un enlace vivo por expediente.
  async issueLink(patientId: string, actor: PatientAccountActor): Promise<PatientActivationLinkIssued> {
    const patient = await this.access.findPatientForActor(patientId, actor, "patient.activation_link.created");
    if (patient.userId !== null) {
      throw new ApiException("PATIENT_ALREADY_HAS_ACCOUNT", "Este paciente ya tiene una cuenta activa.", HttpStatus.CONFLICT);
    }
    // El sistema todavía no tiene acceso de tutores con cuenta propia
    // (PatientGuardian no tiene usuario): activar la cuenta de un menor
    // no tendría a quién dársela. Se bloquea en vez de improvisarlo.
    if (isMinor(patient.birthDate)) {
      throw new ApiException(
        "PATIENT_ACTIVATION_MINOR_UNSUPPORTED",
        "La activación de cuenta para pacientes menores de edad (a través de su tutor) todavía no está disponible.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const plainToken = randomBytes(ACTIVATION_TOKEN_BYTES).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_LINK_TTL_MS);

    const { link, revokedIds } = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.patientActivationLink.findMany({
        where: { patientId: patient.id, status: "PENDING" },
        select: { id: true },
      });
      if (previous.length > 0) {
        await tx.patientActivationLink.updateMany({
          where: { id: { in: previous.map((p) => p.id) }, status: "PENDING" },
          data: { status: "REVOKED", revokedAt: now, revokedByUserId: actor.userId },
        });
      }
      const created = await tx.patientActivationLink.create({
        data: { patientId: patient.id, tokenHash: sha256Hex(plainToken), expiresAt, createdByUserId: actor.userId },
      });
      return { link: created, revokedIds: previous.map((p) => p.id) };
    });

    for (const revokedId of revokedIds) {
      await this.logLinkEvent("patient.activation_link.revoked", revokedId, patient.id, actor.userId, { reason: "replaced_by_new_link" });
    }
    await this.logLinkEvent("patient.activation_link.created", link.id, patient.id, actor.userId, {
      expiresAt: expiresAt.toISOString(),
    });

    return { url: `${webOrigin()}/activar-cuenta/${plainToken}`, expiresAt: expiresAt.toISOString() };
  }

  // Página pública: solo nombre de pila y Medicfy ID para que la
  // persona confirme que es ella. Nunca dato clínico.
  async getInfo(token: string): Promise<PatientActivationInfo> {
    const { patient } = await this.resolveUsableLink(token);
    return { firstName: patient.firstName, medicfyId: patient.medicfyId };
  }

  async activate(token: string, input: PatientActivationSubmitInput, meta: RequestMeta): Promise<IssuedTokens> {
    const { link, patient } = await this.resolveUsableLink(token).catch(async (error: unknown) => {
      await this.auditService.log({
        action: "patient.activation_link.used",
        resourceType: "patient_activation_link",
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "link_invalid" },
      });
      throw error;
    });

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email }, include: { patient: true } });
    if (existingUser) {
      await this.assertExistingAccountCanBeLinked(existingUser, input.password, meta);
    }
    const passwordHash = existingUser ? null : await this.authService.hashPassword(input.password);

    const { userId, cancelledRequests } = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Un solo uso aunque lleguen dos envíos a la vez: el segundo
      // espera el candado de la fila y, al confirmarse el primero, ya
      // no cumple status=PENDING — count 0 y toda su transacción se
      // revierte (incluido el usuario que iba a crear).
      const claimed = await tx.patientActivationLink.updateMany({
        where: { id: link.id, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "USED", usedAt: now },
      });
      if (claimed.count !== 1) throw activationLinkInvalid();

      const accountUserId =
        existingUser?.id ??
        (
          await tx.user.create({
            data: {
              email: input.email,
              phoneE164: patient.phoneE164,
              passwordHash: passwordHash as string,
              primaryRole: "PATIENT",
              // El enlace ya acreditó la identidad (ver AuthService.login).
              status: "ACTIVE",
              roles: { create: { role: "PATIENT" } },
            },
          })
        ).id;

      const linked = await tx.patient.updateMany({ where: { id: patient.id, userId: null }, data: { userId: accountUserId } });
      if (linked.count !== 1) throw activationLinkInvalid();
      await tx.patientActivationLink.update({ where: { id: link.id }, data: { usedByUserId: accountUserId } });

      // Solicitudes por teléfono que este enlace deja sin objeto: las
      // del mismo expediente (ya tiene cuenta) y las de la misma
      // persona (ya tiene expediente).
      const toCancel = await tx.patientLinkRequest.findMany({
        where: { status: "PENDING", OR: [{ patientId: patient.id }, { userId: accountUserId }] },
        select: { id: true, patientId: true },
      });
      if (toCancel.length > 0) {
        await tx.patientLinkRequest.updateMany({
          where: { id: { in: toCancel.map((r) => r.id) }, status: "PENDING" },
          data: { status: "CANCELLED", decidedAt: now },
        });
      }
      return { userId: accountUserId, cancelledRequests: toCancel };
    });

    if (!existingUser) {
      await this.authService.recordPatientConsents(userId, input.consents, meta);
    }
    await this.auditService.log({
      actorUserId: userId,
      actorRole: "PATIENT",
      action: "patient.activation_link.used",
      resourceType: "patient_activation_link",
      resourceId: link.id,
      patientId: patient.id,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { accountCreated: !existingUser },
    });
    for (const request of cancelledRequests) {
      await this.auditService.log({
        actorUserId: userId,
        action: "patient.link_request.cancelled",
        resourceType: "patient_link_request",
        resourceId: request.id,
        patientId: request.patientId,
        result: "SUCCESS",
        metadata: { reason: "linked_by_activation_link" },
      });
    }

    return this.authService.startPatientSessionAfterActivation(userId, meta);
  }

  // Una cuenta que ya existe solo se vincula si es de paciente y todavía
  // no tiene expediente (p. ej. se registró sola y quedó pendiente de
  // revisión). La contraseña se verifica ANTES de decir nada sobre la
  // cuenta, y cuenta contra el bloqueo por fuerza bruta del login.
  private async assertExistingAccountCanBeLinked(
    user: User & { patient: Patient | null },
    password: string,
    meta: RequestMeta
  ): Promise<void> {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiException(
        "AUTH_ACCOUNT_LOCKED",
        "Cuenta bloqueada temporalmente por múltiples intentos fallidos.",
        IDENTITY_ERROR_CODES.AUTH_ACCOUNT_LOCKED,
        { retry_after: user.lockedUntil.toISOString() }
      );
    }
    await this.authService.verifyPasswordForAccountLink(user.id, user.passwordHash, password, meta);
    if (isBlockedUserStatus(user.status)) {
      throw new ApiException("AUTH_ACCOUNT_SUSPENDED", "Esta cuenta está suspendida. Contacta a soporte.", HttpStatus.FORBIDDEN);
    }
    if (user.primaryRole !== "PATIENT" || user.patient !== null) {
      throw new ApiException(
        "PATIENT_ACTIVATION_ACCOUNT_NOT_ELIGIBLE",
        "Esta cuenta no se puede vincular a este expediente. Usa otro correo o pide ayuda a tu médico.",
        HttpStatus.CONFLICT
      );
    }
  }

  private async resolveUsableLink(token: string): Promise<{ link: PatientActivationLink; patient: Patient }> {
    if (!ACTIVATION_TOKEN_PATTERN.test(token)) throw activationLinkInvalid();
    const link = await this.prisma.patientActivationLink.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { patient: true },
    });
    if (!link || link.status !== "PENDING") throw activationLinkInvalid();
    if (link.expiresAt <= new Date()) {
      await this.prisma.patientActivationLink.updateMany({ where: { id: link.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      throw activationLinkInvalid();
    }
    // Defensa en profundidad: issueLink ya bloquea ambos casos, pero el
    // expediente pudo vincularse por otra vía o el bloqueo de menores
    // cambiar después de generar el enlace.
    if (link.patient.userId !== null || isMinor(link.patient.birthDate)) throw activationLinkInvalid();
    const { patient, ...linkRow } = link;
    return { link: linkRow, patient };
  }

  // Expiración perezosa, sin scheduler (mismo patrón que CareRelationship).
  private async expireStaleLinks(patientId: string): Promise<void> {
    await this.prisma.patientActivationLink.updateMany({
      where: { patientId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  }

  private async logLinkEvent(
    action: string,
    linkId: string,
    patientId: string,
    actorUserId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.auditService.log({
      actorUserId,
      action,
      resourceType: "patient_activation_link",
      resourceId: linkId,
      patientId,
      result: "SUCCESS",
      metadata,
    });
  }
}
