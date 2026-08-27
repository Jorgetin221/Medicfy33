import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clinicalCatalogTermCreateSchema } from "@medicfy/contracts";
import { CatalogModule } from "./catalog.module";
import { ClinicalCatalogService } from "./services/clinical-catalog.service";
import { normalizeTerm } from "./term-normalizer.util";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiException } from "../../common/api-exception";

// Prompt 8: los 3 casos de prueba reales del prompt, verificados uno
// por uno. Solo el primero es resoluble por un normalizador de
// formato — confirmado con el usuario, ver el plan aprobado.
describe("normalizeTerm() — Prompt 8, los 3 casos de prueba del documento", () => {
  it('"hipotiroidismo" y "HIPOTIROIDISMO" normalizan igual — mayúsculas, sí se resuelve', () => {
    expect(normalizeTerm("hipotiroidismo")).toBe(normalizeTerm("HIPOTIROIDISMO"));
    expect(normalizeTerm("HIPOTIROIDISMO")).toBe("hipotiroidismo");
  });

  it('"Dislipidemias" y "Dislipidemia" NO normalizan igual — singular/plural, fuera de alcance a propósito', () => {
    expect(normalizeTerm("Dislipidemias")).not.toBe(normalizeTerm("Dislipidemia"));
  });

  it('"Tiroideas." y "hipotiroidismo" NO normalizan igual — son palabras distintas, no un problema de formato', () => {
    expect(normalizeTerm("Tiroideas.")).toBe("tiroideas");
    expect(normalizeTerm("Tiroideas.")).not.toBe(normalizeTerm("hipotiroidismo"));
  });

  it("quita acentos, minúsculas, puntuación final y colapsa espacios múltiples", () => {
    expect(normalizeTerm("Múltiples   Espacios  ")).toBe("multiples espacios");
    expect(normalizeTerm("Diabetes?")).toBe("diabetes");
    // "sin puntuación FINAL" es literal — puntuación al inicio no se
    // toca, "¿" en "¿Diabetes?" no es del mismo problema que el
    // prompt describe (espacios/mayúsculas/acentos/final de cadena).
    expect(normalizeTerm("¿Diabetes?")).toBe("¿diabetes");
  });
});

describe("clinicalCatalogTermCreateSchema — R2: el sistema de codificación se declara siempre", () => {
  it("rechaza codingSystem vacío u omitido", () => {
    const omitted = clinicalCatalogTermCreateSchema.safeParse({ domain: "D", key: "x", preferredTerm: "X" });
    expect(omitted.success).toBe(false);

    const empty = clinicalCatalogTermCreateSchema.safeParse({ domain: "D", key: "x", preferredTerm: "X", codingSystem: "" });
    expect(empty.success).toBe(false);
  });

  it("acepta \"PROPIETARIO\" como declaración explícita de que no hay sistema externo", () => {
    const result = clinicalCatalogTermCreateSchema.safeParse({ domain: "D", key: "x", preferredTerm: "X", codingSystem: "PROPIETARIO" });
    expect(result.success).toBe(true);
  });
});

function uniqueKey(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

// Prompt 7 (medicfy-50-prompts.md), R2 — sin controller todavía (el
// prompt pide "esquema, migraciones y repositorio de acceso"), así
// que esto prueba el servicio directo contra Postgres real, no HTTP.
describe("ClinicalCatalogService — Prompt 7: tabla base de catálogo", () => {
  let service: ClinicalCatalogService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CatalogModule, PrismaModule] }).compile();
    service = moduleRef.get(ClinicalCatalogService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Aleatorio por corrida, no literal fijo: desde el Prompt 8,
  // (domain, normalizedTerm) es único de verdad — un dominio fijo
  // colisionaría con las filas que la corrida ANTERIOR de esta misma
  // suite dejó en la base de datos de dev (que persiste entre
  // invocaciones de `vitest run`). key ya usaba uniqueKey() por lo
  // mismo; ahora domain también lo necesita.
  const DOMAIN = uniqueKey("TEST_DOMAIN");

  it("nunca borra un término al fusionarlo — la fila sigue existiendo, solo cambia status/mergedIntoId", async () => {
    const from = await service.create({ domain: DOMAIN, key: uniqueKey("a"), preferredTerm: "Término A", codingSystem: "PROPIETARIO" });
    const into = await service.create({ domain: DOMAIN, key: uniqueKey("b"), preferredTerm: "Término B", codingSystem: "PROPIETARIO" });

    const merged = await service.merge(from.id, into.id);
    expect(merged.status).toBe("MERGED");
    expect(merged.mergedIntoId).toBe(into.id);

    // Sigue ahí — un consumidor que ya guardó from.id lo sigue
    // encontrando íntegro, con su mismo id y su contenido original.
    const stillThere = await prisma.clinicalCatalogTerm.findUniqueOrThrow({ where: { id: from.id } });
    expect(stillThere.preferredTerm).toBe("Término A");
    expect(stillThere.id).toBe(from.id);
  });

  it("rechaza fusionar hacia un término que ya está obsoleto o ya fusionado", async () => {
    const dead = await service.create({ domain: DOMAIN, key: uniqueKey("dead"), preferredTerm: "Muerto", codingSystem: "PROPIETARIO" });
    await service.obsolete(dead.id);

    const from = await service.create({ domain: DOMAIN, key: uniqueKey("c"), preferredTerm: "Término C", codingSystem: "PROPIETARIO" });
    await expect(service.merge(from.id, dead.id)).rejects.toThrow(ApiException);

    const already = await service.create({ domain: DOMAIN, key: uniqueKey("already"), preferredTerm: "Ya fusionado", codingSystem: "PROPIETARIO" });
    const target = await service.create({ domain: DOMAIN, key: uniqueKey("target"), preferredTerm: "Destino", codingSystem: "PROPIETARIO" });
    await service.merge(already.id, target.id);

    const from2 = await service.create({ domain: DOMAIN, key: uniqueKey("d"), preferredTerm: "Término D", codingSystem: "PROPIETARIO" });
    await expect(service.merge(from2.id, already.id)).rejects.toThrow(ApiException);
  });

  it("rechaza fusionar entre dominios distintos, y fusionar un término consigo mismo", async () => {
    const a = await service.create({ domain: DOMAIN, key: uniqueKey("e"), preferredTerm: "E", codingSystem: "PROPIETARIO" });
    const otherDomainTerm = await service.create({ domain: uniqueKey("OTRO_DOMINIO"), key: uniqueKey("f"), preferredTerm: "F", codingSystem: "PROPIETARIO" });

    await expect(service.merge(a.id, otherDomainTerm.id)).rejects.toThrow(ApiException);
    await expect(service.merge(a.id, a.id)).rejects.toThrow(ApiException);
  });

  it("resolveCurrent() resuelve una fusión directa, y una cadena A→B→C (posible solo por escritura directa — merge() exige que el destino esté ACTIVE, así que nunca la crea él mismo)", async () => {
    const a = await service.create({ domain: DOMAIN, key: uniqueKey("chain-a"), preferredTerm: "Cadena A", codingSystem: "PROPIETARIO" });
    const b = await service.create({ domain: DOMAIN, key: uniqueKey("chain-b"), preferredTerm: "Cadena B", codingSystem: "PROPIETARIO" });

    await service.merge(a.id, b.id);
    const resolved = await service.resolveCurrent(a.id);
    expect(resolved.id).toBe(b.id);
    expect(resolved.status).toBe("ACTIVE");

    // Un término nunca fusionado resuelve a sí mismo.
    const resolvedActive = await service.resolveCurrent(b.id);
    expect(resolvedActive.id).toBe(b.id);

    // Cadena A→B→C: merge() nunca la produce (B ya no estaría ACTIVE
    // para recibir una segunda fusión) — se simula por Prisma directo,
    // igual que el test de ciclo, para probar que resolveCurrent()
    // sigue caminando más de un salto si algún día los datos llegan
    // así por otra vía.
    const c = await service.create({ domain: DOMAIN, key: uniqueKey("chain-c"), preferredTerm: "Cadena C — vigente", codingSystem: "PROPIETARIO" });
    await prisma.clinicalCatalogTerm.update({ where: { id: b.id }, data: { status: "MERGED", mergedIntoId: c.id } });
    const resolvedChain = await service.resolveCurrent(a.id);
    expect(resolvedChain.id).toBe(c.id);
  });

  it("resolveCurrent() detecta un ciclo en vez de colgarse (dato corrupto simulado directo por Prisma)", async () => {
    const a = await service.create({ domain: DOMAIN, key: uniqueKey("cycle-a"), preferredTerm: "Ciclo A", codingSystem: "PROPIETARIO" });
    const b = await service.create({ domain: DOMAIN, key: uniqueKey("cycle-b"), preferredTerm: "Ciclo B", codingSystem: "PROPIETARIO" });

    // merge() por sí solo nunca puede crear un ciclo (el destino debe
    // estar ACTIVE) — se simula un ciclo directo por Prisma para
    // probar que resolveCurrent() no entra en un loop infinito si los
    // datos llegan sucios por otra vía.
    await prisma.clinicalCatalogTerm.update({ where: { id: a.id }, data: { status: "MERGED", mergedIntoId: b.id } });
    await prisma.clinicalCatalogTerm.update({ where: { id: b.id }, data: { status: "MERGED", mergedIntoId: a.id } });

    await expect(service.resolveCurrent(a.id)).rejects.toThrow(ApiException);
  });

  it("findActive() solo regresa términos ACTIVE del dominio pedido", async () => {
    const domain = uniqueKey("domain");
    const active = await service.create({ domain: domain, key: "activo", preferredTerm: "Activo", codingSystem: "PROPIETARIO" });
    const toObsolete = await service.create({ domain: domain, key: "obsoleto", preferredTerm: "Obsoleto", codingSystem: "PROPIETARIO" });
    await service.obsolete(toObsolete.id);

    const list = await service.findActive(domain);
    expect(list.map((t) => t.id)).toEqual([active.id]);
  });

  it("rechaza crear dos términos con la misma clave en el mismo dominio (409), pero permite la misma clave en dominios distintos", async () => {
    const key = uniqueKey("dup");
    await service.create({ domain: DOMAIN, key, preferredTerm: "Original", codingSystem: "PROPIETARIO" });
    await expect(service.create({ domain: DOMAIN, key, preferredTerm: "Duplicado", codingSystem: "PROPIETARIO" })).rejects.toThrow(ApiException);

    // Mismo key, dominio distinto — permitido, son catálogos separados.
    await expect(
      service.create({ domain: uniqueKey("OTRO_DOMINIO_2"), key, preferredTerm: "Mismo key, otro dominio", codingSystem: "PROPIETARIO" })
    ).resolves.toBeDefined();
  });

  it("rechaza un término cuya forma normalizada ya existe (409), y el error señala cuál es el existente", async () => {
    const domain = uniqueKey("norm-domain");
    const original = await service.create({ domain, key: uniqueKey("orig"), preferredTerm: "Hipotiroidismo", codingSystem: "PROPIETARIO" });

    try {
      await service.create({ domain, key: uniqueKey("dup2"), preferredTerm: "HIPOTIROIDISMO", codingSystem: "PROPIETARIO" });
      throw new Error("se esperaba que rechazara");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      const apiError = error as ApiException;
      expect(apiError.code).toBe("CATALOG_TERM_DUPLICATE_NORMALIZED_FORM");
      expect(apiError.details?.existingTermId).toBe(original.id);
      expect(apiError.message).toContain("Hipotiroidismo");
    }
  });

  it("el mismo término normalizado SÍ se permite en dominios distintos", async () => {
    const domainA = uniqueKey("norm-a");
    const domainB = uniqueKey("norm-b");
    await service.create({ domain: domainA, key: "k", preferredTerm: "Asma", codingSystem: "PROPIETARIO" });
    await expect(service.create({ domain: domainB, key: "k", preferredTerm: "ASMA", codingSystem: "PROPIETARIO" })).resolves.toBeDefined();
  });

  it("un término ya obsoleto sigue bloqueando la misma forma normalizada — no se puede recrear el duplicado", async () => {
    const domain = uniqueKey("norm-obsolete");
    const original = await service.create({ domain, key: uniqueKey("o1"), preferredTerm: "Gastritis", codingSystem: "PROPIETARIO" });
    await service.obsolete(original.id);

    await expect(
      service.create({ domain, key: uniqueKey("o2"), preferredTerm: "gastritis", codingSystem: "PROPIETARIO" })
    ).rejects.toThrow(ApiException);
  });

  describe("findPotentialDuplicates()", () => {
    it("regresa vacío en operación normal — todo pasó por create(), que ya bloquea duplicados", async () => {
      const domain = uniqueKey("report-clean");
      await service.create({ domain, key: "a", preferredTerm: "Término único A", codingSystem: "PROPIETARIO" });
      await service.create({ domain, key: "b", preferredTerm: "Término único B", codingSystem: "PROPIETARIO" });

      const report = await service.findPotentialDuplicates(domain);
      expect(report).toEqual([]);
    });

    // No hay una prueba de "detecta un duplicado real" aquí — y es a
    // propósito, no un hueco. El índice único (domain, normalizedTerm)
    // que agrega este mismo prompt hace que dos filas colisionantes
    // sean IMPOSIBLES de insertar por cualquier vía (create(),
    // createMany, incluso SQL crudo — Postgres lo rechaza siempre).
    // Simularlo exigiría quitar y volver a poner la restricción real a
    // mitad de la suite, un riesgo real para las demás pruebas del
    // archivo que no vale la pena correr por esto. El valor de
    // findPotentialDuplicates() de aquí en adelante es de auditoría
    // hacia el futuro (datos importados por otra vía, o si algún día
    // se relaja la restricción) — la prueba de arriba ya confirma que
    // no marca falsos positivos sobre datos limpios reales.
  });
});
