import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  PatientAllergyCreateInput,
  PatientAllergyUpdateInput,
  PatientMedicationCreateInput,
  PatientMedicationUpdateInput,
  PatientHistoryCategory,
  PatientHistoryItemUpsertInput,
  PatientPregnancyCreateInput,
  PatientPregnancyUpdateInput,
} from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { derivePrescriptionStatus } from "../../prescriptions/prescription-status.util";
import { normalizeTerm } from "../../catalog/term-normalizer.util";

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
  // ── Fase 1 / #18: embarazo (Zona 1 de DOC-06) ────────────────────
  // Regla de Naegele: FPP = FUM + 280 días. Las SDG se derivan de la
  // FPP al leer (40 semanas menos lo que falta para la FPP) y NUNCA se
  // almacenan — cálculo derivado siempre en servidor, como IMC/escalas.
  private static readonly GESTATION_DAYS = 280;
  private static readonly MS_PER_DAY = 24 * 60 * 60 * 1000;

  private withGestationalAge<T extends { eddDate: Date }>(pregnancy: T) {
    const msToEdd = pregnancy.eddDate.getTime() - Date.now();
    const daysGestation = PatientClinicalService.GESTATION_DAYS - Math.ceil(msToEdd / PatientClinicalService.MS_PER_DAY);
    const clamped = Math.max(0, daysGestation);
    return {
      ...pregnancy,
      gestationalAge: { weeks: Math.floor(clamped / 7), days: clamped % 7 },
      isPostTerm: daysGestation > PatientClinicalService.GESTATION_DAYS + 14,
    };
  }

  private resolveEdd(lmpDate: string | null | undefined, eddDate: string | undefined) {
    if (eddDate !== undefined) {
      // FPP capturada explícitamente = datación por ultrasonido.
      return { eddDate: new Date(eddDate), eddMethod: "ULTRASONIDO" as const };
    }
    if (lmpDate === undefined || lmpDate === null) return null;
    return {
      eddDate: new Date(new Date(lmpDate).getTime() + PatientClinicalService.GESTATION_DAYS * PatientClinicalService.MS_PER_DAY),
      eddMethod: "FUM" as const,
    };
  }

  async getActivePregnancy(patientId: string) {
    const pregnancy = await this.prisma.patientPregnancy.findFirst({ where: { patientId, status: "ACTIVE" } });
    return pregnancy ? this.withGestationalAge(pregnancy) : null;
  }

  async createPregnancy(patientId: string, recordedByUserId: string, input: PatientPregnancyCreateInput) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { sexAtBirth: true } });
    if (patient.sexAtBirth !== "F") {
      throw new ApiException(
        "PREGNANCY_REQUIRES_FEMALE_SEX_AT_BIRTH",
        "El registro de embarazo requiere sexo al nacer F.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    const dating = this.resolveEdd(input.lmpDate, input.eddDate);
    if (!dating) {
      throw new ApiException("PREGNANCY_DATING_REQUIRED", "Captura la FUM o la FPP por ultrasonido.", HttpStatus.BAD_REQUEST);
    }
    try {
      const created = await this.prisma.patientPregnancy.create({
        data: {
          patientId,
          recordedByUserId,
          lmpDate: input.lmpDate !== undefined ? new Date(input.lmpDate) : null,
          ...dating,
        },
      });
      return this.withGestationalAge(created);
    } catch (error) {
      // Índice único parcial (un ACTIVE por paciente) — la barrera real
      // es Postgres, esto solo lo traduce a un error legible.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiException(
          "PREGNANCY_ALREADY_ACTIVE",
          "La paciente ya tiene un embarazo activo registrado — ciérralo antes de registrar otro.",
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  async updatePregnancy(patientId: string, pregnancyId: string, patch: PatientPregnancyUpdateInput) {
    const existing = await this.prisma.patientPregnancy.findUnique({ where: { id: pregnancyId } });
    if (!existing || existing.patientId !== patientId) {
      throw new ApiException("PREGNANCY_NOT_FOUND", "Embarazo no encontrado para esta paciente.", HttpStatus.NOT_FOUND);
    }
    if (existing.status !== "ACTIVE") {
      throw new ApiException("PREGNANCY_ALREADY_CLOSED", "Un embarazo cerrado no se edita.", HttpStatus.CONFLICT);
    }
    const nextLmp = patch.lmpDate !== undefined ? patch.lmpDate : (existing.lmpDate?.toISOString().slice(0, 10) ?? null);
    const dating = this.resolveEdd(nextLmp, patch.eddDate);
    // Si la datación previa era por ultrasonido y el parche no trae una
    // FPP nueva, la FPP capturada se conserva (una FUM recordada tarde
    // no degrada la datación por ultrasonido).
    const keepUltrasound = patch.eddDate === undefined && existing.eddMethod === "ULTRASONIDO";
    const updated = await this.prisma.patientPregnancy.update({
      where: { id: pregnancyId },
      data: {
        lmpDate: patch.lmpDate !== undefined ? (patch.lmpDate === null ? null : new Date(patch.lmpDate)) : existing.lmpDate,
        ...(keepUltrasound || !dating ? {} : dating),
      },
    });
    return this.withGestationalAge(updated);
  }

  async closePregnancy(patientId: string, pregnancyId: string) {
    const existing = await this.prisma.patientPregnancy.findUnique({ where: { id: pregnancyId } });
    if (!existing || existing.patientId !== patientId) {
      throw new ApiException("PREGNANCY_NOT_FOUND", "Embarazo no encontrado para esta paciente.", HttpStatus.NOT_FOUND);
    }
    if (existing.status !== "ACTIVE") {
      throw new ApiException("PREGNANCY_ALREADY_CLOSED", "Este embarazo ya está cerrado.", HttpStatus.CONFLICT);
    }
    // El desenlace clínico se documenta en la nota del encuentro — aquí
    // solo se cierra el estado (la fila nunca se borra).
    return this.prisma.patientPregnancy.update({
      where: { id: pregnancyId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
  }

  // ── Fase 1 / #19: diagnósticos vigentes (problemas activos) ──────
  // Vista DERIVADA de los diagnósticos firmados: sin tabla nueva y sin
  // ciclo de vida inventado (marcar un problema como resuelto llega
  // cuando Jorge decida esa regla clínica). Deduplica por código
  // CIE-10, o por descripción normalizada cuando no hay código — el
  // mismo normalizador del catálogo.
  async activeDiagnoses(patientId: string) {
    const rows = await this.prisma.encounterDiagnosis.findMany({
      where: { encounter: { patientId, status: "SIGNED" } },
      orderBy: { createdAt: "asc" },
      select: {
        icd10Code: true,
        description: true,
        diagnosisType: true,
        certainty: true,
        createdAt: true,
        encounterId: true,
      },
    });
    const groups = new Map<string, {
      icd10Code: string | null;
      description: string;
      diagnosisType: string;
      certainty: string;
      firstRecordedAt: Date;
      lastRecordedAt: Date;
      timesRecorded: number;
      lastEncounterId: string;
    }>();
    for (const d of rows) {
      const key = d.icd10Code ?? `desc:${normalizeTerm(d.description)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.description = d.description;
        existing.diagnosisType = d.diagnosisType;
        existing.certainty = d.certainty;
        existing.lastRecordedAt = d.createdAt;
        existing.lastEncounterId = d.encounterId;
        existing.timesRecorded += 1;
      } else {
        groups.set(key, {
          icd10Code: d.icd10Code,
          description: d.description,
          diagnosisType: d.diagnosisType,
          certainty: d.certainty,
          firstRecordedAt: d.createdAt,
          lastRecordedAt: d.createdAt,
          timesRecorded: 1,
          lastEncounterId: d.encounterId,
        });
      }
    }
    return [...groups.values()].sort((a, b) => b.lastRecordedAt.getTime() - a.lastRecordedAt.getTime());
  }

  async timeline(patientId: string) {
    const [encounters, prescriptions, labOrders, standaloneResults] = await Promise.all([
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
      // §6.7: labOrderId es nullable — un resultado puede subirse sin
      // estar ligado a una orden emitida por Medicfy (estudios que el
      // paciente ya trae de otro lado). Sin esto, esos resultados
      // quedaban subidos pero invisibles: ninguna pantalla los leía.
      this.prisma.labResult.findMany({
        where: { patientId, labOrderId: null },
        orderBy: { uploadedAt: "desc" },
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
      standaloneResults: standaloneResults.map((r) => ({
        type: "standalone_result" as const,
        ...r,
        status: r.reviewedAt ? ("REVIEWED" as const) : ("PENDING_REVIEW" as const),
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
