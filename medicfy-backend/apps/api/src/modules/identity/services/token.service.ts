import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { RoleName, type Session } from "@prisma/client";
import { z } from "zod";
import { signPurposeToken, verifyPurposeToken } from "../../../common/purpose-token.util";
import { PrismaService } from "../../../prisma/prisma.service";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// M1-RN-007: doctor session idle timeout 30 min ("dato clínico en
// pantalla en consultorio compartido"); patient 7 days. Roles other
// than PATIENT are treated as clinical/staff roles for this purpose.
const CLINICAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const PATIENT_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
// M-04: dos pestañas que renuevan casi a la vez presentan el mismo
// token; la segunda llega cuando ya se rotó. Dentro de esta ventana eso
// es una carrera normal, no un robo.
const REUSE_GRACE_MS = 30_000;

const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  primaryRole: z.nativeEnum(RoleName),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export type RefreshOutcome =
  | { ok: true; session: Session; plainToken: string }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "idle_timeout" };

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {
    if (!process.env.JWT_ACCESS_SECRET) {
      throw new Error("JWT_ACCESS_SECRET is not set");
    }
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return signPurposeToken("access", { sub: payload.sub, primaryRole: payload.primaryRole }, ACCESS_TOKEN_TTL_SECONDS);
  }

  /** Lanza si el token no es un token de acceso válido (C-01). */
  verifyAccessToken(token: string): AccessTokenPayload {
    return verifyPurposeToken("access", token, accessTokenPayloadSchema);
  }

  async createSession(params: {
    userId: string;
    ip?: string;
    userAgent?: string;
    deviceFingerprint?: string;
  }): Promise<{ session: Session; plainToken: string }> {
    const plainToken = randomBytes(48).toString("base64url");
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        userId: params.userId,
        refreshTokenHash: hashToken(plainToken),
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        deviceFingerprint: params.deviceFingerprint ?? null,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_ABSOLUTE_TTL_MS),
        lastUsedAt: now,
      },
    });
    return { session, plainToken };
  }

  async rotate(plainToken: string, primaryRole: RoleName): Promise<RefreshOutcome> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(plainToken) },
    });
    if (!session) {
      return { ok: false, reason: "not_found" };
    }
    if (session.revokedAt) {
      return { ok: false, reason: "revoked" };
    }
    const now = new Date();
    if (session.expiresAt < now) {
      return { ok: false, reason: "expired" };
    }
    const idleTimeoutMs = primaryRole === "PATIENT" ? PATIENT_IDLE_TIMEOUT_MS : CLINICAL_IDLE_TIMEOUT_MS;
    if (now.getTime() - session.lastUsedAt.getTime() > idleTimeoutMs) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      return { ok: false, reason: "idle_timeout" };
    }

    // M-04: rotación condicional — solo gana una renovación por token;
    // la otra recibe "no encontrado" en vez de una segunda sesión válida.
    const newPlainToken = randomBytes(48).toString("base64url");
    const presentedHash = hashToken(plainToken);
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null },
      data: { refreshTokenHash: hashToken(newPlainToken), previousRefreshTokenHash: presentedHash, rotatedAt: now, lastUsedAt: now },
    });
    if (rotated.count !== 1) {
      return { ok: false, reason: "not_found" };
    }
    const updated = await this.prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    return { ok: true, session: updated, plainToken: newPlainToken };
  }

  // M-04: un token que ya se rotó y vuelve a aparecer fuera de la
  // ventana de gracia lo tiene alguien más (el atacante o la víctima):
  // se revoca la sesión entera para cortar a ambos. Devuelve el id de
  // usuario si detectó reúso, para auditarlo.
  async revokeIfReused(plainToken: string): Promise<string | null> {
    const rotatedFrom = await this.prisma.session.findFirst({
      where: { previousRefreshTokenHash: hashToken(plainToken), revokedAt: null },
    });
    if (!rotatedFrom) return null;
    if (rotatedFrom.rotatedAt && Date.now() - rotatedFrom.rotatedAt.getTime() < REUSE_GRACE_MS) return null;
    await this.prisma.session.update({ where: { id: rotatedFrom.id }, data: { revokedAt: new Date() } });
    return rotatedFrom.userId;
  }

  async revoke(plainToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(plainToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
