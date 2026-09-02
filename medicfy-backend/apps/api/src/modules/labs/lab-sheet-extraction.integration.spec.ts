import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { ApiExceptionFilter } from "../../common/api-exception.filter";
import { PrismaService } from "../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "../identity/services/notification.port";
import { TokenService } from "../identity/services/token.service";
import { LAB_OCR_PORT } from "./services/lab-ocr.port";
import type { LabOcrExtractInput, LabOcrOutcome, LabOcrPort } from "./services/lab-ocr.port";

class TestNotificationAdapter implements NotificationPort {
  async sendEmailVerificationCode(): Promise<void> {}
  async sendPhoneVerificationCode(): Promise<void> {}
  async sendPasswordResetLink(): Promise<void> {}
  async sendAssistantInvitation(): Promise<void> {}
  async sendAppointmentCancelledDoctorSuspended(): Promise<void> {}
}

// Capa 1 — doble de prueba del puerto OCR, mismo patrón que
// FakeAssistantModelPort (assistant-summary.integration.spec.ts):
// nunca llama a AWS de verdad, permite fijar el resultado del
// próximo intento por prueba.
class FakeLabOcrPort implements LabOcrPort {
  public calls: LabOcrExtractInput[] = [];
  public nextOutcome: LabOcrOutcome = {
    kind: "ok",
    result: { labNameDetected: null, resultDateDetected: null, candidates: [] },
  };

  async extract(input: LabOcrExtractInput): Promise<LabOcrOutcome> {
    this.calls.push(input);
    return this.nextOutcome;
  }
}

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

describe("Capa 1 — extracción automática de hojas de laboratorio (visión de Claude vía doble de prueba)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let fakeOcr: FakeLabOcrPort;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(new TestNotificationAdapter())
      .overrideProvider(LAB_OCR_PORT)
      .useClass(FakeLabOcrPort)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
    fakeOcr = moduleRef.get(LAB_OCR_PORT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeOcr.calls = [];
    fakeOcr.nextOutcome = { kind: "ok", result: { labNameDetected: null, resultDateDetected: null, candidates: [] } };
  });

  async function registerDoctor(): Promise<{ userId: string; accessToken: string }> {
    const res = await request(app.getHttpServer()).post("/auth/register/doctor").send({
      email: uniqueEmail("doctor"),
      password: STRONG_PASSWORD,
      legalFirstName: "Rocío",
      legalLastName: "Beltrán",
      professionalLicense: uniqueCedula(),
      primarySpecialtyCode: "GENERAL",
      phone: uniquePhone(),
    });
    expect(res.status).toBe(201);
    const userId = res.body.userId as string;
    const accessToken = tokenService.signAccessToken({ sub: userId, primaryRole: "DOCTOR" });
    return { userId, accessToken };
  }

  async function createPatient(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Paciente",
        lastNamePaternal: "HojaLab",
        birthDate: "1988-03-10",
        sexAtBirth: "M",
        phoneE164: uniquePhone(),
        email: uniqueEmail("patient"),
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function uploadSheet(accessToken: string, patientId: string) {
    return request(app.getHttpServer())
      .post(`/lab-sheet-extractions/patients/${patientId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("file", Buffer.from("%PDF-1.4 contenido de prueba"), { filename: "hoja.pdf", contentType: "application/pdf" });
  }

  it("sube una hoja, el doble de prueba regresa candidatas, y quedan en espera de revisión — nunca en lab_result_analytes todavía", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    fakeOcr.nextOutcome = {
      kind: "ok",
      result: {
        labNameDetected: null,
        resultDateDetected: null,
        candidates: [
          { analyteNameRaw: "Glucosa", valueRaw: "95", unitRaw: "mg/dL", referenceMinPrinted: 70, referenceMaxPrinted: 99, confidence: "HIGH" },
          { analyteNameRaw: "Creatinina", valueRaw: "0.9", unitRaw: "mg/dL", referenceMinPrinted: 0.6, referenceMaxPrinted: 1.2, confidence: "MEDIUM" },
        ],
      },
    };

    const uploaded = await uploadSheet(doctor.accessToken, patientId);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.status).toBe("REVIEW_PENDING");
    expect(uploaded.body.candidates).toHaveLength(2);
    expect(fakeOcr.calls).toHaveLength(1);

    const stillEmpty = await prisma.labResultAnalyte.findMany({ where: { patientId } });
    expect(stillEmpty).toHaveLength(0);
  });

  it("regla de oro: una candidata de confianza baja sin confirmación explícita no se puede promover (422), y la extracción sigue pendiente", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    fakeOcr.nextOutcome = {
      kind: "ok",
      result: {
        labNameDetected: null,
        resultDateDetected: null,
        candidates: [{ analyteNameRaw: "Hemoglobina", valueRaw: "14.2", unitRaw: "g/dL", referenceMinPrinted: null, referenceMaxPrinted: null, confidence: "LOW" }],
      },
    };
    const uploaded = await uploadSheet(doctor.accessToken, patientId);
    const candidateId = uploaded.body.candidates[0].id as string;

    // included=true, mismo valor que el crudo (sin editar), y SIN
    // confirmedLowConfidence — exactamente el caso que debe rechazarse.
    const rejected = await request(app.getHttpServer())
      .post(`/lab-sheet-extractions/patients/${patientId}/${uploaded.body.id}/review`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        measuredAt: "2026-09-01",
        candidates: [{ candidateId, included: true, analyteName: "Hemoglobina", value: 14.2, unit: "g/dL" }],
      });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe("LAB_SHEET_EXTRACTION_LOW_CONFIDENCE_UNCONFIRMED");

    const extraction = await prisma.labSheetExtraction.findUniqueOrThrow({ where: { id: uploaded.body.id } });
    expect(extraction.status).toBe("REVIEW_PENDING");
    const analytes = await prisma.labResultAnalyte.findMany({ where: { patientId } });
    expect(analytes).toHaveLength(0);
  });

  it("una revisión completa (confianza alta directa, confianza baja con confirmación explícita) promueve a lab_result_analytes con source=OCR_REVIEWED", async () => {
    const doctor = await registerDoctor();
    const patientId = await createPatient(doctor.accessToken);

    fakeOcr.nextOutcome = {
      kind: "ok",
      result: {
        labNameDetected: "Laboratorio Prueba",
        resultDateDetected: null,
        candidates: [
          { analyteNameRaw: "Glucosa", valueRaw: "95", unitRaw: "mg/dL", referenceMinPrinted: 70, referenceMaxPrinted: 99, confidence: "HIGH" },
          { analyteNameRaw: "TSH", valueRaw: "2.1", unitRaw: "mUI/L", referenceMinPrinted: null, referenceMaxPrinted: null, confidence: "LOW" },
        ],
      },
    };
    const uploaded = await uploadSheet(doctor.accessToken, patientId);
    const [glucosa, tsh] = uploaded.body.candidates as { id: string; analyteNameRaw: string }[];

    const reviewed = await request(app.getHttpServer())
      .post(`/lab-sheet-extractions/patients/${patientId}/${uploaded.body.id}/review`)
      .set("Authorization", `Bearer ${doctor.accessToken}`)
      .send({
        measuredAt: "2026-09-01",
        labName: "Laboratorio Confirmado",
        candidates: [
          { candidateId: glucosa!.id, included: true, analyteName: "Glucosa", value: 95, unit: "mg/dL", referenceMin: 70, referenceMax: 99 },
          { candidateId: tsh!.id, included: true, analyteName: "TSH", value: 2.1, unit: "mUI/L", confirmedLowConfidence: true },
        ],
      });
    expect(reviewed.status).toBe(201);
    expect(reviewed.body.created).toBe(2);

    const analytes = await prisma.labResultAnalyte.findMany({ where: { patientId }, orderBy: { analyteName: "asc" } });
    expect(analytes).toHaveLength(2);
    expect(analytes.every((a) => a.source === "OCR_REVIEWED")).toBe(true);
    expect(analytes.every((a) => a.labName === "Laboratorio Confirmado")).toBe(true);

    const extraction = await prisma.labSheetExtraction.findUniqueOrThrow({ where: { id: uploaded.body.id } });
    expect(extraction.status).toBe("ACCEPTED");
    expect(extraction.reviewedByUserId).toBe(doctor.userId);
  });

  it("un médico sin vínculo con el paciente no puede subir una hoja (403) y el puerto OCR nunca se llama", async () => {
    const owner = await registerDoctor();
    const patientId = await createPatient(owner.accessToken);
    const stranger = await registerDoctor();

    const callsBefore = fakeOcr.calls.length;
    const blocked = await uploadSheet(stranger.accessToken, patientId);
    expect(blocked.status).toBe(403);
    expect(fakeOcr.calls.length).toBe(callsBefore);
  });
});
