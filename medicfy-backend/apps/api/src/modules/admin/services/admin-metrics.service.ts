import { Injectable } from "@nestjs/common";
import type { AppointmentStatus, DoctorVerificationStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { businessHoursSince } from "../../../common/business-hours.util";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
// M13-CA-003
const OVERDUE_THRESHOLD_HOURS = 24;
const PENDING_VERIFICATION_STATUSES: DoctorVerificationStatus[] = ["SUBMITTED", "IN_REVIEW"];

export interface AdminMetrics {
  doctorsByVerificationStatus: Partial<Record<DoctorVerificationStatus, number>>;
  // M13-RN-005: "médicos activos (≥1 nota en 30 días)".
  activeDoctors30d: number;
  appointmentsByStatus: Partial<Record<AppointmentStatus, number>>;
  // Interpretación (no definida más en la especificación): de las
  // citas con un desenlace real (COMPLETED o NO_SHOW), qué fracción
  // fue NO_SHOW. Las citas futuras/pendientes de pago no cuentan en
  // el denominador porque todavía no tienen desenlace.
  noShowRate: number | null;
  signedNotesCount: number;
  prescriptionsIssuedCount: number;
  verificationQueue: { pending: number; overdue: number };
  // PENDIENTE: M6 (facturación/suscripciones) no existe todavía en el
  // backend — no hay dato real de MRR ni churn que reportar. null
  // explícito en vez de inventar un cero que se vería como un hecho.
  mrr: null;
  churn: null;
}

@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getMetrics(adminUserId: string, meta: RequestMeta): Promise<AdminMetrics> {
    const [doctorsByStatusRaw, activeDoctors30d, appointmentsByStatusRaw, signedNotesCount, prescriptionsIssuedCount, queueDoctors] =
      await Promise.all([
        this.prisma.doctor.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
        this.prisma.doctor.count({
          where: { encounters: { some: { status: "SIGNED", signedAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) } } } },
        }),
        this.prisma.appointment.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.clinicalEncounter.count({ where: { status: "SIGNED" } }),
        this.prisma.prescription.count(),
        this.prisma.doctor.findMany({
          where: { verificationStatus: { in: PENDING_VERIFICATION_STATUSES } },
          select: { createdAt: true },
        }),
      ]);

    const doctorsByVerificationStatus: Partial<Record<DoctorVerificationStatus, number>> = {};
    for (const row of doctorsByStatusRaw) doctorsByVerificationStatus[row.verificationStatus] = row._count._all;

    const appointmentsByStatus: Partial<Record<AppointmentStatus, number>> = {};
    for (const row of appointmentsByStatusRaw) appointmentsByStatus[row.status] = row._count._all;

    const completed = appointmentsByStatus.COMPLETED ?? 0;
    const noShow = appointmentsByStatus.NO_SHOW ?? 0;
    const resolved = completed + noShow;
    const noShowRate = resolved > 0 ? noShow / resolved : null;

    const now = new Date();
    const overdue = queueDoctors.filter((d) => businessHoursSince(d.createdAt, now) >= OVERDUE_THRESHOLD_HOURS).length;

    const metrics: AdminMetrics = {
      doctorsByVerificationStatus,
      activeDoctors30d,
      appointmentsByStatus,
      noShowRate,
      signedNotesCount,
      prescriptionsIssuedCount,
      verificationQueue: { pending: queueDoctors.length, overdue },
      mrr: null,
      churn: null,
    };

    // M13-RN-004: toda acción de admin queda en bitácora.
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "admin.metrics.view",
      resourceType: "admin_metrics",
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return metrics;
  }
}
