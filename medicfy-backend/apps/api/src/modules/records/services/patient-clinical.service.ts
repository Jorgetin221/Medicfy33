import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  PatientAllergyCreateInput,
  PatientAllergyUpdateInput,
  PatientMedicationCreateInput,
  PatientMedicationUpdateInput,
} from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { omitUndefined } from "../../../common/omit-undefined";

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
        include: { cancellation: true, items: true },
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
        status: p.cancellation ? ("CANCELLED" as const) : ("ISSUED" as const),
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
