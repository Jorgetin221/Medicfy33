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

// Foto de perfil del médico — subir, servir públicamente, reemplazar,
// quitar, y lo que NO se debe poder (sin sesión, otro formato, foto
// vieja).
const STRONG_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);

describe("Foto de perfil del médico", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function registerDoctor() {
    const res = await http().post("/auth/register/doctor").send({
      email: `doctor.foto.${randomUUID()}@example.com`,
      password: STRONG_PASSWORD,
      legalFirstName: "Elena",
      legalLastName: "Foto",
      professionalLicense: Math.floor(10000000 + Math.random() * 89999999).toString(),
      primarySpecialtyCode: "GENERAL",
      phone: `+52${Math.floor(1000000000 + Math.random() * 8999999999)}`,
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId } });
    return { doctor, accessToken: tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" }) };
  }

  function publicPath(photoUrl: string): string {
    return new URL(photoUrl).pathname;
  }

  it("sube, se ve en el perfil público y se sirve sin sesión", async () => {
    const { doctor, accessToken } = await registerDoctor();
    const upload = await http().post("/doctors/me/photo").set("Authorization", `Bearer ${accessToken}`).attach("file", JPEG, { filename: "yo.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(201);
    const photoUrl = upload.body.photoUrl as string;

    const profile = await http().get(`/doctors/${doctor.slug}/public`);
    expect(profile.body.photoUrl).toBe(photoUrl);

    const served = await http().get(publicPath(photoUrl));
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");
    expect(served.headers["cache-control"]).toContain("immutable");

    expect(await prisma.auditLog.findFirst({ where: { action: "doctors.photo.upload", resourceId: doctor.id } })).not.toBeNull();
  });

  it("al reemplazar, la foto anterior deja de servirse; al quitarla, también la actual", async () => {
    const { accessToken } = await registerDoctor();
    const first = await http().post("/doctors/me/photo").set("Authorization", `Bearer ${accessToken}`).attach("file", JPEG, { filename: "a.jpg", contentType: "image/jpeg" });
    const second = await http().post("/doctors/me/photo").set("Authorization", `Bearer ${accessToken}`).attach("file", PNG, { filename: "b.png", contentType: "image/png" });
    expect(second.status).toBe(201);
    expect((await http().get(publicPath(first.body.photoUrl))).status).toBe(404);
    expect((await http().get(publicPath(second.body.photoUrl))).status).toBe(200);

    const removed = await http().delete("/doctors/me/photo").set("Authorization", `Bearer ${accessToken}`);
    expect(removed.status).toBe(200);
    expect((await http().get(publicPath(second.body.photoUrl))).status).toBe(404);
    const me = await http().get("/doctors/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.body.photoUrl).toBeNull();
  });

  it("sin sesión no se puede subir ni quitar (401)", async () => {
    expect((await http().post("/doctors/me/photo").attach("file", JPEG, { filename: "yo.jpg", contentType: "image/jpeg" })).status).toBe(401);
    expect((await http().delete("/doctors/me/photo")).status).toBe(401);
  });

  it("rechaza un archivo que no es imagen aunque se declare como JPG, y sin archivo", async () => {
    const { accessToken } = await registerDoctor();
    const fake = await http().post("/doctors/me/photo").set("Authorization", `Bearer ${accessToken}`).attach("file", Buffer.from("MZ-no-soy-imagen"), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe("FILE_CONTENT_MISMATCH");
    const empty = await http().post("/doctors/me/photo").set("Authorization", `Bearer ${accessToken}`);
    expect(empty.status).toBe(400);
  });

  it("no sirve la foto de un médico desde la ruta de OTRO médico", async () => {
    const a = await registerDoctor();
    const b = await registerDoctor();
    const upload = await http().post("/doctors/me/photo").set("Authorization", `Bearer ${a.accessToken}`).attach("file", JPEG, { filename: "yo.jpg", contentType: "image/jpeg" });
    const fileName = (upload.body.photoUrl as string).split("/").at(-1);
    expect((await http().get(`/doctors/${b.doctor.slug}/public/photo/${fileName}`)).status).toBe(404);
  });
});
