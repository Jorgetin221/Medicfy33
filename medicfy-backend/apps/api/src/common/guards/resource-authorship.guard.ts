import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../api-exception";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../modules/identity/services/audit.service";
import { getRequestMeta } from "../../modules/identity/request-meta";
import type { ClinicalRequest } from "./care-relationship.guard";

// Auditoría 2026-10-21 (A-03, O-06). CareRelationshipGuard responde
// "¿este médico puede ver a este paciente?"; no responde "¿este
// documento es suyo?". Dos médicos con vínculo con el mismo paciente
// podían editar o firmar el borrador del otro (quedaba la cédula del
// otro en la firma) y cancelar sus recetas u órdenes.
//
// Va DESPUÉS de CareRelationshipGuard (que llena req.actingDoctorId):
// declararlo a nivel de método garantiza ese orden, porque Nest corre
// primero los guards de la clase. Resuelve el documento por el
// parámetro más específico de la ruta — receta u orden antes que
// encuentro — y exige que su doctorId sea el del médico actuante.
// Lectura: no aplica (cualquier médico con vínculo puede leer).
@Injectable()
export class ResourceAuthorshipGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ClinicalRequest>();
    const resource = await this.resolveResource(req);
    if (!resource) {
      throw new ApiException("RESOURCE_NOT_FOUND", "Documento clínico no encontrado.", HttpStatus.NOT_FOUND);
    }
    if (req.actingDoctorId !== undefined && resource.doctorId === req.actingDoctorId) {
      return true;
    }

    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action: "clinical.authorship",
      resourceType: resource.type,
      resourceId: resource.id,
      ...(req.clinicalPatientId !== undefined ? { patientId: req.clinicalPatientId } : {}),
      result: "DENIED",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "not_resource_author" },
    });
    throw new ApiException(
      "NOT_RESOURCE_AUTHOR",
      "Solo el médico que inició este documento clínico puede modificarlo, firmarlo o cancelarlo.",
      HttpStatus.FORBIDDEN
    );
  }

  private async resolveResource(req: ClinicalRequest): Promise<{ type: string; id: string; doctorId: string } | null> {
    const { prescriptionId, labOrderId, encounterId } = req.params;
    if (typeof prescriptionId === "string") {
      const row = await this.prisma.prescription.findUnique({ where: { id: prescriptionId }, select: { doctorId: true } });
      return row ? { type: "prescription", id: prescriptionId, doctorId: row.doctorId } : null;
    }
    if (typeof labOrderId === "string") {
      const row = await this.prisma.labOrder.findUnique({ where: { id: labOrderId }, select: { doctorId: true } });
      return row ? { type: "lab_order", id: labOrderId, doctorId: row.doctorId } : null;
    }
    if (typeof encounterId === "string") {
      const row = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId }, select: { doctorId: true } });
      return row ? { type: "clinical_encounter", id: encounterId, doctorId: row.doctorId } : null;
    }
    return null;
  }
}
