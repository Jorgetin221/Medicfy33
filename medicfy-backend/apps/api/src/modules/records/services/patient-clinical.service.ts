import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  GynecoHistoryUpsertInput,
  PatientAllergyCatalogCreateInput,
  PatientAllergyCreateInput,
  PatientAllergyUpdateInput,
  PatientMedicationCreateInput,
  PatientMedicationUpdateInput,
  PatientHistoryCategory,
  PatientHistoryItemUpsertInput,
  PatientPregnancyCreateInput,
  PatientPregnancyUpdateInput,
  SubstanceUseUpsertInput,
  NotesTimelineQueryInput,
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
  // Prompt 24.1: "ningún campo de antecedente acepta un término que no
  // exista en catálogo" — el subtipo se resuelve contra el dominio
  // ANTECEDENTE (siguiendo fusiones al término vigente) y se guarda su
  // id. Un término inventado se rechaza aquí, no en un enum estático:
  // lo que el curador aprueba (prompt 10) es usable de inmediato.
  // Público para AntecedentesTemplateService (valida plantillas al crearlas).
  async resolveAntecedenteTermPublic(subtype: string) {
    return this.resolveAntecedenteTerm(subtype);
  }

  private async resolveAntecedenteTerm(subtype: string) {
    const term = await this.prisma.clinicalCatalogTerm.findFirst({ where: { domain: "ANTECEDENTE", key: subtype } });
    if (!term) {
      throw new ApiException(
        "HISTORY_SUBTYPE_NOT_IN_CATALOG",
        `El antecedente "${subtype}" no existe en el catálogo. Solicítalo al curador desde "solicitar término nuevo".`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { subtype }
      );
    }
    if (term.status === "MERGED" && term.mergedIntoId) {
      const current = await this.prisma.clinicalCatalogTerm.findUnique({ where: { id: term.mergedIntoId } });
      if (current) return current;
    }
    if (term.status === "OBSOLETE") {
      throw new ApiException(
        "HISTORY_SUBTYPE_OBSOLETE",
        `El antecedente "${subtype}" quedó obsoleto en el catálogo.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { subtype }
      );
    }
    return term;
  }

  async upsertHistoryItem(
    patientId: string,
    userId: string,
    input: PatientHistoryItemUpsertInput,
    options?: { inheritedFromTemplate?: boolean }
  ) {
    const catalogTerm = await this.resolveAntecedenteTerm(input.subtype);
    const familyRelationship = input.familyRelationship ?? "NONE";
    // input.structuredValue ya está validado por Zod (patientHistoryItemUpsertSchema)
    // como un record de valores JSON-serializables — el cast es solo
    // para el tipo de Prisma.InputJsonValue, más estricto de lo que
    // TS puede verificar estructuralmente contra un Record genérico.
    const inherited = options?.inheritedFromTemplate === true;
    const data = {
      status: input.status,
      structuredValue: input.structuredValue ? (input.structuredValue as Prisma.InputJsonValue) : Prisma.DbNull,
      freeText: input.freeText ?? null,
      familyRelationshipDetail: input.familyRelationshipDetail ?? null,
      catalogTermId: catalogTerm.id,
      // Prompt 23B: aplicar plantilla marca heredado; una captura
      // MANUAL del médico es, por definición, dato revisado.
      inheritedFromTemplate: inherited,
      inheritedReviewedAt: inherited ? null : new Date(),
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

  // Prompt 23B: revisar un heredado sin cambiarlo — lo confirma.
  async confirmInheritedHistoryItem(patientId: string, itemId: string, userId: string) {
    const item = await this.prisma.patientHistoryItem.findUnique({ where: { id: itemId } });
    if (!item || item.patientId !== patientId) {
      throw new ApiException("HISTORY_ITEM_NOT_FOUND", "Antecedente no encontrado.", HttpStatus.NOT_FOUND);
    }
    return this.prisma.patientHistoryItem.update({
      where: { id: itemId },
      data: { inheritedReviewedAt: new Date(), updatedByUserId: userId },
    });
  }

  pendingInheritedItems(patientId: string) {
    return this.prisma.patientHistoryItem.findMany({
      where: { patientId, inheritedFromTemplate: true, inheritedReviewedAt: null },
      select: { id: true, category: true, subtype: true, familyRelationship: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // ── Prompt 21: toxicomanías con cuantificación ───────────────────
  // Índices calculados y ALMACENADOS en servidor, con fórmula y
  // versión — mismo principio que IMC/escalas.
  private static readonly SUBSTANCE_FORMULA_VERSION = "v1";

  private computeSubstanceIndices(substanceKey: string, input: SubstanceUseUpsertInput, birthDate: Date) {
    if (input.status === "NEGADO" || input.quantity === undefined) {
      return { packYears: null, stdDrinksPerWeek: null, computeFormula: null, computeVersion: null };
    }
    // Años de consumo: de la edad de inicio a la suspensión (o a hoy).
    const endDate = input.suspendedAt ? new Date(input.suspendedAt) : new Date();
    const endAgeYears = (endDate.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const years = input.ageOfOnset !== undefined ? Math.max(0, endAgeYears - input.ageOfOnset) : null;

    if (substanceKey === "tabaco" && input.unit === "CIGARROS_POR_DIA" && years !== null) {
      return {
        packYears: Math.round(((input.quantity * years) / 20) * 100) / 100,
        stdDrinksPerWeek: null,
        computeFormula: "paquetes_anio = (cigarros_por_dia * anios_de_consumo) / 20",
        computeVersion: PatientClinicalService.SUBSTANCE_FORMULA_VERSION,
      };
    }
    if (substanceKey === "alcohol" && (input.unit === "UNIDADES_POR_SEMANA" || input.unit === "UNIDADES_POR_DIA")) {
      const weekly = input.unit === "UNIDADES_POR_DIA" ? input.quantity * 7 : input.quantity;
      return {
        packYears: null,
        stdDrinksPerWeek: Math.round(weekly * 100) / 100,
        computeFormula: "unidades_estandar_semana = unidades_por_dia * 7 | unidades_por_semana",
        computeVersion: PatientClinicalService.SUBSTANCE_FORMULA_VERSION,
      };
    }
    return { packYears: null, stdDrinksPerWeek: null, computeFormula: null, computeVersion: null };
  }

  listSubstanceUses(patientId: string) {
    return this.prisma.patientSubstanceUse.findMany({
      where: { patientId },
      include: { substanceTerm: { select: { key: true, preferredTerm: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async upsertSubstanceUse(patientId: string, userId: string, input: SubstanceUseUpsertInput) {
    const term = await this.prisma.clinicalCatalogTerm.findFirst({
      where: { domain: "SUSTANCIA_PSICOACTIVA", key: input.substanceKey, status: "ACTIVE" },
    });
    if (!term) {
      throw new ApiException(
        "SUBSTANCE_NOT_IN_CATALOG",
        `La sustancia "${input.substanceKey}" no existe en el catálogo.`,
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { birthDate: true } });
    const indices = this.computeSubstanceIndices(term.key, input, patient.birthDate);
    const data = {
      status: input.status,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      ageOfOnset: input.ageOfOnset ?? null,
      suspendedAt: input.suspendedAt ? new Date(input.suspendedAt) : null,
      comment: input.comment ?? null,
      ...indices,
      updatedByUserId: userId,
    };
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.patientSubstanceUse.findUnique({
        where: { patientId_substanceTermId: { patientId, substanceTermId: term.id } },
      });
      if (!existing) {
        return tx.patientSubstanceUse.create({ data: { patientId, substanceTermId: term.id, ...data } });
      }
      // R1 / prompt 24.4: el valor anterior se conserva con fecha y autor.
      await tx.patientSubstanceUseChange.create({
        data: {
          substanceUseId: existing.id,
          previousValue: {
            status: existing.status,
            quantity: existing.quantity,
            unit: existing.unit,
            ageOfOnset: existing.ageOfOnset,
            suspendedAt: existing.suspendedAt,
            comment: existing.comment,
            packYears: existing.packYears,
            stdDrinksPerWeek: existing.stdDrinksPerWeek,
          } as Prisma.InputJsonValue,
          changedByUserId: userId,
        },
      });
      return tx.patientSubstanceUse.update({ where: { id: existing.id }, data });
    });
  }

  // ── Prompt 22: gineco-obstétricos condicionados por sexo ─────────
  private async gynecoVisibility(patientId: string) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { sexAtBirth: true } });
    const existing = await this.prisma.patientGynecoHistory.findUnique({ where: { patientId } });
    const visible = patient.sexAtBirth === "F" || existing?.manuallyEnabled === true;
    return { visible, existing };
  }

  async getGynecoHistory(patientId: string) {
    const { visible, existing } = await this.gynecoVisibility(patientId);
    // El bloque NO se muestra por omisión a todos (prompt 22): para un
    // paciente masculino sin habilitación explícita, no hay bloque.
    if (!visible) return { visible: false as const, history: null };
    return { visible: true as const, history: existing ?? null };
  }

  async enableGynecoHistory(patientId: string, userId: string) {
    const existing = await this.prisma.patientGynecoHistory.findUnique({ where: { patientId } });
    if (existing) {
      return this.prisma.patientGynecoHistory.update({ where: { patientId }, data: { manuallyEnabled: true, updatedByUserId: userId } });
    }
    return this.prisma.patientGynecoHistory.create({ data: { patientId, manuallyEnabled: true, updatedByUserId: userId } });
  }

  async upsertGynecoHistory(patientId: string, userId: string, input: GynecoHistoryUpsertInput) {
    const { visible, existing } = await this.gynecoVisibility(patientId);
    if (!visible) {
      throw new ApiException(
        "GYNECO_BLOCK_NOT_ENABLED",
        "El bloque gineco-obstétrico no está habilitado para este paciente — habilítalo explícitamente primero.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    const data = { ...omitUndefined(input as Record<string, unknown>), updatedByUserId: userId };
    return this.prisma.$transaction(async (tx) => {
      if (!existing) {
        return tx.patientGynecoHistory.create({ data: { patientId, ...data } });
      }
      await tx.patientGynecoHistoryChange.create({
        data: {
          gynecoHistoryId: existing.id,
          previousValue: JSON.parse(JSON.stringify(existing)) as Prisma.InputJsonValue,
          changedByUserId: userId,
        },
      });
      return tx.patientGynecoHistory.update({ where: { patientId }, data });
    });
  }

  // ── Prompt 23A: alergias ancladas al catálogo ────────────────────
  async createAllergyFromCatalog(patientId: string, input: PatientAllergyCatalogCreateInput) {
    const term = await this.prisma.clinicalCatalogTerm.findFirst({
      where: { domain: "ALERGIA_AGENTE", key: input.agentKey, status: "ACTIVE" },
    });
    if (!term) {
      throw new ApiException(
        "ALLERGY_AGENT_NOT_IN_CATALOG",
        `El agente "${input.agentKey}" no existe en el catálogo de alergias — solicítalo al curador.`,
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    if (input.medicationCatalogId) {
      const med = await this.prisma.medicationCatalog.findUnique({ where: { id: input.medicationCatalogId } });
      if (!med) {
        throw new ApiException("MEDICATION_NOT_FOUND", "El medicamento anclado no existe en el catálogo.", HttpStatus.UNPROCESSABLE_ENTITY);
      }
    }
    const { agentKey: _agentKey, medicationCatalogId, reaction, ageOfOnset, ...rest } = input;
    void _agentKey;
    return this.prisma.patientAllergy.create({
      data: {
        patientId,
        // substance se conserva (con el término preferido) para el
        // cruce actual de recetas; catalogTermId es la referencia dura.
        substance: term.preferredTerm,
        catalogTermId: term.id,
        ...rest,
        ...omitUndefined({ medicationCatalogId, reaction, ageOfOnset }),
      },
    });
  }

  // §6.5.8: expediente cronológico — encuentros, recetas y órdenes en
  // una sola línea de tiempo, cada uno con tipo/fecha/autor/estado.
  // ── Fase 3 · Prompt 30: series estructuradas para graficar ───────
  // "Se calculan leyendo campos estructurados, sin procesar una sola
  // cadena de texto" — la entidad VitalSignSet ES la serie.
  vitalsHistory(patientId: string) {
    return this.prisma.vitalSignSet.findMany({
      where: { patientId },
      orderBy: { recordedAt: "asc" },
      select: {
        recordedAt: true,
        bpSystolicMmHg: true,
        bpDiastolicMmHg: true,
        heartRateBpm: true,
        respiratoryRateBpm: true,
        temperatureC: true,
        spo2Percent: true,
        weightKg: true,
        heightCm: true,
        bmi: true,
        bsaM2: true,
        weightPercentile: true,
        heightPercentile: true,
        percentileSource: true,
        outOfRangeFlags: true,
        criticalFlags: true,
      },
    });
  }

  // Prompt 30 (pediatría): puntos de las curvas de percentilas P3/P15/
  // P50/P85/P97 para el sexo del paciente — derivados de las filas LMS
  // (valor del percentil p a edad t: M·(1+L·S·z_p)^(1/L)).
  async growthCurves(patientId: string, measure: "WEIGHT_FOR_AGE" | "HEIGHT_FOR_AGE") {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { sexAtBirth: true, birthDate: true } });
    const ageMonths = (Date.now() - patient.birthDate.getTime()) / (30.4375 * 24 * 60 * 60 * 1000);
    const source = ageMonths <= 60 ? "OMS_2006" : "CDC_2000";
    const rows = await this.prisma.growthReference.findMany({
      where: { sex: patient.sexAtBirth, measure, source },
      orderBy: { ageMonths: "asc" },
    });
    const Z = { p3: -1.8807936, p15: -1.0364334, p50: 0, p85: 1.0364334, p97: 1.8807936 };
    const curve = rows.map((row) => {
      const l = Number(row.l);
      const m = Number(row.m);
      const sVal = Number(row.s);
      const value = (z: number) => Math.round(m * Math.pow(1 + l * sVal * z, 1 / l) * 100) / 100;
      return {
        ageMonths: Number(row.ageMonths),
        p3: value(Z.p3),
        p15: value(Z.p15),
        p50: value(Z.p50),
        p85: value(Z.p85),
        p97: value(Z.p97),
      };
    });
    return { source, measure, sex: patient.sexAtBirth, curve };
  }

  // ── Fase 3 · Prompt 28: descartar un diagnóstico ─────────────────
  // No lo borra: cambia certainty a DESCARTADO y conserva el histórico
  // con fecha y autor (R1). Sale de los diagnósticos vigentes.
  async discardDiagnosis(patientId: string, diagnosisId: string, userId: string) {
    const diagnosis = await this.prisma.encounterDiagnosis.findUnique({
      where: { id: diagnosisId },
      include: { encounter: { select: { patientId: true } } },
    });
    if (!diagnosis || diagnosis.encounter.patientId !== patientId) {
      throw new ApiException("DIAGNOSIS_NOT_FOUND", "Diagnóstico no encontrado para este paciente.", HttpStatus.NOT_FOUND);
    }
    if (diagnosis.certainty === "DESCARTADO") {
      throw new ApiException("DIAGNOSIS_ALREADY_DISCARDED", "Este diagnóstico ya está descartado.", HttpStatus.CONFLICT);
    }
    return this.prisma.encounterDiagnosis.update({
      where: { id: diagnosisId },
      data: { certainty: "DESCARTADO", discardedAt: new Date(), discardedByUserId: userId },
    });
  }

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
    // Prompt 28: un diagnóstico descartado sale de los vigentes — pero
    // su fila sobrevive con fecha y autor del descarte (R1).
    return [...groups.values()]
      .filter((g) => g.certainty !== "DESCARTADO")
      .sort((a, b) => b.lastRecordedAt.getTime() - a.lastRecordedAt.getTime());
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

  // Fase 5 · Prompt 39A: "una sola pantalla, sin scroll si es posible"
  // — un endpoint agregador en vez de que el frontend dispare 6-7
  // fetches en cascada para una sola pantalla. Reusa los métodos que
  // ya existen uno por uno; lo único nuevo es "próxima cita" (no
  // existía ninguna consulta de "siguiente cita de este paciente con
  // este médico" — appointments.controller.ts solo tiene la agenda
  // del día).
  async hojaFrontal(patientId: string, doctorId: string) {
    const [patient, allergies, medications, activeDiagnoses, surgeries, lastEncounter, nextAppointment] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({
        where: { id: patientId },
        select: {
          id: true,
          medicfyId: true,
          firstName: true,
          lastNamePaternal: true,
          lastNameMaternal: true,
          birthDate: true,
          sexAtBirth: true,
          phoneE164: true,
          email: true,
          addressStreet: true,
          addressExt: true,
          addressInt: true,
          addressColonia: true,
          addressMunicipality: true,
          addressState: true,
          addressPostalCode: true,
        },
      }),
      this.listAllergies(patientId),
      this.listMedications(patientId),
      this.activeDiagnoses(patientId),
      this.prisma.patientHistoryItem.findMany({
        where: { patientId, category: "PERSONAL_PATOLOGICO", subtype: "cirugias", status: "PRESENTE" },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.clinicalEncounter.findFirst({
        where: { patientId, status: "SIGNED" },
        orderBy: { signedAt: "desc" },
        select: {
          id: true,
          encounterType: true,
          signedAt: true,
          doctor: { select: { legalFirstName: true, legalLastName: true, primarySpecialty: { select: { nameEs: true } } } },
        },
      }),
      this.prisma.appointment.findFirst({
        where: { patientId, doctorId, startsAt: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, status: true, service: { select: { name: true } } },
      }),
    ]);

    return { patient, allergies, medications, activeDiagnoses, surgeries, lastEncounter, nextAppointment };
  }

  // Fase 5 · Prompt 40: línea de tiempo de notas. Una nota SIGNED es
  // un "hilo" — su(s) corrección(es) (isCorrectionOfNoteId, M8-RN-001)
  // viajan SIEMPRE con ella, nunca la reemplazan (prompt 40: "las
  // adendas se muestran siempre junto a su nota original"). type/from/
  // to filtran por el encuentro (mismo signedAt/tipo para la nota y
  // sus correcciones, así que nunca se separan); q busca en el
  // contenido y, si encuentra una corrección, muestra el hilo
  // completo igual — nunca una corrección huérfana sin su original.
  async notesTimeline(patientId: string, filters: NotesTimelineQueryInput) {
    const encounters = await this.prisma.clinicalEncounter.findMany({
      where: {
        patientId,
        status: "SIGNED",
        ...(filters.type ? { encounterType: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              signedAt: {
                ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
                ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: { signedAt: "desc" },
      select: {
        id: true,
        encounterType: true,
        signedAt: true,
        doctor: { select: { legalFirstName: true, legalLastName: true, primarySpecialty: { select: { nameEs: true } } } },
        notes: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            chiefComplaint: true,
            currentIllness: true,
            physicalExam: true,
            assessment: true,
            plan: true,
            prognosis: true,
            isCorrectionOfNoteId: true,
            createdAt: true,
            // Fase 6 · Prompt 44B: la cancelación se MUESTRA, nunca se
            // oculta — su sola existencia es el estado "cancelada".
            cancellation: {
              select: { cancelledAt: true, reasonFreeText: true, reasonTerm: { select: { preferredTerm: true } } },
            },
          },
        },
      },
    });

    const q = filters.q?.trim().toLowerCase();
    const matchesQuery = (note: { chiefComplaint: string; currentIllness: string; assessment: string; plan: string }) =>
      !q ||
      [note.chiefComplaint, note.currentIllness, note.assessment, note.plan].some((field) => field.toLowerCase().includes(q));

    return encounters
      .flatMap((e) =>
        e.notes
          .filter((n) => !n.isCorrectionOfNoteId)
          .map((root) => ({
            encounterId: e.id,
            encounterType: e.encounterType,
            signedAt: e.signedAt,
            doctor: e.doctor,
            note: root,
            corrections: e.notes.filter((n) => n.isCorrectionOfNoteId === root.id),
          }))
      )
      .filter((thread) => matchesQuery(thread.note) || thread.corrections.some(matchesQuery));
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
