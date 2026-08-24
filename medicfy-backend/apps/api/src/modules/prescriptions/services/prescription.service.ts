import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ExternalPhysicalPrescriptionCreateInput, PrescriptionCreateInput } from "@medicfy/contracts";
import type { Doctor, Patient, PracticeLocation, Specialty } from "@prisma/client";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { sha256Hex } from "../../../common/content-hash.util";
import { nextPrescriptionFolio } from "../../../common/folio.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { SignatureVerificationService } from "../../identity/services/signature-verification.service";

function ageInYears(birthDate: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function formatAddress(location: { addressStreet: string | null; addressExt: string | null; addressColonia: string | null; addressMunicipality: string | null; addressState: string | null } | null): string {
  if (!location) return "Domicilio profesional no registrado.";
  return [location.addressStreet, location.addressExt, location.addressColonia, location.addressMunicipality, location.addressState]
    .filter(Boolean)
    .join(", ");
}

// M9 — RECETA ELECTRÓNICA (Grupos III-VI). R5/M9-RN-012: Grupos I/II
// bloqueados, bloqueo duro. M9-RN-006: nunca UPDATE, "cancelar" y
// "reemitir" son filas nuevas (ver schema.prisma).
@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureVerification: SignatureVerificationService
  ) {}

  // M9-RN-004: snapshot inmutable de los datos legales al momento de
  // emitir — compartido entre create() y createExternalPhysical(),
  // nunca resuelto por join después.
  private buildLegalSnapshot(doctor: Doctor & { primarySpecialty: Specialty | null; locations: PracticeLocation[] }, patient: Patient) {
    const location = doctor.locations[0] ?? null;
    return {
      doctorNameSnapshot: doctor.displayName ?? `${doctor.legalFirstName} ${doctor.legalLastName}`,
      doctorLicenseSnapshot: doctor.professionalLicense,
      practiceAddressSnapshot: formatAddress(location),
      patientNameSnapshot: `${patient.firstName} ${patient.lastNamePaternal} ${patient.lastNameMaternal ?? ""}`.trim(),
      patientAgeSnapshot: ageInYears(patient.birthDate),
      patientSexSnapshot: patient.sexAtBirth,
      ...omitUndefined({
        doctorSpecialtySnapshot: doctor.primarySpecialty?.nameEs,
        doctorInstitutionSnapshot: doctor.university ?? undefined,
      }),
    };
  }

  async create(encounterId: string, doctorId: string, doctorUserId: string, patientId: string, input: PrescriptionCreateInput) {
    await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);

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
    const activeAllergies = await this.prisma.patientAllergy.findMany({ where: { patientId, status: "ACTIVE" } });
    const conflicts = input.items
      .map((item) => ({ item, catalog: catalogById.get(item.medicationCatalogId) }))
      .filter(({ catalog }) => catalog && activeAllergies.some((a) => catalog.genericName.toLowerCase().includes(a.substance.toLowerCase()) || a.substance.toLowerCase().includes(catalog.genericName.toLowerCase())));

    if (conflicts.length > 0 && !input.allergyOverrideConfirmed) {
      throw new ApiException(
        "PRESCRIPTION_ALLERGY_CONFLICT",
        "El paciente tiene una alergia registrada a uno de estos medicamentos. Confirma explícitamente para continuar.",
        HttpStatus.CONFLICT,
        { medications: conflicts.map(({ catalog }) => catalog?.genericName) }
      );
    }

    // M9-RN-008c: duplicidad terapéutica — advertencia, no bloquea.
    const activeMedications = await this.prisma.patientMedication.findMany({ where: { patientId, status: "ACTIVE" } });
    const duplicates = input.items
      .map((item) => catalogById.get(item.medicationCatalogId))
      .filter((catalog) => catalog && activeMedications.some((m) => m.genericName.toLowerCase() === catalog.genericName.toLowerCase()))
      .map((catalog) => catalog?.genericName);

    const folio = await nextPrescriptionFolio(this.prisma);
    const signatureTimestamp = new Date();
    const snapshot = this.buildLegalSnapshot(doctor, patient);

    const items = input.items.map((item) => {
      const catalog = catalogById.get(item.medicationCatalogId);
      if (!catalog) throw new Error("unreachable: validated above");
      return {
        genericName: catalog.genericName,
        presentation: (catalog.presentations as { label?: string }[] | null)?.[0]?.label ?? "N/A",
        dose: item.dose,
        route: item.route,
        frequency: item.frequency,
        duration: item.duration,
        medicationCatalogId: catalog.id,
        controlGroup: catalog.controlGroup,
        ...omitUndefined({
          brandName: catalog.brandNames[0],
          quantity: item.quantity,
          specialInstructions: item.specialInstructions,
        }),
      };
    });

    const contentHashSha256 = sha256Hex({ folio, snapshot, items, diagnosisSnapshot: input.diagnosisSnapshot, signatureTimestamp });
    const qrVerificationToken = randomUUID();

    const prescription = await this.prisma.prescription.create({
      data: {
        encounterId,
        patientId,
        doctorId,
        folio,
        ...snapshot,
        diagnosisSnapshot: input.diagnosisSnapshot,
        signatureMethod: "INTERNAL_SYSTEM",
        signatureTimestamp,
        contentHashSha256,
        qrVerificationToken,
        ...omitUndefined({ generalInstructions: input.generalInstructions }),
        items: { create: items },
      },
      include: { items: true },
    });

    return { prescription, warnings: { therapeuticDuplicates: duplicates } };
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
    const [doctor, patient] = await Promise.all([
      this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { primarySpecialty: true, locations: { where: { isPrimary: true }, take: 1 } } }),
      this.prisma.patient.findUnique({ where: { id: patientId } }),
    ]);
    if (!doctor || !patient) {
      throw new ApiException("PRESCRIPTION_MISSING_LEGAL_FIELD", "No se pudo resolver médico o paciente para el registro.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const folio = await nextPrescriptionFolio(this.prisma);
    const snapshot = this.buildLegalSnapshot(doctor, patient);

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
      include: { cancellation: true },
    });
    if (!prescription) {
      throw new ApiException("PRESCRIPTION_NOT_FOUND", "Receta no encontrada.", HttpStatus.NOT_FOUND);
    }
    // M9-RN-010: nunca el contenido de la receta — solo folio, fecha,
    // médico y nombre del paciente parcialmente enmascarado.
    return {
      folio: prescription.folio,
      issuedAt: prescription.issuedAt,
      doctorName: prescription.doctorNameSnapshot,
      doctorLicense: prescription.doctorLicenseSnapshot,
      patientNameMasked: maskPatientName(prescription.patientNameSnapshot),
      status: prescription.cancellation ? "CANCELLED" : "ISSUED",
    };
  }
}

// M9-RN-010: "María G. L." — primer nombre completo, iniciales del resto.
function maskPatientName(fullName: string): string {
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  return [first, ...rest.map((p) => `${p.charAt(0)}.`)].join(" ");
}
