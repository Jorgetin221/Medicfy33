import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ClinicalCatalogTerm } from "@prisma/client";
import type { ClinicalCatalogTermCreateInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../identity/services/audit.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { normalizeTerm } from "../term-normalizer.util";

// El servicio acepta cualquier dominio (las pruebas usan dominios
// aleatorios contra la base persistente de dev); la lista CERRADA de
// dominios (CATALOG_DOMAINS) se impone en el borde HTTP, donde el
// contrato valida — mismo reparto que normalizedTerm: la garantía dura
// vive en la capa que no se puede rodear.
type CatalogTermCreate = Omit<ClinicalCatalogTermCreateInput, "domain"> & { domain: string };

// Contexto del actor para la bitácora ("bitácora de todo" es regla
// permanente del plan; misma AuditService de identity). undefined en
// los caminos sin actor (seed).
export interface CatalogActor {
  userId: string;
  role: string;
}

const MAX_SEARCH_RESULTS = 50;

// Prompt 7 (medicfy-50-prompts.md). Repositorio de acceso a
// ClinicalCatalogTerm + (Prompt 10) API de curación. Un término nunca
// se borra ni se actualiza en su lugar: create() inserta,
// obsolete()/merge() solo cambian status. Ver el comentario del modelo
// en schema.prisma para el razonamiento completo de fusión.
@Injectable()
export class ClinicalCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // Prompt 8: normalizedTerm se calcula aquí — nunca viaja desde el
  // cliente, mismo principio que IMC/escalas (cálculo derivado
  // siempre en servidor). El chequeo previo es para el mensaje claro
  // que pide el prompt ("señala cuál es el término existente"); el
  // índice único (domain, normalizedTerm) de Postgres es la red de
  // seguridad real contra condición de carrera, igual que ya se hizo
  // para `key`.
  //
  // Prompt 11 / P4 §6.9: el duplicado también se busca contra los
  // SINÓNIMOS curados de los términos existentes del dominio, y los
  // sinónimos de entrada contra todo lo anterior — "Ninguno" no se
  // puede dar de alta si ya es sinónimo curado de "Negado".
  async create(input: CatalogTermCreate, actor?: CatalogActor): Promise<ClinicalCatalogTerm> {
    const normalizedTerm = normalizeTerm(input.preferredTerm);
    const inputSynonyms = [...new Set((input.synonyms ?? []).map((s) => s.trim()).filter((s) => s.length > 0))];
    const normalizedInput = new Set<string>([normalizedTerm, ...inputSynonyms.map(normalizeTerm)]);

    const domainTerms = await this.prisma.clinicalCatalogTerm.findMany({
      where: { domain: input.domain },
      select: { id: true, preferredTerm: true, normalizedTerm: true, synonyms: true },
    });
    for (const existing of domainTerms) {
      const existingForms = new Set<string>([existing.normalizedTerm, ...existing.synonyms.map(normalizeTerm)]);
      const collision = [...normalizedInput].find((form) => existingForms.has(form));
      if (collision !== undefined) {
        throw new ApiException(
          "CATALOG_TERM_DUPLICATE_NORMALIZED_FORM",
          `"${input.preferredTerm}" es equivalente, tras normalizar, al término existente "${existing.preferredTerm}" (id ${existing.id}) en el dominio "${input.domain}".`,
          HttpStatus.CONFLICT,
          { existingTermId: existing.id, existingPreferredTerm: existing.preferredTerm, collidingForm: collision }
        );
      }
    }

    try {
      const term = await this.prisma.clinicalCatalogTerm.create({
        data: {
          domain: input.domain,
          key: input.key,
          preferredTerm: input.preferredTerm,
          normalizedTerm,
          codingSystem: input.codingSystem,
          synonyms: inputSynonyms,
          // Prompt 10: el curador es SIEMPRE el actor autenticado —
          // nunca un valor que viaje en el cuerpo de la petición.
          curatedBy: actor?.userId ?? null,
          ...omitUndefined({ externalCode: input.externalCode }),
        },
      });
      await this.auditCuration("CATALOG_TERM_CREATE", term.id, actor, {
        domain: input.domain,
        key: input.key,
      });
      return term;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiException(
          "CATALOG_TERM_ALREADY_EXISTS",
          `Ya existe un término con la clave "${input.key}" o forma normalizada equivalente en el dominio "${input.domain}".`,
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  // Con el índice único ya aplicado, esto debería regresar vacío en
  // operación normal — su valor es de auditoría: confirmar que la
  // restricción funciona, o detectar algo que haya entrado por otra
  // vía (ej. una fila insertada antes de que este índice existiera).
  async findPotentialDuplicates(domain?: string): Promise<{ domain: string; normalizedTerm: string; terms: ClinicalCatalogTerm[] }[]> {
    const groups = await this.prisma.clinicalCatalogTerm.groupBy({
      by: ["domain", "normalizedTerm"],
      ...omitUndefined({ where: domain ? { domain } : undefined }),
      _count: { id: true },
    });
    const duplicateGroups = groups.filter((g) => (g._count?.id ?? 0) > 1);
    return Promise.all(
      duplicateGroups.map(async (g) => ({
        domain: g.domain,
        normalizedTerm: g.normalizedTerm,
        terms: await this.prisma.clinicalCatalogTerm.findMany({
          where: { domain: g.domain, normalizedTerm: g.normalizedTerm },
          orderBy: { createdAt: "asc" },
        }),
      }))
    );
  }

  // Prompt 11: lista para selectores de captura. La búsqueda compara
  // contra la forma NORMALIZADA (el cliente puede teclear con acentos,
  // mayúsculas o plural y encontrar el término igual) y contra los
  // sinónimos curados.
  async findActive(domain: string, search?: string): Promise<ClinicalCatalogTerm[]> {
    if (search === undefined || search.length === 0) {
      return this.prisma.clinicalCatalogTerm.findMany({
        where: { domain, status: "ACTIVE" },
        orderBy: { preferredTerm: "asc" },
        take: MAX_SEARCH_RESULTS,
      });
    }
    const normalizedSearch = normalizeTerm(search);
    const byNormalized = await this.prisma.clinicalCatalogTerm.findMany({
      where: { domain, status: "ACTIVE", normalizedTerm: { contains: normalizedSearch } },
      orderBy: { preferredTerm: "asc" },
      take: MAX_SEARCH_RESULTS,
    });
    if (byNormalized.length >= MAX_SEARCH_RESULTS) return byNormalized;

    // Sinónimos: String[] sin índice — el dominio es pequeño por
    // construcción (vocabulario curado, no datos de pacientes), así
    // que el complemento en memoria es aceptable.
    const found = new Set(byNormalized.map((t) => t.id));
    const rest = await this.prisma.clinicalCatalogTerm.findMany({
      where: { domain, status: "ACTIVE", id: { notIn: [...found] } },
      orderBy: { preferredTerm: "asc" },
    });
    const bySynonym = rest.filter((t) => t.synonyms.some((s) => normalizeTerm(s).includes(normalizedSearch)));
    return [...byNormalized, ...bySynonym].slice(0, MAX_SEARCH_RESULTS);
  }

  // Camina mergedIntoId hasta el término vigente. El guardia contra
  // ciclos es defensivo (merge() ya los hace estructuralmente
  // imposibles de crear — ver ahí — pero esto no debe colgarse si
  // algún día los datos llegan sucios por otra vía).
  async resolveCurrent(termId: string): Promise<ClinicalCatalogTerm> {
    const visited = new Set<string>();
    let current = await this.mustFind(termId);
    while (current.status === "MERGED" && current.mergedIntoId) {
      if (visited.has(current.id)) {
        throw new ApiException(
          "CATALOG_TERM_MERGE_CYCLE",
          `Ciclo de fusión detectado en el término "${current.key}" (${current.id}).`,
          HttpStatus.CONFLICT
        );
      }
      visited.add(current.id);
      current = await this.mustFind(current.mergedIntoId);
    }
    return current;
  }

  async obsolete(termId: string, actor?: CatalogActor): Promise<ClinicalCatalogTerm> {
    await this.mustFind(termId);
    const term = await this.prisma.clinicalCatalogTerm.update({ where: { id: termId }, data: { status: "OBSOLETE" } });
    await this.auditCuration("CATALOG_TERM_OBSOLETE", termId, actor, { domain: term.domain });
    return term;
  }

  // fromId nunca se borra ni pierde su fila: solo status=MERGED +
  // mergedIntoId. intoId debe estar ACTIVE — eso implica que intoId no
  // tiene su propio mergedIntoId, así que fusionar fromId->intoId
  // nunca puede crear un ciclo (intoId siempre es una hoja terminal
  // del grafo de fusión en el momento de fusionar).
  async merge(fromId: string, intoId: string, actor?: CatalogActor): Promise<ClinicalCatalogTerm> {
    if (fromId === intoId) {
      throw new ApiException("CATALOG_TERM_INVALID_MERGE", "Un término no se puede fusionar consigo mismo.", HttpStatus.BAD_REQUEST);
    }
    const [from, into] = await Promise.all([this.mustFind(fromId), this.mustFind(intoId)]);
    if (from.domain !== into.domain) {
      throw new ApiException("CATALOG_TERM_INVALID_MERGE", "Solo se puede fusionar dentro del mismo dominio.", HttpStatus.BAD_REQUEST);
    }
    if (into.status !== "ACTIVE") {
      throw new ApiException(
        "CATALOG_TERM_INVALID_MERGE",
        "El término destino debe estar activo — no se puede fusionar hacia un término obsoleto o ya fusionado.",
        HttpStatus.BAD_REQUEST
      );
    }
    const merged = await this.prisma.clinicalCatalogTerm.update({
      where: { id: fromId },
      data: { status: "MERGED", mergedIntoId: intoId },
    });
    await this.auditCuration("CATALOG_TERM_MERGE", fromId, actor, { domain: from.domain, mergedIntoId: intoId });
    return merged;
  }

  private async mustFind(termId: string): Promise<ClinicalCatalogTerm> {
    const term = await this.prisma.clinicalCatalogTerm.findUnique({ where: { id: termId } });
    if (!term) {
      throw new ApiException("CATALOG_TERM_NOT_FOUND", "Término de catálogo no encontrado.", HttpStatus.NOT_FOUND);
    }
    return term;
  }

  // "Bitácora de todo": cada mutación de catálogo queda en audit_log
  // con actor y resultado. Los términos de catálogo no son datos de un
  // paciente (sin patientId), pero sí vocabulario clínico con efecto
  // en seguridad — el cruce de alergias depende de él.
  private async auditCuration(
    action: string,
    termId: string,
    actor: CatalogActor | undefined,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.audit.log({
      ...omitUndefined({ actorUserId: actor?.userId, actorRole: actor?.role }),
      action,
      resourceType: "CLINICAL_CATALOG_TERM",
      resourceId: termId,
      result: "SUCCESS",
      metadata,
    });
  }
}
