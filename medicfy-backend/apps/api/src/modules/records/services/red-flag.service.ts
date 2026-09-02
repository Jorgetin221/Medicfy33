import { Injectable } from "@nestjs/common";
import type { Prisma, RedFlagEvent } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { detectRedFlags, type DetectedRedFlag, type RedFlagDetectionInput } from "../../../common/red-flag-detector.util";

// Fase 8 · Prompt 52 — persiste lo que red-flag-detector.util.ts
// detecta. "NO bloquea la firma. NO decide. NO restringe" (documento
// del médico responsable): este servicio nunca lanza, solo detecta,
// registra y devuelve. El upsert por (encounterId, flagCode) es el
// dedup — el autoguardado corre cada 10s y la misma condición vigente
// no debe generar una fila nueva cada vez.
@Injectable()
export class RedFlagService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateAndPersist(
    encounterId: string,
    input: RedFlagDetectionInput,
    sexAtBirth: "F" | "M"
  ): Promise<DetectedRedFlag[]> {
    const detected = detectRedFlags(input, sexAtBirth);
    await Promise.all(
      detected.map((flag) =>
        this.prisma.redFlagEvent.upsert({
          where: { encounterId_flagCode: { encounterId, flagCode: flag.flagCode } },
          create: {
            encounterId,
            flagCode: flag.flagCode,
            urgency: flag.urgency,
            detectionMethod: flag.detectionMethod,
            finding: flag.finding,
            triggerData: flag.triggerData as Prisma.InputJsonValue,
          },
          update: {},
        })
      )
    );
    return detected;
  }

  listForEncounter(encounterId: string): Promise<RedFlagEvent[]> {
    return this.prisma.redFlagEvent.findMany({ where: { encounterId }, orderBy: { detectedAt: "asc" } });
  }
}
