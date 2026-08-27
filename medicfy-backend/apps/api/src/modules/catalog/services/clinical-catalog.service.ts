import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ClinicalCatalogTerm } from "@prisma/client";
import type { ClinicalCatalogTermCreateInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { normalizeTerm } from "../term-normalizer.util";

// Prompt 7 (medicfy-50-prompts.md), R2. Repositorio de acceso a
// ClinicalCatalogTerm — sin controller todavía (el prompt pide
// "esquema, migraciones y repositorio de acceso", no una API). Un
// término nunca se borra ni se actualiza en su lugar: create()
// inserta, obsolete()/merge() solo cambian status. Ver el comentario
// del modelo en schema.prisma para el razonamiento completo de fusión.
@Injectable()
export class ClinicalCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // Prompt 8: normalizedTerm se calcula aquí — nunca viaja desde el
  // cliente, mismo principio que IMC/escalas (cálculo derivado
  // siempre en servidor). El chequeo previo es para el mensaje claro
  // que pide el prompt ("señala cuál es el término existente"); el
  // índice único (domain, normalizedTerm) de Postgres es la red de
  // seguridad real contra condición de carrera, igual que ya se hizo
  // para `key`.
  async create(input: ClinicalCatalogTermCreateInput): Promise<ClinicalCatalogTerm> {
    const normalizedTerm = normalizeTerm(input.preferredTerm);
    const existing = await this.prisma.clinicalCatalogTerm.findFirst({
      where: { domain: input.domain, normalizedTerm },
    });
    if (existing) {
      throw new ApiException(
        "CATALOG_TERM_DUPLICATE_NORMALIZED_FORM",
        `"${input.preferredTerm}" es equivalente, tras normalizar, al término existente "${existing.preferredTerm}" (id ${existing.id}) en el dominio "${input.domain}".`,
        HttpStatus.CONFLICT,
        { existingTermId: existing.id, existingPreferredTerm: existing.preferredTerm }
      );
    }
    try {
      return await this.prisma.clinicalCatalogTerm.create({
        data: {
          domain: input.domain,
          key: input.key,
          preferredTerm: input.preferredTerm,
          normalizedTerm,
          codingSystem: input.codingSystem,
          synonyms: input.synonyms ?? [],
          ...omitUndefined({ externalCode: input.externalCode, curatedBy: input.curatedBy }),
        },
      });
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

  async findActive(domain: string): Promise<ClinicalCatalogTerm[]> {
    return this.prisma.clinicalCatalogTerm.findMany({
      where: { domain, status: "ACTIVE" },
      orderBy: { preferredTerm: "asc" },
    });
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

  async obsolete(termId: string): Promise<ClinicalCatalogTerm> {
    await this.mustFind(termId);
    return this.prisma.clinicalCatalogTerm.update({ where: { id: termId }, data: { status: "OBSOLETE" } });
  }

  // fromId nunca se borra ni pierde su fila: solo status=MERGED +
  // mergedIntoId. intoId debe estar ACTIVE — eso implica que intoId no
  // tiene su propio mergedIntoId, así que fusionar fromId->intoId
  // nunca puede crear un ciclo (intoId siempre es una hoja terminal
  // del grafo de fusión en el momento de fusionar).
  async merge(fromId: string, intoId: string): Promise<ClinicalCatalogTerm> {
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
    return this.prisma.clinicalCatalogTerm.update({ where: { id: fromId }, data: { status: "MERGED", mergedIntoId: intoId } });
  }

  private async mustFind(termId: string): Promise<ClinicalCatalogTerm> {
    const term = await this.prisma.clinicalCatalogTerm.findUnique({ where: { id: termId } });
    if (!term) {
      throw new ApiException("CATALOG_TERM_NOT_FOUND", "Término de catálogo no encontrado.", HttpStatus.NOT_FOUND);
    }
    return term;
  }
}
