import { Body, Controller, Get, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { medicationCatalogSelfServiceCreateSchema, medicationSearchQuerySchema, type MedicationCatalogSelfServiceCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { DoctorProfileService } from "../doctors/services/doctor-profile.service";
import { MedicationCatalogService } from "./services/medication-catalog.service";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";

const searchQueryPipe = new ZodValidationPipe(medicationSearchQuerySchema);
const selfServiceCreatePipe = new ZodValidationPipe(medicationCatalogSelfServiceCreateSchema);
const MAX_RESULTS = 20;

// Catálogo de medicamentos (sembrado parcialmente — ver el plan) para
// el panel de receta de DOC-06. Incluye controlGroup/
// isElectronicallyPrescribable a propósito: el frontend avisa ANTES
// de intentar prescribir un Grupo I/II (R5), en vez de dejar que el
// médico llene todo el formulario y reciba el bloqueo hasta el final.
@ApiTags("prescriptions")
@ApiBearerAuth()
@Controller("medications")
@UseGuards(JwtAuthGuard)
export class MedicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctorProfileService: DoctorProfileService,
    private readonly medicationCatalog: MedicationCatalogService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  @ApiQuery({ name: "search", required: false })
  @ApiOperation({ summary: "Busca en el catálogo de medicamentos por nombre genérico o comercial" })
  async search(@Query("search") search: string | undefined) {
    const query = searchQueryPipe.transform({ search });
    return this.prisma.medicationCatalog.findMany({
      where: {
        isActive: true,
        ...(query.search
          ? {
              OR: [
                { genericName: { contains: query.search, mode: "insensitive" as const } },
                { brandNames: { has: query.search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        genericName: true,
        brandNames: true,
        presentations: true,
        controlGroup: true,
        isElectronicallyPrescribable: true,
      },
      orderBy: { genericName: "asc" },
      take: MAX_RESULTS,
    });
  }

  // Autoservicio (decisión explícita del usuario, 2026-09-02): "que
  // aunque no esté en la lista se pueda agregar en la receta, sin
  // necesidad de que un admin lo apruebe". findByUserId (no
  // getOwnProfile: ese lanza NotFoundError sin traducir a un 4xx
  // limpio) — un PATIENT autenticado recibe 403, no un 500.
  @Post()
  @ApiOperation({ summary: "Autoservicio: el médico agrega un medicamento que no encontró en el catálogo, sin aprobación de admin" })
  async createSelfService(
    @Body(selfServiceCreatePipe) body: MedicationCatalogSelfServiceCreateInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.findByUserId(user.sub);
    if (!doctor) {
      throw new ApiException("DOCTOR_PROFILE_REQUIRED", "Solo un médico puede agregar medicamentos al catálogo.", HttpStatus.FORBIDDEN);
    }
    const created = await this.medicationCatalog.createSelfService(doctor.id, body);
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: user.sub,
      actorRole: "DOCTOR",
      action: "medications.catalog.create_self_service",
      resourceType: "medication_catalog",
      resourceId: created.id,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return created;
  }
}
