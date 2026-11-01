import { HttpStatus, Injectable } from "@nestjs/common";
import type { RecordShareGrant } from "@prisma/client";
import type {
  RecordShareGrantDetail,
  RecordShareGrantMine,
  ShareScope,
  SharedRecordSummary,
} from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { doctorDisplayName, patientFullName } from "../record-share-display.util";
import { SharedSummaryService } from "./shared-summary.service";

function sectionsPresent(summary: SharedRecordSummary): string[] {
  const sections = ["SUMMARY"];
  if (summary.results !== null) sections.push("RESULTS");
  if (summary.signedNotes !== null) sections.push("SIGNED_NOTES");
  if (summary.prescriptions !== null) sections.push("PRESCRIPTIONS");
  if (summary.studyOrders !== null) sections.push("STUDY_ORDERS");
  return sections;
}

/**
 * PR-EXP-05. Las rutas que llaman a estos métodos ya pasaron por
 * SharedRecordGuard (existencia/dueño/estado/vigencia) — aquí solo
 * falta el chequeo de ALCANCE por sección (criterio de terminación:
 * "un recurso fuera de alcance da 403") y la bitácora de apertura
 * (SHARE_VIEWED, con la lista de secciones que de verdad se
 * devolvieron). Nota de rendimiento, no de corrección: cada endpoint
 * de sección vuelve a llamar buildSummary() completo en vez de tener
 * un método por sección en SharedSummaryService — aceptable a esta
 * escala (REGLA CERO: no se optimiza antes de que haga falta).
 */
@Injectable()
export class RecordShareViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedSummary: SharedSummaryService,
    private readonly auditService: AuditService
  ) {}

  async listMine(requesterUserId: string): Promise<RecordShareGrantMine[]> {
    const requester = await this.prisma.doctor.findUniqueOrThrow({ where: { userId: requesterUserId } });
    const grants = await this.prisma.recordShareGrant.findMany({
      where: { requesterDoctorId: requester.id },
      orderBy: { startsAt: "desc" },
      include: { patient: true, custodianDoctor: true },
    });
    return grants.map((grant) => ({
      id: grant.id,
      patientName: patientFullName(grant.patient),
      custodianDisplayName: doctorDisplayName(grant.custodianDoctor),
      scope: grant.scope,
      status: grant.status,
      startsAt: grant.startsAt.toISOString(),
      expiresAt: grant.expiresAt.toISOString(),
    }));
  }

  async getDetail(grant: RecordShareGrant, actorUserId: string, meta: RequestMeta): Promise<RecordShareGrantDetail> {
    const [patient, custodian, summary] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: grant.patientId } }),
      this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.custodianDoctorId } }),
      this.sharedSummary.buildSummary(grant),
    ]);
    await this.logViewed(grant, actorUserId, meta, sectionsPresent(summary));
    return {
      id: grant.id,
      patientName: patientFullName(patient),
      patientBirthDate: patient.birthDate.toISOString().slice(0, 10),
      custodianDisplayName: doctorDisplayName(custodian),
      scope: grant.scope,
      status: grant.status,
      expiresAt: grant.expiresAt.toISOString(),
      summary,
    };
  }

  async getNotes(grant: RecordShareGrant, actorUserId: string, meta: RequestMeta) {
    this.assertScope(grant, "SIGNED_NOTES");
    const summary = await this.sharedSummary.buildSummary(grant);
    await this.logViewed(grant, actorUserId, meta, ["SIGNED_NOTES"]);
    return summary.signedNotes ?? [];
  }

  async getResults(grant: RecordShareGrant, actorUserId: string, meta: RequestMeta) {
    this.assertScope(grant, "RESULTS");
    const summary = await this.sharedSummary.buildSummary(grant);
    await this.logViewed(grant, actorUserId, meta, ["RESULTS"]);
    return summary.results ?? [];
  }

  async getPrescriptions(grant: RecordShareGrant, actorUserId: string, meta: RequestMeta) {
    this.assertScope(grant, "PRESCRIPTIONS");
    const summary = await this.sharedSummary.buildSummary(grant);
    await this.logViewed(grant, actorUserId, meta, ["PRESCRIPTIONS"]);
    return summary.prescriptions ?? [];
  }

  async getStudyOrders(grant: RecordShareGrant, actorUserId: string, meta: RequestMeta) {
    this.assertScope(grant, "STUDY_ORDERS");
    const summary = await this.sharedSummary.buildSummary(grant);
    await this.logViewed(grant, actorUserId, meta, ["STUDY_ORDERS"]);
    return summary.studyOrders ?? [];
  }

  // Criterio de terminación: "un recurso fuera de alcance da 403" —
  // mismo código/mensaje genérico que el guard, por consistencia.
  private assertScope(grant: RecordShareGrant, scope: ShareScope): void {
    if (!grant.scope.includes(scope)) {
      throw new ApiException("RECORD_SHARE_SCOPE_NOT_GRANTED", "Ese alcance no fue autorizado.", HttpStatus.FORBIDDEN);
    }
  }

  private async logViewed(grant: RecordShareGrant, actorUserId: string, meta: RequestMeta, sections: string[]): Promise<void> {
    await this.auditService.log({
      actorUserId,
      actorRole: "DOCTOR",
      action: "SHARE_VIEWED",
      resourceType: "record_share_grant",
      resourceId: grant.id,
      patientId: grant.patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { sections },
    });
  }
}
