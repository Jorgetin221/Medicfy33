import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "../identity/services/notification.port";
import { TokenService } from "../identity/services/token.service";

class TestNotificationAdapter implements NotificationPort {
  async sendEmailVerificationCode(): Promise<void> {}
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

// Prefijo reconocible: la base de dev persiste entre corridas y los
// dominios del catálogo son los REALES (el contrato los cierra), así
// que cada corrida siembra términos nuevos con sufijo aleatorio en vez
// de chocar con los de la corrida anterior. R7 de CLAUDE.md: datos
// sintéticos, reconocibles como tales.
function testTerm(prefix: string): string {
  return `ZZTEST ${prefix} ${randomUUID().slice(0, 8)}`;
}
function testKey(prefix: string): string {
  return `zztest_${prefix}_${randomUUID().slice(0, 8)}`;
}

// Prompt 10-11: la API del catálogo cerrado — autorización por rol
// (con su prueba negativa, como exige el definition of done), curador
// fijado por el servidor, bitácora de cada mutación, dominios cerrados
// por contrato y detección de duplicados vía sinónimos curados.
describe("CatalogController — Prompts 10-11: API de curación", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let curatorUserId = "";
  let curatorToken = "";
  let doctorToken = "";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(new TestNotificationAdapter())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);

    const curator = await prisma.user.create({
      data: {
        email: `curator.${randomUUID()}@example.com`,
        passwordHash: "x",
        primaryRole: "CURATOR",
        status: "ACTIVE",
      },
    });
    curatorUserId = curator.id;
    curatorToken = tokenService.signAccessToken({ sub: curator.id, primaryRole: "CURATOR" });

    const doctorUser = await prisma.user.create({
      data: {
        email: `doctor.catalog.${randomUUID()}@example.com`,
        passwordHash: "x",
        primaryRole: "DOCTOR",
        status: "ACTIVE",
      },
    });
    doctorToken = tokenService.signAccessToken({ sub: doctorUser.id, primaryRole: "DOCTOR" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("sin token: 401 en lectura y en mutación", async () => {
    await request(app.getHttpServer()).get("/catalogs/ALERGIA_AGENTE").expect(401);
    await request(app.getHttpServer()).post("/catalogs/ALERGIA_AGENTE/terms").send({}).expect(401);
  });

  it("prueba negativa de autorización: un DOCTOR puede leer el catálogo pero NO curar (403 en alta, fusión, obsoleto, duplicados e informes)", async () => {
    await request(app.getHttpServer())
      .get("/catalogs/ALERGIA_AGENTE")
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ key: testKey("doc"), preferredTerm: testTerm("Doc"), codingSystem: "PROPIETARIO" })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/catalogs/terms/${randomUUID()}/obsolete`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/catalogs/terms/${randomUUID()}/merge`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ intoTermId: randomUUID() })
      .expect(403);

    await request(app.getHttpServer())
      .get("/catalogs/ALERGIA_AGENTE/duplicates")
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/catalogs/reports/antecedentes-otro")
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(403);
  });

  it("un dominio fuera de la lista cerrada se rechaza con 400 — el contrato es la puerta", async () => {
    await request(app.getHttpServer())
      .get("/catalogs/DOMINIO_INVENTADO")
      .set("Authorization", `Bearer ${curatorToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post("/catalogs/DOMINIO_INVENTADO/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("x"), preferredTerm: testTerm("X"), codingSystem: "PROPIETARIO" })
      .expect(400);
  });

  it("CURATOR da de alta un término: curatedBy = actor (el cuerpo no puede fijarlo) y la mutación queda en audit_log", async () => {
    const preferredTerm = testTerm("Penicilinas");
    const res = await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("pen"), preferredTerm, codingSystem: "PROPIETARIO" })
      .expect(201);

    expect(res.body.curatedBy).toBe(curatorUserId);
    expect(res.body.normalizedTerm).toContain("zztest");

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "CATALOG_TERM_CREATE", resourceId: res.body.id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actorUserId).toBe(curatorUserId);
    expect(auditRow?.actorRole).toBe("CURATOR");

    // curatedBy en el cuerpo ya ni siquiera es parte del contrato:
    // .strict() lo rechaza como campo desconocido.
    await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("cur"), preferredTerm: testTerm("Otro"), codingSystem: "PROPIETARIO", curatedBy: randomUUID() })
      .expect(400);
  });

  it("la búsqueda encuentra por forma normalizada (mayúsculas/acentos/plural) y por sinónimo curado", async () => {
    const base = `ZZTEST Amoxicilina ${randomUUID().slice(0, 8)}`;
    const synonym = `ZZTEST Amoxi-sinónimo ${randomUUID().slice(0, 8)}`;
    await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("amoxi"), preferredTerm: base, codingSystem: "PROPIETARIO", synonyms: [synonym] })
      .expect(201);

    // Tecleado distinto (mayúsculas) — normaliza igual.
    const bySearch = await request(app.getHttpServer())
      .get("/catalogs/ALERGIA_AGENTE")
      .query({ search: base.toUpperCase() })
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(200);
    expect(bySearch.body.map((t: { preferredTerm: string }) => t.preferredTerm)).toContain(base);

    // Por el sinónimo curado.
    const bySynonym = await request(app.getHttpServer())
      .get("/catalogs/ALERGIA_AGENTE")
      .query({ search: synonym })
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(200);
    expect(bySynonym.body.map((t: { preferredTerm: string }) => t.preferredTerm)).toContain(base);
  });

  it("Prompt 11: un término nuevo que colisiona con un SINÓNIMO curado de otro término se rechaza con 409 y el error señala el existente", async () => {
    const canonical = testTerm("Negado");
    const variant = `ZZTEST Sano ${randomUUID().slice(0, 8)}`;
    const created = await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("neg"), preferredTerm: canonical, codingSystem: "PROPIETARIO", synonyms: [variant] })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      // Variación de formato del sinónimo — normaliza a lo mismo.
      .send({ key: testKey("neg2"), preferredTerm: variant.toUpperCase(), codingSystem: "PROPIETARIO" })
      .expect(409);

    expect(rejected.body.error.code).toBe("CATALOG_TERM_DUPLICATE_NORMALIZED_FORM");
    expect(rejected.body.error.details.existingTermId).toBe(created.body.id);
  });

  it("fusión vía API: la fila sobrevive con status MERGED y la mutación queda en audit_log", async () => {
    const from = await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("from"), preferredTerm: testTerm("Origen"), codingSystem: "PROPIETARIO" })
      .expect(201);
    const into = await request(app.getHttpServer())
      .post("/catalogs/ALERGIA_AGENTE/terms")
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ key: testKey("into"), preferredTerm: testTerm("Destino"), codingSystem: "PROPIETARIO" })
      .expect(201);

    const merged = await request(app.getHttpServer())
      .post(`/catalogs/terms/${from.body.id}/merge`)
      .set("Authorization", `Bearer ${curatorToken}`)
      .send({ intoTermId: into.body.id })
      .expect(201);
    expect(merged.body.status).toBe("MERGED");
    expect(merged.body.mergedIntoId).toBe(into.body.id);

    const stillThere = await prisma.clinicalCatalogTerm.findUniqueOrThrow({ where: { id: from.body.id } });
    expect(stillThere.id).toBe(from.body.id);

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "CATALOG_TERM_MERGE", resourceId: from.body.id },
    });
    expect(auditRow?.actorUserId).toBe(curatorUserId);
  });

  it("los informes del curador agregan texto libre con umbral mínimo y registran el acceso en audit_log", async () => {
    const res = await request(app.getHttpServer())
      .get("/catalogs/reports/antecedentes-otro")
      .set("Authorization", `Bearer ${curatorToken}`)
      .expect(200);
    expect(res.body.minCount).toBe(2);
    expect(Array.isArray(res.body.report)).toBe(true);
    // Nada con count < minCount se expone.
    for (const row of res.body.report) {
      expect(row.count).toBeGreaterThanOrEqual(2);
    }

    const auditRow = await prisma.auditLog.findFirst({
      where: { action: "CATALOG_REPORT_ANTECEDENTES_OTRO", actorUserId: curatorUserId },
      orderBy: { occurredAt: "desc" },
    });
    expect(auditRow).not.toBeNull();

    await request(app.getHttpServer())
      .get("/catalogs/reports/diagnosticos-sin-codigo")
      .set("Authorization", `Bearer ${curatorToken}`)
      .expect(200);
  });
});
