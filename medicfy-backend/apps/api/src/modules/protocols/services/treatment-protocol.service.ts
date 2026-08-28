import { Injectable } from "@nestjs/common";
import type { TreatmentProtocol } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

// Fase 7 · Prompt 47A: el catálogo de protocolos es DATOS sembrados
// (curación), nunca algo que un médico cree en vivo — mismo criterio
// que ClinicalCatalogTerm/SpecialtyFieldSchema. Este servicio es de
// solo lectura a propósito.
@Injectable()
export class TreatmentProtocolService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<TreatmentProtocol[]> {
    return this.prisma.treatmentProtocol.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async getWithTemplates(protocolId: string) {
    return this.prisma.treatmentProtocol.findUnique({
      where: { id: protocolId },
      include: {
        sessionTemplates: { orderBy: { sequenceNumber: "asc" } },
        fieldSchemas: { orderBy: { displayOrder: "asc" } },
      },
    });
  }
}
