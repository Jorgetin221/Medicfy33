import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  catalogDomainSchema,
  catalogMergeSchema,
  catalogSearchQuerySchema,
  clinicalCatalogTermCreateSchema,
  type CatalogDomain,
} from "@medicfy/contracts";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { AuditService } from "../identity/services/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CuratorGuard } from "./guards/curator.guard";
import { ClinicalCatalogService, type CatalogActor } from "./services/clinical-catalog.service";
import { normalizeTerm } from "./term-normalizer.util";

const domainPipe = new ZodValidationPipe(catalogDomainSchema);
const searchPipe = new ZodValidationPipe(catalogSearchQuerySchema);
const mergePipe = new ZodValidationPipe(catalogMergeSchema);
// El dominio viaja en la RUTA, no en el cuerpo — una sola fuente de
// verdad por petición.
const createBodySchema = clinicalCatalogTermCreateSchema.omit({ domain: true }).strict();
const createBodyPipe = new ZodValidationPipe(createBodySchema);
const termIdPipe = new ZodValidationPipe(z.string().uuid());

// Cuántas veces tiene que repetirse una cadena libre para aparecer en
// el informe del curador — el umbral protege de exponer texto que sólo
// un paciente tiene (P4 §6.10: el informe busca vocabulario emergente,
// no casos individuales).
const FREE_TEXT_REPORT_MIN_COUNT = 2;
const FREE_TEXT_REPORT_MAX_ROWS = 100;

function actorOf(req: AuthenticatedRequest): CatalogActor {
  return { userId: req.user.sub, role: req.user.primaryRole };
}

// Prompt 10-11 (medicfy-50-prompts.md) / P4 §6.5-6.10: la API del
// catálogo cerrado. Lectura para cualquier usuario autenticado (es
// vocabulario, no dato de un paciente — mismo criterio que
// Icd10Controller); TODA mutación exige rol CURATOR y queda en
// audit_log. No existe DELETE: un término se marca OBSOLETE o se
// fusiona, nunca desaparece.
@ApiTags("catalogs")
@ApiBearerAuth()
@Controller("catalogs")
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(
    private readonly catalog: ClinicalCatalogService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // ── Informes del curador ─────────────────────────────────────────
  // Declarados ANTES de ":domain" — Nest resuelve rutas en orden de
  // declaración y "reports" no es un dominio.

  // P4 §6.10: "una escotilla medida es una fuente de vocabulario; una
  // escotilla no medida es un vertedero". Frecuencias del freeText
  // capturado bajo el subtipo "otro" de antecedentes — la cola de
  // entrada del curador para decidir qué subtipo nuevo hace falta.
  @Get("reports/antecedentes-otro")
  @UseGuards(CuratorGuard)
  @ApiOperation({ summary: "Frecuencia del texto libre bajo el antecedente 'otro' — insumo de curación" })
  async antecedentesOtroReport(@Req() req: AuthenticatedRequest) {
    const rows = await this.prisma.patientHistoryItem.findMany({
      where: { subtype: "otro", freeText: { not: null } },
      select: { freeText: true },
    });
    const report = this.frequencies(rows.map((r) => r.freeText ?? ""));
    // El informe agrega texto derivado de expedientes (sin paciente):
    // se registra el acceso igual que cualquier lectura sensible.
    await this.audit.log({
      actorUserId: req.user.sub,
      actorRole: req.user.primaryRole,
      action: "CATALOG_REPORT_ANTECEDENTES_OTRO",
      resourceType: "CLINICAL_CATALOG_TERM",
      result: "SUCCESS",
      metadata: { rowsReturned: report.length },
    });
    return { minCount: FREE_TEXT_REPORT_MIN_COUNT, report };
  }

  // P4 §6.10, segunda escotilla: las justificaciones de diagnóstico
  // sin código CIE-10. Las más repetidas señalan códigos que el
  // buscador no está encontrando o términos que faltan.
  @Get("reports/diagnosticos-sin-codigo")
  @UseGuards(CuratorGuard)
  @ApiOperation({ summary: "Frecuencia de las razones de diagnóstico sin CIE-10 — insumo de curación" })
  async codeAbsentReport(@Req() req: AuthenticatedRequest) {
    const rows = await this.prisma.encounterDiagnosis.findMany({
      where: { codeAbsentReason: { not: null } },
      select: { codeAbsentReason: true },
    });
    const report = this.frequencies(rows.map((r) => r.codeAbsentReason ?? ""));
    await this.audit.log({
      actorUserId: req.user.sub,
      actorRole: req.user.primaryRole,
      action: "CATALOG_REPORT_DIAGNOSTICOS_SIN_CODIGO",
      resourceType: "CLINICAL_CATALOG_TERM",
      result: "SUCCESS",
      metadata: { rowsReturned: report.length },
    });
    return { minCount: FREE_TEXT_REPORT_MIN_COUNT, report };
  }

  // ── Lectura ──────────────────────────────────────────────────────

  @Get(":domain")
  @ApiQuery({ name: "search", required: false })
  @ApiOperation({ summary: "Términos ACTIVE de un dominio de catálogo, con búsqueda normalizada" })
  async list(@Param("domain") rawDomain: string, @Query("search") search?: string) {
    const domain: CatalogDomain = domainPipe.transform(rawDomain);
    const query = searchPipe.transform({ ...(search !== undefined ? { search } : {}) });
    return this.catalog.findActive(domain, query.search);
  }

  @Get(":domain/duplicates")
  @UseGuards(CuratorGuard)
  @ApiOperation({ summary: "Auditoría de duplicados por forma normalizada (debería estar vacío)" })
  async duplicates(@Param("domain") rawDomain: string) {
    const domain: CatalogDomain = domainPipe.transform(rawDomain);
    return this.catalog.findPotentialDuplicates(domain);
  }

  // ── Curación (mutaciones) ────────────────────────────────────────

  @Post(":domain/terms")
  @UseGuards(CuratorGuard)
  @ApiOperation({ summary: "Alta de término de catálogo (solo CURATOR; curatedBy = actor)" })
  async createTerm(
    @Param("domain") rawDomain: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const domain: CatalogDomain = domainPipe.transform(rawDomain);
    const input = createBodyPipe.transform(body);
    return this.catalog.create({ ...input, domain }, actorOf(req));
  }

  @Post("terms/:termId/merge")
  @UseGuards(CuratorGuard)
  @ApiOperation({ summary: "Fusiona un término hacia el vigente — la fila nunca se borra" })
  async mergeTerm(@Param("termId") rawTermId: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const termId = termIdPipe.transform(rawTermId);
    const { intoTermId } = mergePipe.transform(body);
    return this.catalog.merge(termId, intoTermId, actorOf(req));
  }

  @Post("terms/:termId/obsolete")
  @UseGuards(CuratorGuard)
  @ApiOperation({ summary: "Marca un término como obsoleto — la fila nunca se borra" })
  async obsoleteTerm(@Param("termId") rawTermId: string, @Req() req: AuthenticatedRequest) {
    const termId = termIdPipe.transform(rawTermId);
    return this.catalog.obsolete(termId, actorOf(req));
  }

  // Agrupa texto libre por forma normalizada, exige el umbral mínimo y
  // regresa la variante más frecuente como representante del grupo.
  private frequencies(values: string[]): { normalized: string; example: string; count: number }[] {
    const groups = new Map<string, { count: number; variants: Map<string, number> }>();
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      const normalized = normalizeTerm(trimmed);
      const group = groups.get(normalized) ?? { count: 0, variants: new Map<string, number>() };
      group.count += 1;
      group.variants.set(trimmed, (group.variants.get(trimmed) ?? 0) + 1);
      groups.set(normalized, group);
    }
    return [...groups.entries()]
      .filter(([, g]) => g.count >= FREE_TEXT_REPORT_MIN_COUNT)
      .map(([normalized, g]) => ({
        normalized,
        example: [...g.variants.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? normalized,
        count: g.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, FREE_TEXT_REPORT_MAX_ROWS);
  }
}
