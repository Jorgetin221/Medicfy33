import { Injectable } from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import type { VerificationChannel } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

const CODE_TTL_MS = 10 * 60 * 1000;
// M-02: con 10^6 combinaciones y sin límite, un código de 6 dígitos se
// agotaba por fuerza bruta. Tras 5 fallos el código muere y hay que
// pedir otro.
const MAX_ATTEMPTS_PER_CODE = 5;

// Registration flow step 2: "código de 6 dígitos, 10 min de vigencia".
@Injectable()
export class VerificationCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, channel: VerificationChannel): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.prisma.verificationCode.create({
      data: {
        userId,
        channel,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return code;
  }

  // Solo cuenta el código vigente más reciente: emitir uno nuevo deja
  // sin efecto los anteriores.
  async verify(userId: string, channel: VerificationChannel, candidate: string): Promise<boolean> {
    const current = await this.prisma.verificationCode.findFirst({
      where: { userId, channel, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!current || current.expiresAt < new Date() || current.attempts >= MAX_ATTEMPTS_PER_CODE) {
      return false;
    }
    if (current.codeHash !== hashCode(candidate)) {
      await this.prisma.verificationCode.update({ where: { id: current.id }, data: { attempts: { increment: 1 } } });
      return false;
    }
    const consumed = await this.prisma.verificationCode.updateMany({
      where: { id: current.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1;
  }
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
