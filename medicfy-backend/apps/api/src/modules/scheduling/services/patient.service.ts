import { HttpStatus, Injectable } from "@nestjs/common";
import type { Patient } from "@prisma/client";
import type { PatientCreateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { CareRelationshipService } from "./care-relationship.service";
import { PatientGuardianService } from "./patient-guardian.service";

@Injectable()
export class PatientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly careRelationshipService: CareRelationshipService,
    private readonly patientGuardianService: PatientGuardianService
  ) {}

  // M2-CA-009: "un médico crea un paciente sin cuenta de usuario,
  // queda con medicfy_id legible y source = created_by_doctor, y se
  // genera automáticamente el care_relationship correspondiente."
  // Todo en una transacción — el care_relationship no es una
  // consecuencia eventual, es parte de la misma operación atómica.
  async createByDoctor(actingDoctorId: string, actorUserId: string, input: PatientCreateInput): Promise<Patient> {
    const medicfyId = await this.nextMedicfyId();

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          medicfyId,
          firstName: input.firstName,
          lastNamePaternal: input.lastNamePaternal,
          lastNameMaternal: input.lastNameMaternal ?? null,
          birthDate: new Date(`${input.birthDate}T00:00:00Z`),
          sexAtBirth: input.sexAtBirth,
          genderIdentity: input.genderIdentity ?? null,
          curp: input.curp ?? null,
          bloodType: input.bloodType ?? null,
          phoneE164: input.phoneE164,
          email: input.email,
          addressStreet: input.addressStreet ?? null,
          addressExt: input.addressExt ?? null,
          addressInt: input.addressInt ?? null,
          addressColonia: input.addressColonia ?? null,
          addressMunicipality: input.addressMunicipality ?? null,
          addressState: input.addressState ?? null,
          addressPostalCode: input.addressPostalCode ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          emergencyContactRelation: input.emergencyContactRelation ?? null,
          createdByUserId: actorUserId,
          source: "CREATED_BY_DOCTOR",
        },
      });

      if (input.guardian) {
        await this.patientGuardianService.create(patient.id, input.guardian, tx);
      }

      await this.careRelationshipService.createOrRenew(patient.id, actingDoctorId, "CREATED_BY_DOCTOR", tx);

      return patient;
    });
  }

  // AUTH-RN-001: solo pacientes con vínculo ACTIVO y no vencido. El
  // filtro de expiresAt va aquí directamente (no delega a
  // CareRelationshipService.hasActiveRelationship, que además
  // escribe) porque un listado de lectura no debería tener efectos
  // secundarios por cada fila — la limpieza perezosa de status a
  // EXPIRED ocurre donde hasActiveRelationship sí se invoca.
  async list(doctorId: string): Promise<Patient[]> {
    return this.prisma.patient.findMany({
      where: { careRelationships: { some: { doctorId, status: "ACTIVE", expiresAt: { gt: new Date() } } } },
      orderBy: { createdAt: "desc" },
    });
  }

  // R4 — AUTORIZACIÓN POR RECURSO. Hallazgo #2 del Bloque 0
  // (26 ago 2026): esto era un findUnique por id, sin filtro alguno.
  // Con sólo tener sesión válida —incluso una cuenta de rol PATIENT—
  // se leía la fila completa de cualquier paciente: CURP, fecha de
  // nacimiento, tipo de sangre, domicilio, contacto de emergencia, y
  // después los tutores con su CURP y su documento de identidad.
  //
  // El filtro es el MISMO que list(): vínculo ACTIVE y no vencido. Un
  // médico cuyo vínculo caducó deja de leer el perfil, igual que dejó
  // de ver al paciente en su lista — antes este endpoint le seguía
  // respondiendo 200 cuando todos los clínicos ya le daban 403.
  //
  // Devuelve 404, no 403, a propósito: un 403 confirmaría que ese id
  // existe, y con eso se puede enumerar la base de pacientes aunque no
  // se lea ninguno.
  async findByIdForDoctor(patientId: string, doctorId: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        careRelationships: { some: { doctorId, status: "ACTIVE", expiresAt: { gt: new Date() } } },
      },
    });
    if (!patient) {
      throw new ApiException("PATIENT_NOT_FOUND", "Paciente no encontrado.", HttpStatus.NOT_FOUND);
    }
    return patient;
  }

  // §6.2: "medicfy_id VARCHAR UNIQUE — folio legible: MDF-000123".
  // Postgres sequence (patients_medicfy_id_seq, from the M5a
  // migration), not app-level counting — stays correct under
  // concurrent patient creation without needing a lock.
  private async nextMedicfyId(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('patients_medicfy_id_seq')`;
    const value = rows[0]?.nextval;
    if (value === undefined) {
      throw new Error("unreachable: SELECT nextval(...) always returns exactly one row");
    }
    return `MDF-${value.toString().padStart(6, "0")}`;
  }
}
