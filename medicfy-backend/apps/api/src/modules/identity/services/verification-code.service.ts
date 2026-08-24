import { Injectable } from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import type { VerificationChannel } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

const CODE_TTL_MS = 10 * 60 * 1000;

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

  async verify(userId: string, channel: VerificationChannel, candidate: string): Promise<boolean> {
    const codeHash = hashCode(candidate);
    const match = await this.prisma.verificationCode.findFirst({
      where: { userId, channel, codeHash, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!match || match.expiresAt < new Date()) {
      return false;
    }
    await this.prisma.verificationCode.update({
      where: { id: match.id },
      data: { consumedAt: new Date() },
    });
    return true;
  }
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
