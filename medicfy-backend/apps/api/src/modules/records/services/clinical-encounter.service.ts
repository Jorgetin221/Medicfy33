import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ClinicalEncounterCreateInput,
  ClinicalNoteCorrectionInput,
  ClinicalNoteDraftUpdateInput,
  ClinicalNoteSignInput,
} from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { buildSignedNoteHashInput, sha256Hex } from "../../../common/content-hash.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { LMS_FORMULA, lmsPercentile, withBodySurfaceArea, withComputedVitals } from "../../../common/vitals-calculations.util";
import { evaluateVitalRanges } from "../../../common/vital-ranges.util";
import type { RedFlagVitalsInput } from "../../../common/red-flag-detector.util";
import { AppointmentStateMachineService } from "../../scheduling/services/appointment-state-machine.service";
import { SpecialtyScaleService } from "./specialty-scale.service";
import { SignatureVerificationService } from "../../identity/services/signature-verification.service";
import { PatientClinicalService } from "./patient-clinical.service";
import { RedFlagService } from "./red-flag.service";
import { LabReferenceRangeService } from "../../labs/services/lab-reference-range.service";

const ABANDONED_AFTER_HOURS = 72;

// M8: contenedor del encuentro (DRAFT autoguardado libremente) + su
// nota NOM-004 (congelada al firmar). ClinicalNote no está en la
// lista literal de R1 salvo cuando ya está firmada — mientras está en
// DRAFT es una fila mutable normal; el GRANT de Postgres de todos
// modos ya bloquea UPDATE sobre clinical_notes para medicfy_app
// siempre (ver migración), así que el autoguardado en realidad
// escribe sobre la fila vía un patrón distinto: el draft vive en
// ClinicalEncounter hasta firmar, y ClinicalNote se INSERTA una sola
// vez, ya completa, en el momento de firmar — no antes. Esto es más
// simple que intentar reconciliar "autoguardado" con una tabla que la
// base de datos ya hace verdaderamente append-only, y sigue
// cumpliendo M8-RN-002 (el frontend autoguarda hacia el ENCOUNTER,
// editable, y solo al firmar se materializa la nota).
@Injectable()
export class ClinicalEncounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentStateMachineService,
    private readonly scales: SpecialtyScaleService,
    private readonly signatureVerification: SignatureVerificationService,
    private readonly patientClinical: PatientClinicalService,
    private readonly redFlags: RedFlagService,
    private readonly labReferenceRanges: LabReferenceRangeService
  ) {}

  // Fase 8 · Prompt 52 — corre en cada autoguardado y al firmar,
  // nunca bloquea nada (a diferencia del gate de criticalVitalsConfirmed
  // de más abajo, que sí puede detener la firma). presentingSymptomTermIds
  // llega como ids de catálogo — se resuelven a su key aquí; un id que
  // no exista o no sea del dominio correcto se ignora en silencio, sin
  // romper el autoguardado.
  private async evaluateRedFlags(
    encounterId: string,
    patientId: string,
    draftContent: Record<string, unknown>
  ) {
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: { birthDate: true, sexAtBirth: true },
    });
    const ageYears = (Date.now() - patient.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const pregnancy = await this.patientClinical.getActivePregnancy(patientId);
    const vitals = (draftContent.vitals as RedFlagVitalsInput | undefined) ?? {};
    const symptomTermIds = (draftContent.presentingSymptomTermIds as string[] | undefined) ?? [];
    const presentingSymptomKeys = await this.resolveRedFlagSymptomKeys(symptomTermIds);
    return this.redFlags.evaluateAndPersist(
      encounterId,
      { ageYears, isPregnant: pregnancy !== null, vitals, presentingSymptomKeys },
      patient.sexAtBirth
    );
  }

  // BANDERA_ROJA_SINTOMA: un id que no exista o no sea de este dominio
  // se ignora en silencio — nunca rompe el autoguardado ni la firma.
  private async resolveRedFlagSymptomKeys(termIds: string[]): Promise<string[]> {
    if (termIds.length === 0) return [];
    const terms = await this.prisma.clinicalCatalogTerm.findMany({
      where: { id: { in: termIds }, domain: "BANDERA_ROJA_SINTOMA" },
      select: { key: true },
    });
    return terms.map((t) => t.key);
  }

  // Resuelve la especialidad del médico dueño del encuentro y computa
  // specialtyData contra sus SpecialtyFieldSchema activos (ESCALAS).
  // undefined si no vino specialtyData en el patch/input — firmar sin
  // mandarlo sigue funcionando exactamente igual que antes de esto.
  // version viaja junto con data porque EncounterSpecialtyData debe
  // fijar la versión de los campos REALMENTE usados para este cálculo
  // (M8-RN-014: "si cambia una guía, las notas viejas conservan su
  // cálculo"), no cualquier versión de ESCALAS que exista hoy.
  private async resolveSpecialtyData(
    doctorId: string,
    rawSpecialtyData: Record<string, number> | undefined
  ): Promise<{ version: number; data: Record<string, unknown> } | undefined> {
    if (!rawSpecialtyData) return undefined;
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });
    const fields = await this.scales.listActiveFields(doctor.primarySpecialtyId, "ESCALAS");
    return { version: fields[0]?.version ?? 1, data: this.scales.computeAndValidate(fields, rawSpecialtyData) };
  }

  // appointmentId es @unique en ClinicalEncounter (a propósito: una
  // cita, un encounter). /consulta/[appointmentId] puede disparar dos
  // solicitudes de creación casi simultáneas para la misma cita (dos
  // pestañas, un doble clic, o el doble-montaje de efectos de React
  // en desarrollo) — en vez de dejar que la segunda reviente con un
  // 500 de violación de constraint, se trata como el resultado
  // correcto sería de todos modos: devolver el encounter que la
  // primera solicitud ya creó (mismo principio de idempotencia que
  // CLAUDE.md §4 exige para citas/recetas/pagos).
  async create(patientId: string, doctorId: string, input: ClinicalEncounterCreateInput) {
    if (input.patientId !== patientId) {
      throw new ApiException("VALIDATION_ERROR", "El paciente de la ruta no coincide con el del cuerpo.", HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.prisma.clinicalEncounter.create({
        data: {
          patientId,
          doctorId,
          encounterType: input.encounterType,
          ...omitUndefined({ appointmentId: input.appointmentId }),
          draftContent: {},
        },
      });
    } catch (error) {
      if (input.appointmentId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.clinicalEncounter.findUnique({ where: { appointmentId: input.appointmentId } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async listForPatient(patientId: string) {
    return this.prisma.clinicalEncounter.findMany({
      where: { patientId },
      orderBy: { startedAt: "desc" },
      include: { notes: true, diagnoses: true },
    });
  }

  async getById(encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      // v2.5 · Capa 3: la sección de laboratorio de la nota firmada
      // viaja con el detalle del encuentro, igual que diagnoses —
      // única lectura, sin endpoint aparte (a diferencia de la SERIE
      // histórica de analitos, que sí vive en /lab-analytes).
      include: { notes: { include: { labResults: true } }, diagnoses: true },
    });
    if (!encounter) {
      throw new ApiException("ENCOUNTER_NOT_FOUND", "Encuentro no encontrado.", HttpStatus.NOT_FOUND);
    }
    return encounter;
  }

  // M8-RN-002: autoguardado cada 10s mientras DRAFT. Se guarda en el
  // propio encounter (draftContent JSON), no en clinical_notes — ver
  // nota de cabecera.
  async updateDraft(encounterId: string, patch: ClinicalNoteDraftUpdateInput) {
    const encounter = await this.assertDraft(encounterId);
    // IMC/escalas en vivo mientras se escribe — sign() vuelve a
    // calcularlos de forma autoritativa a partir de los valores
    // finales, nunca confía en lo que quedó guardado aquí.
    const resolvedSpecialtyData = await this.resolveSpecialtyData(encounter.doctorId, patch.specialtyData);
    const nextPatch = {
      ...patch,
      ...(patch.vitals ? { vitals: withComputedVitals(patch.vitals) } : {}),
      ...(resolvedSpecialtyData ? { specialtyData: resolvedSpecialtyData.data } : {}),
    };
    const draftContent = { ...(encounter.draftContent as Record<string, unknown>), ...nextPatch };
    const updated = await this.prisma.clinicalEncounter.update({
      where: { id: encounterId },
      data: { draftContent: draftContent as unknown as Prisma.InputJsonValue },
    });
    const activeRedFlags = await this.evaluateRedFlags(encounterId, encounter.patientId, draftContent);
    return { ...updated, activeRedFlags };
  }

  // M8-RN-001/M8-RN-002: al firmar se congela — se materializa la
  // única fila de clinical_notes (append-only real vía GRANT) con el
  // contenido final, se calcula el hash y se encadena con el último
  // encuentro firmado del mismo paciente (M8-CA-004).
  async sign(encounterId: string, doctorUserId: string, input: ClinicalNoteSignInput) {
    // Fase 6 · Prompt 43: reautenticación obligatoria — antes que
    // cualquier otra validación, para no revelar nada del contenido de
    // la nota a quien no pueda probar que es el médico dueño de la
    // sesión. Mismo servicio que ya usan recetas/órdenes ELECTRONIC.
    await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);

    // PENDIENTE(jorge): validación de contenido mínimo NOM-004 — antes
    // de permitir firmar, falta validar que la nota trae el contenido
    // mínimo obligatorio conforme a NOM-004-SSA3-2012. Necesito el
    // listado de campos obligatorios validado por un médico y tu
    // abogado (el roadmap pide explícitamente no inventarlo). Ref:
    // prompt 46A, docs/medicfy-58-prompts.md.

    const encounter = await this.assertDraft(encounterId);

    // Prompt 23B: la nota NO se firma mientras existan antecedentes
    // heredados de plantilla sin revisar — el error dice CUÁLES.
    const pendingInherited = await this.prisma.patientHistoryItem.findMany({
      where: { patientId: encounter.patientId, inheritedFromTemplate: true, inheritedReviewedAt: null },
      select: { id: true, category: true, subtype: true, familyRelationship: true },
    });
    if (pendingInherited.length > 0) {
      throw new ApiException(
        "ENCOUNTER_INHERITED_UNREVIEWED",
        `Hay ${pendingInherited.length} antecedente(s) heredados de plantilla sin revisar — revísalos antes de firmar.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { pendingItems: pendingInherited }
      );
    }

    const previous = await this.prisma.clinicalEncounter.findFirst({
      where: { patientId: encounter.patientId, status: "SIGNED", id: { not: encounterId } },
      orderBy: { signedAt: "desc" },
      select: { contentHashSha256: true },
    });
    const previousHashSha256 = previous?.contentHashSha256 ?? null;

    const {
      diagnoses,
      physicalExam,
      prognosis,
      vitals: rawVitals,
      presentingSymptomTermIds,
      specialtyData: rawSpecialtyData,
      criticalVitalsConfirmed,
      patientInstructions,
      suggestedFollowUpDays,
      labResultAnalyteIds,
      password: _password,
      totpCode: _totpCode,
      ...requiredNote
    } = input;
    void _password;
    void _totpCode;
    // Prompt 27/31.2: si el cliente mandó bmi/bsaM2, se IGNORAN — el
    // servidor siempre recalcula sobre peso y talla firmados.
    const { bmi: _clientBmi, bsaM2: _clientBsa, ...vitals } = rawVitals;
    void _clientBmi;
    void _clientBsa;

    // Prompt 26: rangos por edad + candado de valor crítico. Un signo
    // vital crítico exige confirmación EXPLÍCITA del médico.
    const patientForVitals = await this.prisma.patient.findUniqueOrThrow({
      where: { id: encounter.patientId },
      select: { birthDate: true, sexAtBirth: true },
    });
    const ageYears = (Date.now() - patientForVitals.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const rangeFlags = evaluateVitalRanges(ageYears, vitals);
    if (rangeFlags.critical.length > 0 && criticalVitalsConfirmed !== true) {
      throw new ApiException(
        "VITALS_CRITICAL_CONFIRMATION_REQUIRED",
        `Hay signos vitales en rango CRÍTICO (${rangeFlags.critical.join(", ")}) — confirma explícitamente que son correctos antes de firmar.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { criticalFields: rangeFlags.critical }
      );
    }

    // Prompt 28 / P4 §2.4: cada código CIE-10 provisto debe EXISTIR en
    // el catálogo — un "ZZZZ9" ya no puede quedar firmado y hasheado.
    const providedCodes = [...new Set(diagnoses.map((d) => d.icd10Code).filter((c): c is string => c !== undefined))];
    const validCodes = new Set(
      (await this.prisma.icd10Code.findMany({ where: { code: { in: providedCodes } }, select: { code: true } })).map((c) => c.code)
    );
    const invalidCodes = providedCodes.filter((c) => !validCodes.has(c));
    if (invalidCodes.length > 0) {
      throw new ApiException(
        "DIAGNOSIS_ICD10_NOT_IN_CATALOG",
        `Código(s) CIE-10 inexistentes en el catálogo: ${invalidCodes.join(", ")}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { invalidCodes }
      );
    }

    // Prompt 25: tipo de nota TOMADO DEL CATÁLOGO (TIPO_NOTA) y
    // especialidad del autor — fijados por el servidor.
    const noteTypeKey = encounter.encounterType === "FIRST_VISIT" ? "hc" : encounter.encounterType === "URGENT" ? "urg" : "ne";
    const noteTypeTerm = await this.prisma.clinicalCatalogTerm.findFirst({ where: { domain: "TIPO_NOTA", key: noteTypeKey } });
    const signingDoctor = await this.prisma.doctor.findUnique({
      where: { id: encounter.doctorId },
      select: { displayName: true, legalFirstName: true, legalLastName: true, professionalLicense: true, primarySpecialty: { select: { code: true } } },
    });
    const specialtyCode = signingDoctor?.primarySpecialty?.code ?? null;
    // Prompt 43: "estampa nombre completo, cédula profesional" —
    // snapshot al firmar (R6), nunca resuelto por join después. Misma
    // fórmula que common/legal-snapshot.util.ts (buildLegalSnapshot),
    // que no se reusa aquí directamente porque también calcula
    // snapshots del paciente que ClinicalEncounter no necesita — ya
    // tiene patientId.
    const signedByLegalNameSnapshot = signingDoctor
      ? (signingDoctor.displayName ?? `${signingDoctor.legalFirstName} ${signingDoctor.legalLastName}`)
      : null;
    const signedByLicenseSnapshot = signingDoctor?.professionalLicense ?? null;

    // v2.5 · Capa 3: analitos que el médico eligió incluir en ESTA
    // nota — verificados contra encounter.patientId (mismo hallazgo
    // del Bloque 0 que ya obliga a todo el módulo labs: un id de otro
    // paciente simplemente no aparece, nunca se congela). El estado
    // se calcula aquí, con la edad AL MOMENTO DE LA MEDICIÓN (no la
    // edad actual) — mismo criterio que measuredAt ya representa.
    //
    // PENDIENTE(jorge): note_lab_results no entra hoy al
    // contentHashSha256 de la nota (a diferencia de vitals). Cada fila
    // ya es individualmente append-only por su propio GRANT, pero si
    // quieres que una alteración de esta sección específica también
    // rompa la cadena de integridad de note-integrity.service.ts,
    // dímelo — es un cambio deliberado aparte, no trivial de deshacer.
    const selectedLabAnalytes =
      labResultAnalyteIds && labResultAnalyteIds.length > 0
        ? await this.prisma.labResultAnalyte.findMany({
            where: { id: { in: labResultAnalyteIds }, patientId: encounter.patientId },
          })
        : [];
    const noteLabResultsData = await Promise.all(
      selectedLabAnalytes.map(async (a) => {
        const ageYearsAtMeasurement =
          (a.measuredAt.getTime() - patientForVitals.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        const printedRange =
          a.referenceMin !== null && a.referenceMax !== null ? { min: Number(a.referenceMin), max: Number(a.referenceMax) } : null;
        const evaluation = await this.labReferenceRanges.evaluateForAnalyte(
          a.analyteName,
          Number(a.value),
          patientForVitals.sexAtBirth === "F" ? "F" : "M",
          ageYearsAtMeasurement,
          printedRange
        );
        return {
          sourceAnalyteId: a.id,
          analyteName: a.analyteName,
          value: a.value,
          unit: a.unit,
          referenceMin: evaluation.rangeMin,
          referenceMax: evaluation.rangeMax,
          rangeSource: evaluation.rangeSource.toUpperCase() as "SHEET" | "SYSTEM" | "NONE",
          status: evaluation.status.toUpperCase() as "NORMAL" | "LOW" | "HIGH" | "CRITICAL" | "UNKNOWN",
          measuredAt: a.measuredAt,
          labName: a.labName,
          source: a.source,
        };
      })
    );

    // Autoritativo: IMC, superficie corporal y percentilas se calculan
    // aquí sobre lo que de verdad se firma — y entran al hash.
    const computedVitals = withBodySurfaceArea(withComputedVitals(vitals));
    // Prompt 27: percentilas pediátricas por edad y sexo (LMS OMS/CDC).
    const percentiles = await this.computeGrowthPercentiles(ageYears, patientForVitals.sexAtBirth, vitals);
    const resolvedSpecialtyData = await this.resolveSpecialtyData(encounter.doctorId, rawSpecialtyData);
    const contentHashSha256 = sha256Hex(
      buildSignedNoteHashInput({
        note: {
          chiefComplaint: requiredNote.chiefComplaint,
          currentIllness: requiredNote.currentIllness,
          physicalExam: physicalExam ?? null,
          assessment: requiredNote.assessment,
          plan: requiredNote.plan,
          prognosis: prognosis ?? null,
          vitals: computedVitals,
          specialtyCode,
          noteTypeTermId: noteTypeTerm?.id ?? null,
          patientInstructions: patientInstructions ?? null,
          suggestedFollowUpDays: suggestedFollowUpDays ?? null,
        },
        diagnoses: diagnoses.map((d) => ({
          icd10CodeId: d.icd10Code ?? null,
          codeAbsentReason: d.codeAbsentReason ?? null,
          description: d.description,
          diagnosisType: d.diagnosisType,
          certainty: d.certainty,
        })),
        specialtyData: resolvedSpecialtyData?.data ?? null,
        previousHashSha256,
        encounterId,
      })
    );
    const signedAt = new Date();

    const signResult = await this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.create({
        data: {
          encounterId,
          ...requiredNote,
          vitals: computedVitals,
          noteTypeTermId: noteTypeTerm?.id ?? null,
          specialtyCode,
          // Prompt 37 (F4): indicaciones al paciente y próxima cita
          // sugerida viven en la nota firmada — de ahí sale el PDF de
          // indicaciones (38A) sin retrabajo.
          ...omitUndefined({ physicalExam, prognosis, patientInstructions, suggestedFollowUpDays }),
        },
      });
      // Prompt 26: la entidad de signos vitales — columnas tipadas con
      // unidad explícita, lista para graficar sin procesar texto.
      const hasAnyVital = Object.values(vitals).some((v) => v !== undefined);
      if (hasAnyVital) {
        await tx.vitalSignSet.create({
          data: {
            noteId: note.id,
            encounterId,
            patientId: encounter.patientId,
            bpSystolicMmHg: vitals.bpSystolic ?? null,
            bpDiastolicMmHg: vitals.bpDiastolic ?? null,
            heartRateBpm: vitals.heartRate ?? null,
            respiratoryRateBpm: vitals.respiratoryRate ?? null,
            temperatureC: vitals.tempC ?? null,
            spo2Percent: vitals.spo2 ?? null,
            glucoseCapMgDl: vitals.glucoseCapMgDl ?? null,
            capillaryRefillSeconds: vitals.capillaryRefillSeconds ?? null,
            weightKg: vitals.weightKg ?? null,
            heightCm: vitals.heightCm ?? null,
            headCircumferenceCm: vitals.headCircumferenceCm ?? null,
            abdominalCircumferenceCm: vitals.abdominalCircumferenceCm ?? null,
            bmi: computedVitals.bmi ?? null,
            bmiFormula: computedVitals.bmiFormula ?? null,
            bsaM2: computedVitals.bsaM2 ?? null,
            bsaFormula: computedVitals.bsaFormula ?? null,
            weightPercentile: percentiles?.weightPercentile ?? null,
            heightPercentile: percentiles?.heightPercentile ?? null,
            percentileSource: percentiles?.source ?? null,
            outOfRangeFlags: rangeFlags.outOfRange,
            criticalFlags: rangeFlags.critical,
          },
        });
      }
      // v2.5 · Capa 3: congelado en el mismo momento y con el mismo
      // patrón que vital_sign_sets — append-only real (GRANT SELECT,
      // INSERT, sin UPDATE/DELETE).
      if (noteLabResultsData.length > 0) {
        await tx.noteLabResult.createMany({
          data: noteLabResultsData.map((d) => ({ noteId: note.id, ...d })),
        });
      }
      if (diagnoses.length > 0) {
        // omitUndefined: icd10Code/codeAbsentReason son mutuamente
        // opcionales (segunda ruta de M8-RN-006, ver
        // encounterDiagnosisSchema) — el que no venga debe omitirse,
        // no mandarse como `undefined` explícito.
        //
        // createdAt: signedAt EXPLÍCITO (no @default(now()) del
        // servidor) — Fase 6/Prompt 45: NoteIntegrityService distingue
        // los diagnósticos que existían AL FIRMAR (entran al hash) de
        // los que una adenda posterior pudiera sumar (legítimo, no es
        // alteración) comparando createdAt <= signedAt. Postgres
        // now() dentro de una transacción devuelve el inicio de la
        // transacción, no el instante exacto del INSERT — unos
        // milisegundos DESPUÉS del signedAt ya calculado en JS antes
        // de abrir la transacción. Sin este valor explícito, ese
        // desfase hacía que el propio verificador reportara una nota
        // recién firmada, sin alterar, como "ALTERADA" (falso
        // positivo encontrado al escribir la prueba de integridad).
        await tx.encounterDiagnosis.createMany({
          data: diagnoses.map(({ icd10Code, codeAbsentReason, ...required }) => ({
            encounterId,
            ...required,
            createdAt: signedAt,
            // Prompt 28: FK real — validada arriba contra el catálogo.
            ...omitUndefined({ icd10Code, icd10CodeId: icd10Code, codeAbsentReason }),
          })),
        });
      }
      if (resolvedSpecialtyData && Object.keys(resolvedSpecialtyData.data).length > 0) {
        await tx.encounterSpecialtyData.create({
          data: {
            encounterId,
            specialtySchemaVersion: resolvedSpecialtyData.version,
            data: resolvedSpecialtyData.data as unknown as Prisma.InputJsonValue,
          },
        });
      }
      const updated = await tx.clinicalEncounter.update({
        where: { id: encounterId },
        data: {
          status: "SIGNED",
          endedAt: signedAt,
          signedAt,
          // M8-RN-013: la métrica del negocio, fijada en servidor.
          timeToSignSeconds: Math.max(0, Math.round((signedAt.getTime() - encounter.startedAt.getTime()) / 1000)),
          signedByUserId: doctorUserId,
          signatureMethod: "INTERNAL_SYSTEM",
          signedByLegalNameSnapshot,
          signedByLicenseSnapshot,
          contentHashSha256,
          previousHashSha256,
        },
      });
      return { encounter: updated, note };
    });
    const pregnancy = await this.patientClinical.getActivePregnancy(encounter.patientId);
    const presentingSymptomKeys = await this.resolveRedFlagSymptomKeys(presentingSymptomTermIds ?? []);
    const activeRedFlags = await this.redFlags.evaluateAndPersist(
      encounterId,
      { ageYears, isPregnant: pregnancy !== null, vitals, presentingSymptomKeys },
      patientForVitals.sexAtBirth
    );
    return { ...signResult, activeRedFlags };
  }

  // M5-RN-006/schema.prisma: "cuando M8 exista, la ruta real [a
  // completed] se vuelve la primaria". Se hace fuera de la
  // transacción de arriba a propósito: la firma de la nota (protegida
  // por R1/GRANT) es lo legalmente crítico y ya quedó comprometida en
  // disco; el estado de la cita es una conveniencia de agenda —
  // completeWithSignedNote() ya absorbe silenciosamente el caso en
  // que la cita no esté en IN_PROGRESS, así que esto nunca debe hacer
  // que sign() falle después de haber firmado con éxito.
  async signAndCompleteAppointment(encounterId: string, doctorUserId: string, input: ClinicalNoteSignInput) {
    const result = await this.sign(encounterId, doctorUserId, input);
    if (result.encounter.appointmentId) {
      await this.appointments.completeWithSignedNote(result.encounter.appointmentId, doctorUserId);
    }
    return result;
  }

  // M8-RN-001: "corregir = nota nueva con isCorrectionOfNoteId, nunca
  // UPDATE" — el modelo y el contrato (clinicalNoteCorrectionSchema)
  // ya existían desde que se construyó M8; esto es lo que faltaba
  // conectar. Reusa exactamente el mismo patrón de creación de
  // note+diagnoses que sign(), sobre un encounter que YA está SIGNED
  // (nunca lo vuelve a tocar: el encounter no se re-firma, solo gana
  // una nota más en su lista). Limitación heredada del esquema, no
  // introducida aquí: EncounterDiagnosis solo referencia encounterId,
  // no noteId — los diagnósticos de una corrección se suman a los
  // del encounter, no reemplazan a los de la nota original en la
  // base de datos (la interfaz decide cómo mostrarlo).
  async correctNote(encounterId: string, doctorUserId: string, input: ClinicalNoteCorrectionInput) {
    // Prompt 44A: "su propia firma" — una adenda reautentica igual que
    // firmar la nota original (clinicalNoteCorrectionSchema extiende
    // clinicalNoteSignSchema, así que password/totpCode ya viajan).
    await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);

    const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId } });
    if (!encounter) {
      throw new ApiException("ENCOUNTER_NOT_FOUND", "Encuentro no encontrado.", HttpStatus.NOT_FOUND);
    }
    if (encounter.status !== "SIGNED") {
      throw new ApiException(
        "ENCOUNTER_NOT_SIGNED",
        "Solo se puede corregir un encuentro ya firmado. Un borrador se edita directamente.",
        HttpStatus.CONFLICT
      );
    }
    const original = await this.prisma.clinicalNote.findUnique({ where: { id: input.isCorrectionOfNoteId } });
    if (!original || original.encounterId !== encounterId) {
      throw new ApiException(
        "NOTE_NOT_FOUND",
        "La nota que se intenta corregir no existe o no pertenece a este encuentro.",
        HttpStatus.NOT_FOUND
      );
    }

    const {
      diagnoses,
      physicalExam,
      prognosis,
      vitals,
      isCorrectionOfNoteId,
      patientInstructions,
      suggestedFollowUpDays,
      password: _password,
      totpCode: _totpCode,
      ...requiredNote
    } = input;
    void _password;
    void _totpCode;
    const computedVitals = withComputedVitals(vitals);

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.create({
        data: {
          encounterId,
          isCorrectionOfNoteId,
          ...requiredNote,
          vitals: computedVitals,
          ...omitUndefined({ physicalExam, prognosis, patientInstructions, suggestedFollowUpDays }),
        },
      });
      if (diagnoses.length > 0) {
        await tx.encounterDiagnosis.createMany({
          data: diagnoses.map(({ icd10Code, codeAbsentReason, ...required }) => ({
            encounterId,
            ...required,
            // Prompt 28: FK real — validada arriba contra el catálogo.
            ...omitUndefined({ icd10Code, icd10CodeId: icd10Code, codeAbsentReason }),
          })),
        });
      }
      return note;
    });
  }

  // M8-RN-003: un draft sin firmar >72h se marca abandonado —
  // evaluado en el momento del acceso, sin scheduler (mismo patrón
  // que CareRelationship/PatientGuardian).
  // Prompt 27: percentilas de peso y talla por edad y sexo (pacientes
  // pediátricos, <20 años). LMS de growth_references (OMS 2006 /
  // CDC 2000); se elige la fila de edad más cercana, prefiriendo OMS
  // en 0-60 meses. Fórmula y fuente quedan almacenadas con el valor.
  private async computeGrowthPercentiles(
    ageYears: number,
    sexAtBirth: string,
    vitals: { weightKg?: number | undefined; heightCm?: number | undefined }
  ): Promise<{ weightPercentile?: number; heightPercentile?: number; source?: string } | null> {
    if (ageYears >= 20 || (vitals.weightKg === undefined && vitals.heightCm === undefined)) return null;
    const ageMonths = ageYears * 12;
    const source = ageMonths <= 60 ? "OMS_2006" : "CDC_2000";
    const result: { weightPercentile?: number; heightPercentile?: number; source?: string } = {};
    for (const [measure, value, key] of [
      ["WEIGHT_FOR_AGE", vitals.weightKg, "weightPercentile"],
      ["HEIGHT_FOR_AGE", vitals.heightCm, "heightPercentile"],
    ] as const) {
      if (value === undefined) continue;
      const rows = await this.prisma.growthReference.findMany({
        where: { sex: sexAtBirth, measure, source },
        orderBy: { ageMonths: "asc" },
      });
      if (rows.length === 0) continue;
      const nearest = rows.reduce((best, row) =>
        Math.abs(Number(row.ageMonths) - ageMonths) < Math.abs(Number(best.ageMonths) - ageMonths) ? row : best
      );
      result[key] = lmsPercentile(value, Number(nearest.l), Number(nearest.m), Number(nearest.s));
      result.source = `${source} · ${LMS_FORMULA}`;
    }
    return result.source ? result : null;
  }

  private async assertDraft(encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId } });
    if (!encounter) {
      throw new ApiException("ENCOUNTER_NOT_FOUND", "Encuentro no encontrado.", HttpStatus.NOT_FOUND);
    }
    if (encounter.status !== "DRAFT") {
      throw new ApiException("ENCOUNTER_ALREADY_SIGNED", "Este encuentro ya fue firmado y no se puede modificar.", HttpStatus.CONFLICT);
    }
    const ageHours = (Date.now() - encounter.startedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > ABANDONED_AFTER_HOURS && !encounter.abandonedAt) {
      await this.prisma.clinicalEncounter.update({ where: { id: encounterId }, data: { abandonedAt: new Date() } });
      throw new ApiException(
        "ENCOUNTER_ABANDONED",
        "Este borrador lleva más de 72 horas sin firmarse y se marcó como abandonado.",
        HttpStatus.CONFLICT
      );
    }
    return encounter;
  }
}
