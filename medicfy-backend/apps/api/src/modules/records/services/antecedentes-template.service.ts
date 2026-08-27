import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AntecedentesTemplateCreateInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { PatientClinicalService } from "./patient-clinical.service";

// Prompt 23B — plantillas de antecedentes por especialidad y perfil,
// propiedad del médico. "La plantilla sustituye al botón duplicar
// nota del sistema de referencia, que institucionaliza el
// copy-forward. La diferencia está en la marca de heredado y en el
// bloqueo de firma": aplicar marca CADA dato como heredado-sin-revisar
// y la nota no se puede firmar hasta revisarlos (candado en
// ClinicalEncounterService.sign).
@Injectable()
export class AntecedentesTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientClinical: PatientClinicalService
  ) {}

  private async doctorByUserId(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Solo un médico puede administrar plantillas de antecedentes.", HttpStatus.FORBIDDEN);
    }
    return doctor;
  }

  async list(userId: string) {
    const doctor = await this.doctorByUserId(userId);
    return this.prisma.antecedentesTemplate.findMany({
      where: { doctorId: doctor.id },
      orderBy: { createdAt: "asc" },
      include: { specialty: { select: { code: true, nameEs: true } } },
    });
  }

  async create(userId: string, input: AntecedentesTemplateCreateInput) {
    const doctor = await this.doctorByUserId(userId);
    let specialtyId: string | undefined;
    if (input.specialtyCode) {
      const specialty = await this.prisma.specialty.findUnique({ where: { code: input.specialtyCode } });
      if (!specialty) {
        throw new ApiException("SPECIALTY_NOT_FOUND", `La especialidad "${input.specialtyCode}" no existe.`, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      specialtyId = specialty.id;
    }
    // Los subtipos de la plantilla se validan contra el catálogo AL
    // CREARLA — una plantilla no puede acarrear términos inventados.
    for (const item of input.items) {
      await this.patientClinical.resolveAntecedenteTermPublic(item.subtype);
    }
    return this.prisma.antecedentesTemplate.create({
      data: {
        doctorId: doctor.id,
        name: input.name,
        items: input.items as unknown as Prisma.InputJsonValue,
        ...omitUndefined({ specialtyId }),
      },
    });
  }

  // Aplicar = correr el MISMO upsert de antecedentes por cada renglón,
  // con la marca de heredado — nunca un camino aparte que evada las
  // validaciones de catálogo ni el versionado R1.
  async apply(templateId: string, patientId: string, userId: string) {
    const doctor = await this.doctorByUserId(userId);
    const template = await this.prisma.antecedentesTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.doctorId !== doctor.id) {
      throw new ApiException("TEMPLATE_NOT_FOUND", "Plantilla no encontrada.", HttpStatus.NOT_FOUND);
    }
    const items = template.items as unknown as {
      category: "HEREDOFAMILIAR" | "PERSONAL_NO_PATOLOGICO" | "PERSONAL_PATOLOGICO";
      subtype: string;
      familyRelationship?: string;
      status: "PRESENTE" | "NEGADO" | "DESCONOCIDO" | "NO_INVESTIGADO";
      freeText?: string;
    }[];
    const applied = [];
    for (const item of items) {
      applied.push(
        await this.patientClinical.upsertHistoryItem(
          patientId,
          userId,
          {
            category: item.category,
            subtype: item.subtype,
            status: item.status,
            ...omitUndefined({
              familyRelationship: item.familyRelationship as never,
              freeText: item.freeText,
            }),
          },
          { inheritedFromTemplate: true }
        )
      );
    }
    return { appliedCount: applied.length, items: applied };
  }
}
