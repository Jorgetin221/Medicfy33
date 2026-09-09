import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { TokenService } from "../identity/services/token.service";

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

// M12 — GET/PATCH /notification-preferences. Sin prueba de
// integración propia hasta ahora (Definition of Done de CLAUDE.md §4:
// "Autorización verificada con prueba negativa").
describe("M12 — GET/PATCH /notification-preferences", () => {
  let app: INestApplication;
  let tokenService: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    tokenService = moduleRef.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerDoctor(): Promise<{ accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Ana",
      legalLastName: "García",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const accessToken = tokenService.signAccessToken({ sub: res.body.userId as string, primaryRole: "DOCTOR" });
    return { accessToken };
  }

  it("rechaza sin token (401)", async () => {
    const get = await request(app.getHttpServer()).get("/notification-preferences");
    expect(get.status).toBe(401);
    const patch = await request(app.getHttpServer()).patch("/notification-preferences").send({ channel: "EMAIL" });
    expect(patch.status).toBe(401);
  });

  it("un usuario recién registrado empieza en EMAIL (default del esquema)", async () => {
    const { accessToken } = await registerDoctor();
    const res = await request(app.getHttpServer()).get("/notification-preferences").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ channel: "EMAIL" });
  });

  it("PATCH con un canal inválido devuelve 400 sin tocar la preferencia guardada", async () => {
    const { accessToken } = await registerDoctor();
    const res = await request(app.getHttpServer())
      .patch("/notification-preferences")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ channel: "SMS" });
    expect(res.status).toBe(400);
  });

  it("M12-RN-003: cambia a WHATSAPP y la lectura posterior lo refleja — sin booleano de apagado, solo elección de canal", async () => {
    const { accessToken } = await registerDoctor();
    const patch = await request(app.getHttpServer())
      .patch("/notification-preferences")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ channel: "WHATSAPP" });
    expect(patch.status).toBe(200);
    expect(patch.body).toEqual({ channel: "WHATSAPP" });

    const get = await request(app.getHttpServer()).get("/notification-preferences").set("Authorization", `Bearer ${accessToken}`);
    expect(get.body).toEqual({ channel: "WHATSAPP" });
  });
});
