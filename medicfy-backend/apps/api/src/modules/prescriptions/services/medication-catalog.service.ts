import { HttpStatus, Injectable } from "@nestjs/common";
import type { MedicationCatalog, Prisma } from "@prisma/client";
import type { MedicationCatalogSelfServiceCreateInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeTerm } from "../../catalog/term-normalizer.util";
import { omitUndefined } from "../../../common/omit-undefined";

// Autoservicio de catálogo de medicamentos — decisión explícita del
// usuario (2026-09-02): "que aunque no esté en la lista se pueda
// agregar en la receta, sin necesidad de que un admin lo apruebe".
// R5 (bloqueo duro de Grupos I/II) sigue aplicando exactamente igual
// sobre estas filas que sobre las sembradas: PrescriptionService.create()
// lee isElectronicallyPrescribable de la fila real en medications_catalog
// sin importar cómo se creó — lo único que cambia aquí es QUIÉN puede
// crear la fila y qué tan rápido. isElectronicallyPrescribable se
// DERIVA aquí, en el servidor, del controlGroup que el médico declaró
// explícitamente — nunca se acepta del cliente ni se infiere de texto.
const CONTROLLED_GROUPS = new Set(["I", "II"]);

@Injectable()
export class MedicationCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async createSelfService(doctorId: string, input: MedicationCatalogSelfServiceCreateInput): Promise<MedicationCatalog> {
    const normalized = normalizeTerm(input.genericName);
    // Evita fragmentar el catálogo con la misma sustancia repetida por
    // variaciones de mayúsculas/acentos/plural — no es el mismo
    // candado de "catálogo cerrado" (R2 de medicfy-58-prompts.md; este
    // catálogo, a diferencia de ClinicalCatalogTerm, sí admite alta
    // directa del médico por decisión de este prompt), solo higiene
    // de datos.
    const existingActive = await this.prisma.medicationCatalog.findMany({ where: { isActive: true } });
    const duplicate = existingActive.find((m) => normalizeTerm(m.genericName) === normalized);
    if (duplicate) {
      throw new ApiException(
        "MEDICATION_ALREADY_EXISTS",
        `"${duplicate.genericName}" ya existe en el catálogo — búscalo y selecciónalo en vez de agregarlo de nuevo.`,
        HttpStatus.CONFLICT,
        { existingId: duplicate.id, existingGenericName: duplicate.genericName }
      );
    }

    return this.prisma.medicationCatalog.create({
      data: {
        genericName: input.genericName,
        presentations: input.presentations as unknown as Prisma.InputJsonValue,
        controlGroup: input.controlGroup,
        isElectronicallyPrescribable: !CONTROLLED_GROUPS.has(input.controlGroup),
        addedByDoctorId: doctorId,
        ...omitUndefined({ brandNames: input.brandNames, atcCode: input.atcCode }),
      },
    });
  }
}
