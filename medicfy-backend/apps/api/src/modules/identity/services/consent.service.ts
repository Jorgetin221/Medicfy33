import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { ConsentType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

export interface RecordConsentParams {
  userId: string;
  consentType: ConsentType;
  documentVersion: string;
  granted: boolean;
  ipAddress: string;
  userAgent: string;
}

// M1-RN-003/004: every consent decision is a new append-only row —
// never an update. "Revocar" is a new row with granted=false.
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordConsentParams): Promise<void> {
    const occurredAt = new Date().toISOString();
    const evidenceHash = createHash("sha256")
      .update(
        [params.userId, params.consentType, params.documentVersion, params.granted, params.ipAddress, occurredAt].join(
          "|"
        )
      )
      .digest("hex");

    await this.prisma.consent.create({
      data: {
        userId: params.userId,
        consentType: params.consentType,
        documentVersion: params.documentVersion,
        granted: params.granted,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        evidenceHash,
      },
    });
  }

  /** Latest decision for a consent type, or null if never decided. */
  async currentStatus(
    userId: string,
    consentType: ConsentType
  ): Promise<{ granted: boolean; documentVersion: string } | null> {
    const latest = await this.prisma.consent.findFirst({
      where: { userId, consentType },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      return null;
    }
    return { granted: latest.granted, documentVersion: latest.documentVersion };
  }
}
