import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { TokenService } from "../identity/services/token.service";
import { PasswordService } from "../identity/services/password.service";

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.com`;
}

function uniquePhone(): string {
  const n = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  return `+52${n}`;
}

function uniqueCedula(): string {
  return Math.floor(1000000 + Math.random() * 8999999).toString();
}

const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

// M13 — panel de administración. Cubre lo que el módulo todavía no
// tenía prueba de integración propia: que AdminGuard de verdad
// bloquea a quien no es admin (Definition of Done de CLAUDE.md §4,
// "Autorización verificada con prueba negativa"), y que las
// respuestas de /admin/users nunca traen contenido clínico
// (M13-CA-001).
describe("M13 — panel de administración (usuarios y métricas)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let passwordService: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
    passwordService = moduleRef.get(PasswordService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAdmin(): Promise<{ userId: string; accessToken: string }> {
    const passwordHash = await passwordService.hash(STRONG_PASSWORD);
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail("admin"),
        passwordHash,
        primaryRole: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userRole.create({ data: { userId: admin.id, role: "ADMIN" } });
    const accessToken = tokenService.signAccessToken({ sub: admin.id, primaryRole: "ADMIN" });
    return { userId: admin.id, accessToken };
  }

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail("doctor");
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email,
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "García",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  describe("GET /admin/users", () => {
    it("rechaza sin token (401) y a un médico autenticado no-admin (403)", async () => {
      const anon = await request(app.getHttpServer()).get("/admin/users?q=a");
      expect(anon.status).toBe(401);

      const { accessToken } = await registerDoctor();
      const nonAdmin = await request(app.getHttpServer())
        .get("/admin/users?q=a")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(nonAdmin.status).toBe(403);
    });

    it("un admin busca y la respuesta no trae ningún campo clínico (M13-CA-001)", async () => {
      const { accessToken: adminToken } = await createAdmin();
      const { userId: doctorUserId } = await registerDoctor();
      const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId: doctorUserId } });

      const res = await request(app.getHttpServer())
        .get(`/admin/users?q=${doctor.professionalLicense}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("doctors");
      expect(res.body).toHaveProperty("patients");
      const found = (res.body.doctors as unknown[]).find((d) => (d as { id: string }).id === doctor.id);
      expect(found).toBeDefined();
      // R4 / M13-CA-001: identidad y estado, nunca nota, diagnóstico,
      // medicamento, receta ni resultado.
      const forbiddenKeys = ["diagnosis", "diagnostico", "medication", "medicamento", "prescription", "receta", "labResult", "clinicalNote"];
      const serialized = JSON.stringify(found).toLowerCase();
      for (const key of forbiddenKeys) {
        expect(serialized.includes(key.toLowerCase())).toBe(false);
      }
    });
  });

  describe("GET /admin/metrics", () => {
    it("rechaza sin token (401) y a un médico autenticado no-admin (403)", async () => {
      const anon = await request(app.getHttpServer()).get("/admin/metrics");
      expect(anon.status).toBe(401);

      const { accessToken } = await registerDoctor();
      const nonAdmin = await request(app.getHttpServer())
        .get("/admin/metrics")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(nonAdmin.status).toBe(403);
    });

    it("un admin obtiene las métricas, con mrr/churn null (M6 no existe) en vez de inventados", async () => {
      const { accessToken } = await createAdmin();
      const res = await request(app.getHttpServer()).get("/admin/metrics").set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ mrr: null, churn: null });
      expect(res.body).toHaveProperty("doctorsByVerificationStatus");
      expect(res.body).toHaveProperty("verificationQueue");
      expect(typeof res.body.verificationQueue.pending).toBe("number");
      expect(typeof res.body.verificationQueue.overdue).toBe("number");
    });
  });
});
