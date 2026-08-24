import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  PatientAllergyCreateInput,
  PatientAllergyUpdateInput,
  PatientMedicationCreateInput,
  PatientMedicationUpdateInput,
  PatientHistoryCategory,
  PatientHistoryItemUpsertInput,
} from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { derivePrescriptionStatus } from "../../prescriptions/prescription-status.util";

// M8-RN-008/M8-RN-012: alergias y medicamentos habituales viven en el
// paciente, se capturan una vez y se arrastran a cada consulta — no
// se recapturan nunca. CRUD simple, siempre editable (a diferencia de
// clinical_notes, esto no es lo que NOM-004 exige inmutable).
@Injectable()
export class PatientClinicalService {
  constructor(private readonly prisma: PrismaService) {}

  listAllergies(patientId: string) {
    return this.prisma.patientAllergy.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } });
  }

  createAllergy(patientId: string, input: PatientAllergyCreateInput) {
    const { reaction, ageOfOnset, status, ...required } = input;
    return this.prisma.patientAllergy.create({
      data: { patientId, ...required, ...omitUndefined({ reaction, ageOfOnset, status }) },
    });
  }

  async updateAllergy(patientId: string, allergyId: string, patch: PatientAllergyUpdateInput) {
    await this.assertAllergyBelongsToPatient(patientId, allergyId);
    return this.prisma.patientAllergy.update({ where: { id: allergyId }, data: omitUndefined(patch) });
  }

  listMedications(patientId: string) {
    return this.prisma.patientMedication.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } });
  }

  createMedication(patientId: string, input: PatientMedicationCreateInput) {
    const { brandName, startedAt, suspendedAt, reason, status, prescriber, ...required } = input;
    return this.prisma.patientMedication.create({
      data: {
        patientId,
        ...required,
        ...omitUndefined({
          brandName,
          reason,
          status,
          prescriber,
          startedAt: startedAt ? new Date(startedAt) : undefined,
          suspendedAt: suspendedAt ? new Date(suspendedAt) : undefined,
        }),
      },
    });
  }

  async updateMedication(patientId: string, medicationId: string, patch: PatientMedicationUpdateInput) {
    await this.assertMedicationBelongsToPatient(patientId, medicationId);
    return this.prisma.patientMedication.update({
      where: { id: medicationId },
      data: omitUndefined({
        ...patch,
        startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
        suspendedAt: patch.suspendedAt ? new Date(patch.suspendedAt) : undefined,
      }),
    });
  }

  listHistoryItems(patientId: string, category?: PatientHistoryCategory) {
    return this.prisma.patientHistoryItem.findMany({
      where: { patientId, ...(category ? { category } : {}) },
      orderBy: [{ category: "asc" }, { subtype: "asc" }],
    });
  }

  // M8-RN-012/§10.4 de especificacion-plataforma-clinica-con-ia.md:
  // "toda modificación queda versionada" y "no borrar el valor
  // histórico al actualizar" — antes de sobrescribir una fila
  // existente se inserta una foto de sus valores viejos en
  // PatientHistoryItemChange (append-only vía GRANT). El input
  // representa el estado completo deseado del ítem (como un PUT): si
  // structuredValue/freeText no vienen, se limpian explícitamente, no
  // se dejan con el valor viejo por accidente. La clave (patientId,
  // category, subtype, familyRelationship) es lo que define "una fila
  // vigente" por antecedente.
  async upsertHistoryItem(patientId: string, userId: string, input: PatientHistoryItemUpsertInput) {
    const familyRelationship = input.familyRelationship ?? "NONE";
    // input.structuredValue ya está validado por Zod (patientHistoryItemUpsertSchema)
    // como un record de valores JSON-serializables — el cast es solo
    // para el tipo de Prisma.InputJsonValue, más estricto de lo que
    // TS puede verificar estructuralmente contra un Record genérico.
    const data = {
      status: input.status,
      structuredValue: input.structuredValue ? (input.structuredValue as Prisma.InputJsonValue) : Prisma.DbNull,
      freeText: input.freeText ?? null,
      familyRelationshipDetail: input.familyRelationshipDetail ?? null,
    };

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.patientHistoryItem.findUnique({
        where: {
          patientId_category_subtype_familyRelationship: {
            patientId,
            category: input.category,
            subtype: input.subtype,
            familyRelationship,
          },
        },
      });

      if (!existing) {
        return tx.patientHistoryItem.create({
          data: { patientId, category: input.category, subtype: input.subtype, familyRelationship, updatedByUserId: userId, ...data },
        });
      }

      await tx.patientHistoryItemChange.create({
        data: {
          historyItemId: existing.id,
          previousStatus: existing.status,
          previousStructuredValue: existing.structuredValue ?? Prisma.DbNull,
          previousFreeText: existing.freeText,
          changedByUserId: userId,
        },
      });

      return tx.patientHistoryItem.update({ where: { id: existing.id }, data: { updatedByUserId: userId, ...data } });
    });
  }

  // §6.5.8: expediente cronológico — encuentros, recetas y órdenes en
  // una sola línea de tiempo, cada uno con tipo/fecha/autor/estado.
  async timeline(patientId: string) {
    const [encounters, prescriptions, labOrders] = await Promise.all([
      this.prisma.clinicalEncounter.findMany({
        where: { patientId },
        orderBy: { startedAt: "desc" },
        select: { id: true, encounterType: true, status: true, startedAt: true, signedAt: true, doctorId: true },
      }),
      this.prisma.prescription.findMany({
        where: { patientId },
        orderBy: { issuedAt: "desc" },
        include: { cancellation: true, handwrittenDelivery: true, items: true },
      }),
      this.prisma.labOrder.findMany({
        where: { patientId },
        orderBy: { issuedAt: "desc" },
        include: { cancellation: true, results: true, items: true },
      }),
    ]);

    return {
      encounters: encounters.map((e) => ({ type: "encounter" as const, ...e })),
      prescriptions: prescriptions.map((p) => ({
        type: "prescription" as const,
        ...p,
        status: derivePrescriptionStatus(p),
      })),
      labOrders: labOrders.map((o) => ({
        type: "lab_order" as const,
        ...o,
        status: o.cancellation ? ("CANCELLED" as const) : o.results.length > 0 ? ("RESULTS_UPLOADED" as const) : ("ISSUED" as const),
      })),
    };
  }

  private async assertAllergyBelongsToPatient(patientId: string, allergyId: string) {
    const allergy = await this.prisma.patientAllergy.findUnique({ where: { id: allergyId } });
    if (!allergy || allergy.patientId !== patientId) {
      throw new ApiException("ALLERGY_NOT_FOUND", "Alergia no encontrada.", HttpStatus.NOT_FOUND);
    }
  }

  private async assertMedicationBelongsToPatient(patientId: string, medicationId: string) {
    const medication = await this.prisma.patientMedication.findUnique({ where: { id: medicationId } });
    if (!medication || medication.patientId !== patientId) {
      throw new ApiException("MEDICATION_NOT_FOUND", "Medicamento no encontrado.", HttpStatus.NOT_FOUND);
    }
  }
}
