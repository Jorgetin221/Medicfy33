import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ExternalPhysicalPrescriptionCreateInput, PrescriptionCreateInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { sha256Hex } from "../../../common/content-hash.util";
import { nextPrescriptionFolio } from "../../../common/folio.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { buildLegalSnapshot } from "../../../common/legal-snapshot.util";
import { SignatureVerificationService } from "../../identity/services/signature-verification.service";
import { FILE_STORAGE_PORT, type FileStoragePort } from "../../doctors/services/file-storage.port";
import { PrescriptionPdfService } from "./prescription-pdf.service";
import { derivePrescriptionStatus } from "../prescription-status.util";
import { crossCheckAllergies } from "../allergy-cross-check.util";

// M9 — RECETA ELECTRÓNICA (Grupos III-VI). R5/M9-RN-012: Grupos I/II
// bloqueados, bloqueo duro. M9-RN-006: nunca UPDATE, "cancelar" y
// "reemitir" son filas nuevas (ver schema.prisma).
@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureVerification: SignatureVerificationService,
    private readonly pdfService: PrescriptionPdfService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort,
    private readonly audit: AuditService
  ) {}

  // Corrección v2.1 de especificacion-plataforma-clinica-con-ia.md
  // §1: "la firma digital no debe ser obligatoria para imprimir una
  // receta". verify() (contraseña+TOTP, M9-RN-009) solo aplica a la
  // ruta ELECTRONIC — el discriminated union de PrescriptionCreateInput
  // ya garantiza que password/totpCode ni siquiera existen en el
  // input cuando la ruta es HANDWRITTEN_AFTER_PRINT.
  async create(encounterId: string, doctorId: string, doctorUserId: string, patientId: string, input: PrescriptionCreateInput) {
    if (input.signatureRoute === "ELECTRONIC") {
      await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);
    }

    // Prompt 32 (Fase 4, letra del doc de 58 prompts): "la receta
    // pertenece a una nota firmada. Un borrador no emite recetas." La
    // línea se compone durante la consulta, pero la EMISIÓN (folio,
    // snapshot legal, PDF) exige el encuentro FIRMADO.
    const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId }, select: { status: true } });
    if (!encounter || encounter.status !== "SIGNED") {
      throw new ApiException(
        "PRESCRIPTION_REQUIRES_SIGNED_NOTE",
        "La receta se emite desde una nota FIRMADA — firma la consulta primero; un borrador no emite documentos.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const [doctor, patient] = await Promise.all([
      this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { primarySpecialty: true, locations: { where: { isPrimary: true }, take: 1 } } }),
      this.prisma.patient.findUnique({ where: { id: patientId } }),
    ]);
    if (!doctor || !patient) {
      throw new ApiException("PRESCRIPTION_MISSING_LEGAL_FIELD", "No se pudo resolver médico o paciente para la receta.", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const catalogIds = input.items.map((item) => item.medicationCatalogId);
    const catalogEntries = await this.prisma.medicationCatalog.findMany({ where: { id: { in: catalogIds } } });
    const catalogById = new Map(catalogEntries.map((c) => [c.id, c]));

    const missing = catalogIds.filter((id) => !catalogById.has(id));
    if (missing.length > 0) {
      throw new ApiException("PRESCRIPTION_MISSING_LEGAL_FIELD", "Uno o más medicamentos no existen en el catálogo.", HttpStatus.UNPROCESSABLE_ENTITY, { missing });
    }

    // R5/M9-RN-012: bloqueo duro, no se puede forzar desde ninguna ruta.
    const controlled = input.items
      .map((item) => ({ item, catalog: catalogById.get(item.medicationCatalogId) }))
      .filter(({ catalog }) => catalog && !catalog.isElectronicallyPrescribable);
    if (controlled.length > 0) {
      throw new ApiException(
        "PRESCRIPTION_CONTROLLED_BLOCKED",
        "Este medicamento requiere recetario físico con código de barras de COFEPRIS. Medicfy no puede emitir esta receta electrónicamente.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        { medications: controlled.map(({ catalog }) => catalog?.genericName) }
      );
    }

    // M8-RN-008/M9-RN-008a: cruce automático contra alergias activas.
    // Por principio activo, nombre comercial Y grupo terapéutico
    // (prompt 34). La comparación por subcadenas que había aquí antes
    // dejaba pasar amoxicilina con alergia a penicilinas y disparaba
    // con una alergia capturada como "no" — ver allergy-cross-check.util.ts.
    const activeAllergies = await this.prisma.patientAllergy.findMany({ where: { patientId, status: "ACTIVE" } });
    const prescribedDrugs = input.items
      .map((item) => catalogById.get(item.medicationCatalogId))
      .filter((catalog): catalog is NonNullable<typeof catalog> => catalog !== undefined);

    const allergyCheck = crossCheckAllergies(activeAllergies, prescribedDrugs);

    if (allergyCheck.matches.length > 0) {
      // Prompt 35: "toda advertencia mostrada queda en bitácora".
      await this.audit.log({
        actorUserId: doctorUserId,
        action: "PRESCRIPTION_ALLERGY_CONFLICT_SHOWN",
        resourceType: "PRESCRIPTION_ATTEMPT",
        patientId,
        result: "DENIED",
        metadata: { medications: allergyCheck.matches.map((m) => m.genericName) },
      });
    }
    if (allergyCheck.matches.length > 0 && !input.allergyOverrideJustification) {
      throw new ApiException(
        "PRESCRIPTION_ALLERGY_CONFLICT",
        "El paciente tiene una alergia registrada a uno de estos medicamentos. El bloqueo solo se libera capturando una justificación clínica, que queda registrada y firmada en el expediente.",
        HttpStatus.CONFLICT,
        {
          medications: allergyCheck.matches.map((m) => m.genericName),
          // El prompt 34 pide que el mensaje diga qué alergia, con qué
          // reacción, quién la registró y cuándo, y por qué el fármaco
          // coincide. Todo eso viaja aquí, no sólo el nombre.
          conflicts: allergyCheck.matches.map((m) => ({
            medication: m.genericName,
            substance: m.substance,
            reaction: m.reaction,
            severity: m.severity,
            registeredBy: m.source,
            registeredAt: m.registeredAt,
            basis: m.basis,
            explanation: m.explanation,
          })),
        }
      );
    }

    if (allergyCheck.matches.length > 0 && input.allergyOverrideJustification) {
      // Prompt 34: la liberación del bloqueo queda en bitácora con la
      // justificación (y además firmada dentro del snapshot de la
      // receta, ver allergyOverrideJustification en el insert).
      await this.audit.log({
        actorUserId: doctorUserId,
        action: "PRESCRIPTION_ALLERGY_OVERRIDE",
        resourceType: "PRESCRIPTION_ATTEMPT",
        patientId,
        result: "SUCCESS",
        justification: input.allergyOverrideJustification,
        metadata: { medications: allergyCheck.matches.map((m) => m.genericName) },
      });
    }

    // Prompt 35 — interacciones fármaco-fármaco (motor; datos reales
    // con la base licenciada 🔒). Se verifica la receta en curso MÁS
    // la medicación crónica vigente, no solo lo que se está
    // escribiendo. GRAVE → confirmación explícita obligatoria;
    // MODERADA → informa sin bloquear. Todo a bitácora.
    const interactionWarnings = await this.checkInteractions(patientId, doctorUserId, catalogEntries, input.interactionOverrideConfirmed === true);

    // M9-RN-008c: duplicidad terapéutica — advertencia, no bloquea.
    const activeMedications = await this.prisma.patientMedication.findMany({ where: { patientId, status: "ACTIVE" } });
    const duplicates = input.items
      .map((item) => catalogById.get(item.medicationCatalogId))
      .filter((catalog) => catalog && activeMedications.some((m) => m.genericName.toLowerCase() === catalog.genericName.toLowerCase()))
      .map((catalog) => catalog?.genericName);

    // M9-RN-008c extendida (2026-08-24, a petición explícita del
    // usuario — Fase 2 "alertas de interacciones y alergias"): misma
    // subclase farmacológica por prefijo ATC (OMS ATC/DDD; los
    // primeros 4 caracteres son el grupo farmacológico, p. ej. N02A
    // = opioides), para detectar dos medicamentos de la misma clase
    // con nombre distinto (dos AINEs, dos opioides). No es una
    // interacción fármaco-fármaco real (eso exige una fuente de
    // datos clínicos que hoy no existe en el proyecto — se preguntó
    // y se deferió explícitamente) — solo agrupa por la clasificación
    // pública de la OMS ya presente en el catálogo, nunca una
    // afirmación clínica inventada.
    const classDuplicates: { prescribedMedication: string; existingMedication: string }[] = [];
    if (activeMedications.length > 0) {
      const activeCatalogEntries = await this.prisma.medicationCatalog.findMany({ where: { isActive: true } });
      const atcPrefixByActiveName = new Map(
        activeCatalogEntries.flatMap((c) => (c.atcCode ? [[c.genericName.toLowerCase(), c.atcCode.slice(0, 4)] as const] : []))
      );
      for (const item of input.items) {
        const catalog = catalogById.get(item.medicationCatalogId);
        if (!catalog || !catalog.atcCode) continue;
        const prefix = catalog.atcCode.slice(0, 4);
        for (const active of activeMedications) {
          const isSameName = active.genericName.toLowerCase() === catalog.genericName.toLowerCase();
          const isSameClass = atcPrefixByActiveName.get(active.genericName.toLowerCase()) === prefix;
          if (!isSameName && isSameClass) {
            classDuplicates.push({ prescribedMedication: catalog.genericName, existingMedication: active.genericName });
          }
        }
      }
    }

    const folio = await nextPrescriptionFolio(this.prisma);
    const signatureTimestamp = new Date();
    const snapshot = buildLegalSnapshot(doctor, patient);

    // Prompt 36: si una línea declara procedencia heredada, la receta
    // de origen debe existir, ser de ESTE paciente y este médico — y
    // la fecha de origen la fija el servidor desde esa fila.
    const sourceIds = [...new Set(input.items.map((i) => i.sourcePrescriptionId).filter((v): v is string => v !== undefined))];
    const sourcePrescriptions = new Map(
      (
        await this.prisma.prescription.findMany({
          where: { id: { in: sourceIds }, patientId, doctorId },
          select: { id: true, issuedAt: true },
        })
      ).map((sp) => [sp.id, sp])
    );
    const invalidSources = sourceIds.filter((id) => !sourcePrescriptions.has(id));
    if (invalidSources.length > 0) {
      throw new ApiException(
        "PRESCRIPTION_SOURCE_INVALID",
        "La receta de origen de una línea heredada no existe o no pertenece a este paciente y médico.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        { invalidSources }
      );
    }

    const items = input.items.map((item) => {
      const catalog = catalogById.get(item.medicationCatalogId);
      if (!catalog) throw new Error("unreachable: validated above");
      const source = item.sourcePrescriptionId ? sourcePrescriptions.get(item.sourcePrescriptionId) : undefined;
      return {
        genericName: catalog.genericName,
        presentation: (catalog.presentations as { label?: string }[] | null)?.[0]?.label ?? "N/A",
        dose: item.dose,
        route: item.route,
        frequency: item.frequency,
        duration: item.duration,
        medicationCatalogId: catalog.id,
        controlGroup: catalog.controlGroup,
        origin: item.origin ?? "NUEVA",
        ...omitUndefined({
          brandName: catalog.brandNames[0],
          quantity: item.quantity,
          specialInstructions: item.specialInstructions,
          doseUnit: item.doseUnit,
          indication: item.indication,
          sourcePrescriptionId: source?.id,
          sourceIssuedAt: source?.issuedAt,
        }),
      };
    });

    const contentHashSha256 = sha256Hex({ folio, snapshot, items, diagnosisSnapshot: input.diagnosisSnapshot, signatureTimestamp });
    const qrVerificationToken = randomUUID();

    // Huella documental (§29 del documento nuevo) y PDF se generan
    // ANTES del insert, con datos ya calculados localmente — nunca
    // hay un segundo paso de UPDATE sobre la fila (R1). El PDF se
    // genera para las dos rutas por igual; solo cambia qué pie de
    // firma dibuja (ver PrescriptionPdfService).
    const pdfBuffer = await this.pdfService.generate({
      folio,
      issuedAt: signatureTimestamp,
      signatureRoute: input.signatureRoute,
      signatureTimestamp: input.signatureRoute === "ELECTRONIC" ? signatureTimestamp : null,
      ...snapshot,
      diagnosisSnapshot: input.diagnosisSnapshot,
      items,
      qrVerificationToken,
      ...omitUndefined({ generalInstructions: input.generalInstructions }),
    });
    const pdfFileKey = `prescriptions/${folio}/receta.pdf`;
    await this.fileStorage.store({ fileKey: pdfFileKey, buffer: pdfBuffer, contentType: "application/pdf" });

    const prescription = await this.prisma.prescription.create({
      data: {
        encounterId,
        patientId,
        doctorId,
        folio,
        ...snapshot,
        diagnosisSnapshot: input.diagnosisSnapshot,
        signatureRoute: input.signatureRoute,
        contentHashSha256,
        qrVerificationToken,
        pdfFileKey,
        ...omitUndefined({
          generalInstructions: input.generalInstructions,
          allergyOverrideJustification: input.allergyOverrideJustification,
          signatureMethod: input.signatureRoute === "ELECTRONIC" ? ("INTERNAL_SYSTEM" as const) : undefined,
          signatureTimestamp: input.signatureRoute === "ELECTRONIC" ? signatureTimestamp : undefined,
        }),
        items: { create: items },
      },
      include: { items: true },
    });

    // Prompt 32: "la medicación vigente del paciente se actualiza
    // automáticamente con cada receta emitida" — es lo que la barra de
    // contexto (Zona 1) muestra. Anclada al catálogo (P4 #11).
    for (const item of items) {
      const existing = await this.prisma.patientMedication.findFirst({
        where: { patientId, genericName: item.genericName, status: "ACTIVE" },
      });
      const doseText = item.doseUnit ? `${item.dose} ${item.doseUnit}` : item.dose;
      if (existing) {
        await this.prisma.patientMedication.update({
          where: { id: existing.id },
          data: { dose: doseText, route: item.route, frequency: item.frequency, prescriber: "Receta Medicfy", source: "MEDICO" },
        });
      } else {
        await this.prisma.patientMedication.create({
          data: {
            patientId,
            genericName: item.genericName,
            dose: doseText,
            route: item.route,
            frequency: item.frequency,
            status: "ACTIVE",
            source: "MEDICO",
            prescriber: "Receta Medicfy",
            startedAt: signatureTimestamp,
          },
        });
      }
    }

    // Prompt 38A: bitácora de emisión por documento — quién, cuándo,
    // y el folio queda registrado.
    await this.audit.log({
      actorUserId: doctorUserId,
      action: "DOCUMENT_EMITTED",
      resourceType: "PRESCRIPTION",
      resourceId: prescription.id,
      patientId,
      result: "SUCCESS",
      metadata: { folio, documentType: "RECETA" },
    });

    return {
      interactionWarnings,
      prescription,
      warnings: {
        therapeuticDuplicates: duplicates,
        therapeuticClassDuplicates: classDuplicates,
        // Alergias activas que el cruce no pudo resolver a ningún
        // principio activo ni a una familia conocida. No es "sin
        // conflicto": es "no lo pude comprobar", y el médico tiene
        // que verlo. Desaparece solo cuando `substance` se estructure
        // contra catálogo (Fase 4, R3).
        unverifiableAllergies: allergyCheck.unverifiable,
      },
    };
  }

  // Corrección v2.1 §17.4: "Firmada y entregada" es una declaración
  // manual del médico, nunca una verificación real de que la firma
  // ocurrió — el propio documento lo pide explícito. Solo aplica a
  // HANDWRITTEN_AFTER_PRINT; R1 impide un UPDATE sobre prescriptions,
  // así que se modela igual que cancelar: una fila nueva en una
  // tabla satélite, cuya sola existencia es el estado "confirmada".
  async confirmHandwrittenDelivery(prescriptionId: string, confirmedByUserId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { handwrittenDelivery: true },
    });
    if (!prescription) {
      throw new ApiException("PRESCRIPTION_NOT_FOUND", "Receta no encontrada.", HttpStatus.NOT_FOUND);
    }
    if (prescription.signatureRoute !== "HANDWRITTEN_AFTER_PRINT") {
      throw new ApiException(
        "PRESCRIPTION_NOT_HANDWRITTEN_ROUTE",
        "Esta receta no se emitió por la ruta de firma autógrafa.",
        HttpStatus.CONFLICT
      );
    }
    if (prescription.handwrittenDelivery) {
      throw new ApiException("PRESCRIPTION_ALREADY_CONFIRMED", "Esta receta ya fue confirmada como firmada y entregada.", HttpStatus.CONFLICT);
    }
    return this.prisma.prescriptionHandwrittenDelivery.create({ data: { prescriptionId, confirmedByUserId } });
  }

  async cancel(prescriptionId: string, cancelledByUserId: string, reason: string) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id: prescriptionId }, include: { cancellation: true } });
    if (!prescription) {
      throw new ApiException("PRESCRIPTION_NOT_FOUND", "Receta no encontrada.", HttpStatus.NOT_FOUND);
    }
    if (prescription.cancellation) {
      throw new ApiException("PRESCRIPTION_ALREADY_CANCELLED", "Esta receta ya fue cancelada.", HttpStatus.CONFLICT);
    }
    return this.prisma.prescriptionCancellation.create({
      data: { prescriptionId, reason, cancelledByUserId },
    });
  }

  async createExternalPhysical(encounterId: string, doctorId: string, patientId: string, input: ExternalPhysicalPrescriptionCreateInput) {
    // Prompt 32 (Fase 4, letra del doc de 58 prompts): "la receta
    // pertenece a una nota firmada. Un borrador no emite recetas." La
    // línea se compone durante la consulta, pero la EMISIÓN (folio,
    // snapshot legal, PDF) exige el encuentro FIRMADO.
    const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId }, select: { status: true } });
    if (!encounter || encounter.status !== "SIGNED") {
      throw new ApiException(
        "PRESCRIPTION_REQUIRES_SIGNED_NOTE",
        "La receta se emite desde una nota FIRMADA — firma la consulta primero; un borrador no emite documentos.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const [doctor, patient] = await Promise.all([
      this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { primarySpecialty: true, locations: { where: { isPrimary: true }, take: 1 } } }),
      this.prisma.patient.findUnique({ where: { id: patientId } }),
    ]);
    if (!doctor || !patient) {
      throw new ApiException("PRESCRIPTION_MISSING_LEGAL_FIELD", "No se pudo resolver médico o paciente para el registro.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const folio = await nextPrescriptionFolio(this.prisma);
    const snapshot = buildLegalSnapshot(doctor, patient);

    return this.prisma.prescription.create({
      data: {
        encounterId,
        patientId,
        doctorId,
        folio,
        prescriptionType: "EXTERNAL_PHYSICAL",
        physicalRecipeFolio: input.physicalFolio,
        ...snapshot,
        diagnosisSnapshot: "Registro de receta física — ver expediente.",
        items: {
          create: [
            {
              genericName: input.genericName,
              presentation: "Recetario físico",
              dose: input.dose,
              route: input.route,
              frequency: input.frequency,
              duration: input.duration,
              controlGroup: input.controlGroup,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  async getByVerificationToken(token: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { qrVerificationToken: token },
      include: { cancellation: true, handwrittenDelivery: true },
    });
    if (!prescription) {
      throw new ApiException("PRESCRIPTION_NOT_FOUND", "Receta no encontrada.", HttpStatus.NOT_FOUND);
    
}
    // M9-RN-010: nunca el contenido de la receta — solo folio, fecha,
    // médico y nombre del paciente parcialmente enmascarado.
    // "PENDING_HANDWRITTEN_SIGNATURE" no es contenido clínico, es el
    // mismo tipo de estado administrativo que ISSUED/CANCELLED ya
    // exponía — corresponde al estado "Impresa – pendiente de firma
    // autógrafa" del §19.3 del documento nuevo.
    return {
      folio: prescription.folio,
      issuedAt: prescription.issuedAt,
      doctorName: prescription.doctorNameSnapshot,
      doctorLicense: prescription.doctorLicenseSnapshot,
      patientNameMasked: maskPatientName(prescription.patientNameSnapshot),
      status: derivePrescriptionStatus(prescription),
    };
  }

  async getPdf(prescriptionId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const prescription = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!prescription?.pdfFileKey) {
      throw new ApiException("PRESCRIPTION_PDF_NOT_FOUND", "No hay un PDF disponible para esta receta.", HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.retrieve(prescription.pdfFileKey);
  }

  // Prompt 35 — motor de interacciones: receta en curso + medicación
  // crónica vigente. GRAVE sin confirmación → 409; MODERADA → se
  // informa y se audita. Los DATOS de producción llegan con la base
  // licenciada (🔒 prompt 33) — hoy hay pares de demostración marcados.
  private async checkInteractions(
    patientId: string,
    doctorUserId: string,
    prescribed: { id: string; genericName: string }[],
    overrideConfirmed: boolean
  ): Promise<{ severity: string; medications: [string, string]; description: string; source: string }[]> {
    // Universo: lo prescrito + la medicación vigente anclable al catálogo.
    const activeMeds = await this.prisma.patientMedication.findMany({ where: { patientId, status: "ACTIVE" } });
    const activeCatalog = await this.prisma.medicationCatalog.findMany({
      where: { genericName: { in: activeMeds.map((m) => m.genericName) } },
      select: { id: true, genericName: true },
    });
    const universe = new Map<string, string>();
    for (const med of [...prescribed, ...activeCatalog]) universe.set(med.id, med.genericName);
    const ids = [...universe.keys()];
    if (ids.length < 2) return [];
    const prescribedIds = new Set(prescribed.map((p) => p.id));
    const interactions = await this.prisma.medicationInteraction.findMany({
      where: { medicationAId: { in: ids }, medicationBId: { in: ids } },
    });
    // Solo interesan pares donde al menos un lado se está prescribiendo.
    const relevant = interactions.filter((i) => prescribedIds.has(i.medicationAId) || prescribedIds.has(i.medicationBId));
    if (relevant.length === 0) return [];

    const describe = (i: (typeof relevant)[number]) => ({
      severity: i.severity,
      medications: [universe.get(i.medicationAId) ?? "?", universe.get(i.medicationBId) ?? "?"] as [string, string],
      description: i.description,
      source: i.source,
    });
    const grave = relevant.filter((i) => i.severity === "GRAVE");
    const moderada = relevant.filter((i) => i.severity === "MODERADA");

    for (const i of relevant) {
      await this.audit.log({
        actorUserId: doctorUserId,
        action: i.severity === "GRAVE" ? "PRESCRIPTION_INTERACTION_GRAVE_SHOWN" : "PRESCRIPTION_INTERACTION_MODERADA_SHOWN",
        resourceType: "PRESCRIPTION_ATTEMPT",
        patientId,
        result: i.severity === "GRAVE" && !overrideConfirmed ? "DENIED" : "SUCCESS",
        metadata: describe(i),
      });
    }
    if (grave.length > 0 && !overrideConfirmed) {
      throw new ApiException(
        "PRESCRIPTION_INTERACTION_GRAVE",
        "Hay interacciones GRAVES entre lo prescrito y/o la medicación vigente — confirma explícitamente para continuar.",
        HttpStatus.CONFLICT,
        { interactions: grave.map(describe) }
      );
    }
    if (grave.length > 0 && overrideConfirmed) {
      await this.audit.log({
        actorUserId: doctorUserId,
        action: "PRESCRIPTION_INTERACTION_GRAVE_CONFIRMED",
        resourceType: "PRESCRIPTION_ATTEMPT",
        patientId,
        result: "SUCCESS",
        metadata: { interactions: grave.map(describe) },
      });
    }
    return [...grave, ...moderada].map(describe);
  }

  // Prompt 36 — "traer última receta": las líneas de la receta
  // anterior del MISMO médico como líneas EDITABLES con su procedencia
  // y fecha de origen — nunca texto pegado.
  async lastPrescriptionLines(patientId: string, doctorId: string) {
    const last = await this.prisma.prescription.findFirst({
      where: { patientId, doctorId, cancellation: null },
      orderBy: { issuedAt: "desc" },
      include: { items: true },
    });
    if (!last) return { prescription: null, lines: [] };
    return {
      prescription: { id: last.id, folio: last.folio, issuedAt: last.issuedAt },
      lines: last.items.map((item) => ({
        medicationCatalogId: item.medicationCatalogId,
        genericName: item.genericName,
        presentation: item.presentation,
        dose: item.dose,
        doseUnit: item.doseUnit,
        indication: item.indication,
        route: item.route,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions,
        // Procedencia propuesta — el cliente la manda de regreso y el
        // servidor revalida la receta de origen al emitir.
        origin: "HEREDADA" as const,
        sourcePrescriptionId: last.id,
        sourceIssuedAt: last.issuedAt,
      })),
    };
  }

  // Prompt 38A: bitácora de impresión por documento — cuántas veces se
  // deriva contando los eventos en audit_log.
  async registerPrinted(prescriptionId: string, patientId: string, actorUserId: string) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id: prescriptionId }, select: { folio: true, patientId: true } });
    if (!prescription || prescription.patientId !== patientId) {
      throw new ApiException("PRESCRIPTION_NOT_FOUND", "Receta no encontrada para este paciente.", HttpStatus.NOT_FOUND);
    }
    await this.audit.log({
      actorUserId,
      action: "DOCUMENT_PRINTED",
      resourceType: "PRESCRIPTION",
      resourceId: prescriptionId,
      patientId,
      result: "SUCCESS",
      metadata: { folio: prescription.folio, documentType: "RECETA" },
    });
    return { ok: true };
  }
}

// M9-RN-010: "María G. L." — primer nombre completo, iniciales del resto.
function maskPatientName(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  return [first, ...rest.map((p) => `${p.charAt(0)}.`)].join(" ");

}
