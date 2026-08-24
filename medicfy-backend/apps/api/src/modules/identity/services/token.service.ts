import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { RoleName, Session } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// M1-RN-007: doctor session idle timeout 30 min ("dato clínico en
// pantalla en consultorio compartido"); patient 7 days. Roles other
// than PATIENT are treated as clinical/staff roles for this purpose.
const CLINICAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const PATIENT_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccessTokenPayload {
  sub: string;
  primaryRole: RoleName;
}

export type RefreshOutcome =
  | { ok: true; session: Session; plainToken: string }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "idle_timeout" };

@Injectable()
export class TokenService {
  private readonly accessSecret: string;

  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error("JWT_ACCESS_SECRET is not set");
    }
    this.accessSecret = secret;
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.accessSecret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, this.accessSecret) as AccessTokenPayload;
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

    const newPlainToken = randomBytes(48).toString("base64url");
    const updated = await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashToken(newPlainToken), lastUsedAt: now },
    });
    return { ok: true, session: updated, plainToken: newPlainToken };
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
