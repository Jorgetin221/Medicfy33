import { HttpStatus, Injectable } from "@nestjs/common";
import type { CatalogTermRequest } from "@prisma/client";
import type { CatalogTermRequestCreateInput, CatalogTermRequestResolveInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../identity/services/audit.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { normalizeTerm } from "../term-normalizer.util";
import { ClinicalCatalogService, type CatalogActor } from "./clinical-catalog.service";

// Prompt 10: "el médico solicita un término desde la captura, la
// solicitud queda pendiente, el curador la aprueba, la rechaza o la
// fusiona con una existente". R2 imposible por diseño: la captura solo
// puede crear ESTA solicitud — jamás una fila de catálogo.
@Injectable()
export class TermRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ClinicalCatalogService,
    private readonly audit: AuditService
  ) {}

  async create(domain: string, requestedBy: string, input: CatalogTermRequestCreateInput): Promise<CatalogTermRequest> {
    // Si el término ya existe (por forma normalizada o sinónimo), no
    // tiene caso encolar: se le dice al médico cuál usar.
    const normalized = normalizeTerm(input.proposedTerm);
    const domainTerms = await this.prisma.clinicalCatalogTerm.findMany({
      where: { domain, status: "ACTIVE" },
      select: { id: true, preferredTerm: true, normalizedTerm: true, synonyms: true },
    });
    const existing = domainTerms.find(
      (t) => t.normalizedTerm === normalized || t.synonyms.some((syn) => normalizeTerm(syn) === normalized)
    );
    if (existing) {
      throw new ApiException(
        "CATALOG_TERM_ALREADY_AVAILABLE",
        `"${input.proposedTerm}" ya existe en el catálogo como "${existing.preferredTerm}" — úsalo directamente.`,
        HttpStatus.CONFLICT,
        { existingTermId: existing.id, existingPreferredTerm: existing.preferredTerm }
      );
    }
    const request = await this.prisma.catalogTermRequest.create({
      data: {
        domain,
        proposedTerm: input.proposedTerm,
        requestedBy,
        ...omitUndefined({ justification: input.justification }),
      },
    });
    await this.audit.log({
      actorUserId: requestedBy,
      action: "CATALOG_TERM_REQUEST_CREATE",
      resourceType: "CATALOG_TERM_REQUEST",
      resourceId: request.id,
      result: "SUCCESS",
      metadata: { domain },
    });
    return request;
  }

  listPending(domain?: string): Promise<CatalogTermRequest[]> {
    return this.prisma.catalogTermRequest.findMany({
      where: { status: "PENDING", ...omitUndefined({ domain }) },
      orderBy: { createdAt: "asc" },
    });
  }

  async approve(requestId: string, actor: CatalogActor, input: CatalogTermRequestResolveInput): Promise<CatalogTermRequest> {
    const request = await this.mustFindPending(requestId);
    if (!input.key || !input.codingSystem) {
      throw new ApiException(
        "TERM_REQUEST_APPROVAL_INCOMPLETE",
        "Aprobar exige la clave del término nuevo y su sistema de codificación (o \"PROPIETARIO\").",
        HttpStatus.BAD_REQUEST
      );
    }
    // El término lo crea el flujo NORMAL de curación — con su chequeo
    // de duplicados, su bitácora y curatedBy = curador (no el médico).
    const term = await this.catalog.create(
      {
        domain: request.domain,
        key: input.key,
        preferredTerm: request.proposedTerm,
        codingSystem: input.codingSystem,
        ...omitUndefined({ synonyms: input.synonyms }),
      },
      actor
    );
    return this.resolve(request, actor, "APPROVED", term.id, input.resolutionNote);
  }

  async reject(requestId: string, actor: CatalogActor, input: CatalogTermRequestResolveInput): Promise<CatalogTermRequest> {
    const request = await this.mustFindPending(requestId);
    return this.resolve(request, actor, "REJECTED", null, input.resolutionNote);
  }

  async mergeIntoExisting(
    requestId: string,
    actor: CatalogActor,
    input: CatalogTermRequestResolveInput
  ): Promise<CatalogTermRequest> {
    const request = await this.mustFindPending(requestId);
    if (!input.mergeIntoTermId) {
      throw new ApiException("TERM_REQUEST_MERGE_TARGET_REQUIRED", "Indica el término existente al que se fusiona.", HttpStatus.BAD_REQUEST);
    }
    const target = await this.prisma.clinicalCatalogTerm.findUnique({ where: { id: input.mergeIntoTermId } });
    if (!target || target.domain !== request.domain || target.status !== "ACTIVE") {
      throw new ApiException(
        "TERM_REQUEST_MERGE_TARGET_INVALID",
        "El término destino debe existir, estar activo y ser del mismo dominio que la solicitud.",
        HttpStatus.BAD_REQUEST
      );
    }
    return this.resolve(request, actor, "MERGED", target.id, input.resolutionNote);
  }

  private async resolve(
    request: CatalogTermRequest,
    actor: CatalogActor,
    status: "APPROVED" | "REJECTED" | "MERGED",
    resultingTermId: string | null,
    resolutionNote: string | undefined
  ): Promise<CatalogTermRequest> {
    const resolved = await this.prisma.catalogTermRequest.update({
      where: { id: request.id },
      data: {
        status,
        resolvedBy: actor.userId,
        resolvedAt: new Date(),
        resultingTermId,
        ...omitUndefined({ resolutionNote }),
      },
    });
    await this.audit.log({
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: `CATALOG_TERM_REQUEST_${status}`,
      resourceType: "CATALOG_TERM_REQUEST",
      resourceId: request.id,
      result: "SUCCESS",
      metadata: { domain: request.domain, resultingTermId },
    });
    return resolved;
  }

  private async mustFindPending(requestId: string): Promise<CatalogTermRequest> {
    const request = await this.prisma.catalogTermRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new ApiException("TERM_REQUEST_NOT_FOUND", "Solicitud de término no encontrada.", HttpStatus.NOT_FOUND);
    }
    if (request.status !== "PENDING") {
      throw new ApiException("TERM_REQUEST_ALREADY_RESOLVED", "Esta solicitud ya fue resuelta.", HttpStatus.CONFLICT);
    }
    return request;
  }
}
