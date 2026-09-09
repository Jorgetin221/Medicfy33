import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";

const MAX_RESULTS_PER_TYPE = 20;

export interface AdminDoctorSearchResult {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  professionalLicense: string;
  verificationStatus: string;
  // M6 (facturación/suscripción) todavía no existe — este campo es un
  // placeholder en el esquema (Doctor.subscriptionStatus) que hoy
  // vale null para prácticamente todos los médicos. Se expone tal
  // cual, sin inventar un estado que no existe.
  subscriptionStatus: string | null;
  createdAt: Date;
}

export interface AdminPatientSearchResult {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  // M13-RN-001: esto es exactamente lo que la especificación permite
  // mostrar de un paciente en el panel admin — identificación, número
  // de consultas, médicos vinculados. Nunca motivo de consulta,
  // diagnóstico, nota, receta ni resultado. No hay "estado de pagos"
  // por paciente en el modelo de datos actual (M6 no existe) — se
  // omite en vez de inventarlo.
  appointmentCount: number;
  linkedDoctorCount: number;
  createdAt: Date;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  // M13-RN-001/M13-CA-001: ninguna de las dos consultas de abajo toca
  // una tabla clínica (notas, alergias, medicamentos, recetas,
  // resultados) ni a través de un include/select — solo identidad y
  // conteos agregados. Si algún día alguien agrega un campo clínico
  // aquí, es un cambio que debe saltar a la vista en el diff.
  async search(query: string, adminUserId: string, meta: RequestMeta) {
    const q = query.trim();
    const result =
      q.length === 0
        ? { doctors: [] as AdminDoctorSearchResult[], patients: [] as AdminPatientSearchResult[] }
        : {
            doctors: await this.searchDoctors(q),
            patients: await this.searchPatients(q),
          };

    // M13-RN-004: toda acción de admin queda en bitácora, incluidas
    // las búsquedas — es acceso a identidad de usuarios reales, no
    // solo una acción de escritura.
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "admin.users.search",
      resourceType: "admin_users_search",
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { queryLength: q.length, doctorResults: result.doctors.length, patientResults: result.patients.length },
    });

    return result;
  }

  private async searchDoctors(q: string): Promise<AdminDoctorSearchResult[]> {
    const doctors = await this.prisma.doctor.findMany({
      where: {
        OR: [
          { legalFirstName: { contains: q, mode: "insensitive" } },
          { legalLastName: { contains: q, mode: "insensitive" } },
          { professionalLicense: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_RESULTS_PER_TYPE,
      select: {
        id: true,
        legalFirstName: true,
        legalLastName: true,
        professionalLicense: true,
        verificationStatus: true,
        subscriptionStatus: true,
        createdAt: true,
      },
    });
    return doctors;
  }

  private async searchPatients(q: string): Promise<AdminPatientSearchResult[]> {
    const patients = await this.prisma.patient.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastNamePaternal: { contains: q, mode: "insensitive" } },
          { lastNameMaternal: { contains: q, mode: "insensitive" } },
          { medicfyId: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_RESULTS_PER_TYPE,
      select: {
        id: true,
        medicfyId: true,
        firstName: true,
        lastNamePaternal: true,
        lastNameMaternal: true,
        createdAt: true,
        _count: { select: { appointments: true, careRelationships: true } },
      },
    });
    return patients.map((p) => ({
      id: p.id,
      medicfyId: p.medicfyId,
      firstName: p.firstName,
      lastNamePaternal: p.lastNamePaternal,
      lastNameMaternal: p.lastNameMaternal,
      appointmentCount: p._count.appointments,
      linkedDoctorCount: p._count.careRelationships,
      createdAt: p.createdAt,
    }));
  }
}
