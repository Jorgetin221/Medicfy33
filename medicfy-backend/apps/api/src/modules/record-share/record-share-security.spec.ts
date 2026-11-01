import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleRecordShareNotificationAdapter, DEV_OUTBOX_PATH } from "./console-record-share-notification.adapter";
import { safeErrorLabel } from "./record-share-log.util";
import { RecordShareRequestsController } from "./record-share-requests.controller";
import { RecordShareAuthorizationController } from "./record-share-authorization.controller";
import { RecordShareViewerController } from "./record-share-viewer.controller";
import { RecordShareRevocationController } from "./record-share-revocation.controller";
import { RecordShareCustodianController } from "./record-share-custodian.controller";
import { RecordShareAdminController } from "./record-share-admin.controller";
import { RecordShareDoctorNotifierService } from "./services/record-share-doctor-notifier.service";
import { RecordShareSweepService } from "./services/record-share-sweep.service";
import { SharedSummaryService } from "./services/shared-summary.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { NotificationsService } from "../notifications/services/notifications.service";
import type { AuditService } from "../identity/services/audit.service";
import type { PatientClinicalService } from "../records/services/patient-clinical.service";
import type { LabResultAnalyteService } from "../labs/services/lab-result-analyte.service";

/**
 * PR-EXP-07 — batería de seguridad, parte UNITARIA (corre sin
 * Postgres). La parte que necesita la base real vive en
 * record-share-security.integration.spec.ts. El mapeo línea-por-línea
 * de la batería está en docs/expediente-compartido/README.md.
 */

const OTP = "482913";
const PATIENT_EMAIL = "rosaura.pena@example.com";
const PATIENT_NAME = "Rosaura";
const CLINICAL = "Episodio depresivo";

const CONTROLLERS = [
  RecordShareRequestsController,
  RecordShareAuthorizationController,
  RecordShareViewerController,
  RecordShareRevocationController,
  RecordShareCustodianController,
  RecordShareAdminController,
];
// Lo único que puede viajar en una ruta: identificadores opacos
// (UUID) o tokens aleatorios de 256 bits (RE9, R5).
const ALLOWED_PATH_PARAMS = new Set(["token", "grantId", "patientId", "id"]);

function captureLogs() {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  for (const level of ["log", "error", "warn", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(record);
  }
  return lines;
}

describe("Batería de seguridad — ningún OTP ni dato personal/clínico en logs de aplicación", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("el adaptador de desarrollo deposita el mensaje en el buzón, nunca en el log", async () => {
    const lines = captureLogs();
    const adapter = new ConsoleRecordShareNotificationAdapter();
    await adapter.sendOtpCode({ channel: "EMAIL", destination: PATIENT_EMAIL, code: OTP });
    await adapter.sendAuthorizationRequest({
      channel: "EMAIL",
      destination: PATIENT_EMAIL,
      requesterDisplayName: "Dra. Ana",
      requesterLicense: "1234567",
      requesterSpecialtyName: null,
      authorizationUrl: "http://localhost:3000/expediente-compartido/autorizar/tok",
    });
    await adapter.sendApprovalConfirmation({
      channel: "EMAIL",
      destination: PATIENT_EMAIL,
      requesterDisplayName: "Dra. Ana",
      scope: ["SUMMARY"],
      expiresAt: new Date(),
      revocationUrl: "http://localhost:3000/expediente-compartido/revocar/tok",
    });
    await adapter.sendRevocationNotice({ channel: "EMAIL", destination: PATIENT_EMAIL, requesterDisplayName: "Dra. Ana" });

    expect(lines).toHaveLength(4);
    const joined = lines.join("\n");
    expect(joined).not.toContain(OTP);
    expect(joined).not.toContain(PATIENT_EMAIL);
    expect(joined).not.toContain("/autorizar/");
    expect(joined).not.toContain("/revocar/");
    // …y el buzón sí lo tiene (el dev puede seguir probando el flujo).
    expect(readFileSync(DEV_OUTBOX_PATH, "utf8")).toContain(`código: ${OTP}`);
  });

  it("un error de Prisma con datos del paciente en `message` se registra solo por clase y código", async () => {
    const prismaLike = Object.assign(new Error(`Invalid invocation: where { firstName: "${PATIENT_NAME}", email: "${PATIENT_EMAIL}", description: "${CLINICAL}" }`), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    });
    expect(safeErrorLabel(prismaLike)).toBe("PrismaClientKnownRequestError (P2002)");

    const lines = captureLogs();
    const notifier = new RecordShareDoctorNotifierService(
      { doctor: { findUniqueOrThrow: vi.fn().mockResolvedValue({ userId: "u1", legalFirstName: "Ana" }) } } as unknown as PrismaService,
      { send: vi.fn().mockRejectedValue(prismaLike) } as unknown as NotificationsService
    );
    await notifier.revoked({ id: "g1", requesterDoctorId: "d1" });

    const sweep = new RecordShareSweepService(
      { recordShareRequest: { findMany: vi.fn().mockRejectedValue(prismaLike) } } as unknown as PrismaService,
      {} as AuditService,
      notifier
    );
    await sweep.sweep();

    const joined = lines.join("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(joined).not.toContain(PATIENT_NAME);
    expect(joined).not.toContain(PATIENT_EMAIL);
    expect(joined).not.toContain(CLINICAL);
  });

  it("ningún log del track usa error.message directamente (inspección de código)", () => {
    const sources = listSources(__dirname).filter((f) => !f.endsWith(".spec.ts"));
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      const logCalls = text.match(/this\.logger\.(log|error|warn|debug|verbose)\([^;]*\);/gs) ?? [];
      for (const call of logCalls) {
        expect(call, `${file}: ${call}`).not.toMatch(/\.message\b/);
        expect(call, `${file}: ${call}`).not.toMatch(/\bcode\b|destination|email|phone/i);
      }
    }
  });
});

describe("Batería de seguridad — producción no arranca con el adaptador de desarrollo", () => {
  const previous = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = previous;
  });

  it("init de la app falla en NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    const moduleRef = await Test.createTestingModule({ providers: [ConsoleRecordShareNotificationAdapter] }).compile();
    await expect(moduleRef.init()).rejects.toThrow(/must not run in production/);
  });

  it("y en desarrollo sí arranca", async () => {
    process.env.NODE_ENV = "development";
    const moduleRef = await Test.createTestingModule({ providers: [ConsoleRecordShareNotificationAdapter] }).compile();
    await expect(moduleRef.init()).resolves.toBeDefined();
    await moduleRef.close();
  });
});

describe("Batería de seguridad — ningún dato personal en URL ni query string", () => {
  it("las rutas del track solo llevan identificadores opacos y ningún endpoint lee query string", () => {
    for (const controller of CONTROLLERS) {
      const base = String(Reflect.getMetadata(PATH_METADATA, controller));
      const methods = Object.getOwnPropertyNames(controller.prototype).filter((m) => m !== "constructor");
      for (const method of methods) {
        const handler = (controller.prototype as unknown as Record<string, unknown>)[method];
        const sub = String(Reflect.getMetadata(PATH_METADATA, handler as object) ?? "");
        const params = `${base}/${sub}`.match(/:([A-Za-z]+)/g) ?? [];
        for (const p of params) expect(ALLOWED_PATH_PARAMS.has(p.slice(1)), `${controller.name}.${method}: ${p}`).toBe(true);

        const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<string, unknown>;
        const usesQuery = Object.keys(args).some((key) => Number(key.split(":")[0]) === RouteParamtypes.QUERY);
        expect(usesQuery, `${controller.name}.${method} lee @Query`).toBe(false);
      }
    }
  });

  it("los enlaces generados (autorizar, revocar, avisos a médicos) solo llevan token o UUID", async () => {
    const sources = ["services/record-share-request.service.ts", "services/record-share-authorization.service.ts"].map((f) =>
      readFileSync(join(__dirname, f), "utf8")
    );
    const urlTemplates = sources.flatMap((text) => text.match(/`\$\{[^`]*\/expediente-compartido\/[^`]*`/g) ?? []);
    expect(urlTemplates.length).toBeGreaterThanOrEqual(2);
    for (const template of urlTemplates) {
      const interpolations = template.match(/\$\{([^}]+)\}/g) ?? [];
      // origen + UN token aleatorio; nada más se interpola.
      expect(interpolations.slice(1), template).toEqual([expect.stringMatching(/Token\}$/)]);
      expect(template).not.toContain("?");
    }

    const send = vi.fn().mockResolvedValue({});
    const notifier = new RecordShareDoctorNotifierService(
      { doctor: { findUniqueOrThrow: vi.fn().mockResolvedValue({ userId: "u1", legalFirstName: "Ana", legalLastName: "X", displayName: null }) } } as unknown as PrismaService,
      { send } as unknown as NotificationsService
    );
    const grant = {
      id: "3f1c2b8e-1d2a-4c5b-9e8f-7a6b5c4d3e2f",
      patientId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      requesterDoctorId: "d1",
      custodianDoctorId: "d2",
      scope: ["SUMMARY" as const],
      expiresAt: new Date(),
    };
    await notifier.approved(grant);
    await notifier.custodianNotice(grant);
    await notifier.notAuthorized({ id: "r1", requesterDoctorId: "d1" });
    for (const [input] of send.mock.calls) {
      const links = JSON.stringify(input.rendered).match(/https?:\/\/[^"\s\\]+/g) ?? [];
      for (const link of links) {
        expect(new URL(link).search, link).toBe("");
        const path = new URL(link).pathname;
        expect(path, link).toMatch(/^\/(expediente-compartido\/(compartidos-conmigo|mis-solicitudes)|pacientes\/[0-9a-f-]{36})$/);
      }
    }
  });
});

describe("Batería de seguridad — borradores nunca visibles y sensibles sin rastro en TODAS las secciones", () => {
  function build() {
    const prisma = {
      encounterDiagnosis: { findMany: vi.fn().mockResolvedValue([{ encounterId: "enc-f32", icd10Code: "F32.1" }]) },
      clinicalEncounter: { findMany: vi.fn().mockResolvedValue([]) },
      prescription: { findMany: vi.fn().mockResolvedValue([]) },
      labOrder: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const patientClinical = {
      listAllergies: vi.fn().mockResolvedValue([]),
      listMedications: vi.fn().mockResolvedValue([]),
      activeDiagnoses: vi.fn().mockResolvedValue([]),
      listHistoryItems: vi.fn().mockResolvedValue([]),
      getActivePregnancy: vi.fn().mockResolvedValue(null),
      vitalsHistory: vi.fn().mockResolvedValue([]),
      notesTimeline: vi.fn().mockResolvedValue([]),
    };
    const labs = { listForPatient: vi.fn().mockResolvedValue([]) };
    const service = new SharedSummaryService(
      prisma as unknown as PrismaService,
      patientClinical as unknown as PatientClinicalService,
      labs as unknown as LabResultAnalyteService
    );
    return { service, prisma };
  }

  it("recetas y órdenes solo de encuentros FIRMADOS, y nunca de un encuentro sensible", async () => {
    const { service, prisma } = build();
    await service.buildSummary({
      patientId: "p1",
      scope: ["SUMMARY", "PRESCRIPTIONS", "STUDY_ORDERS"],
      excludedCategories: ["MENTAL_HEALTH"],
      pregnancyExcluded: false,
    });
    for (const query of [prisma.prescription.findMany, prisma.labOrder.findMany]) {
      const [{ where }] = query.mock.calls[0] ?? [];
      expect(where.encounter).toEqual({ status: "SIGNED" });
      expect(where.encounterId).toEqual({ notIn: ["enc-f32"] });
    }
  });

  it("la detección de sensibles solo mira diagnósticos de encuentros FIRMADOS", async () => {
    const { service, prisma } = build();
    await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: ["MENTAL_HEALTH"], pregnancyExcluded: false });
    const [{ where }] = prisma.encounterDiagnosis.findMany.mock.calls[0] ?? [];
    expect(where.encounter).toEqual({ patientId: "p1", status: "SIGNED" });
  });
});

// "Cada evento de la sección PR-EXP-01 §6 aparece en audit_log al
// menos en una prueba": esta guarda falla si alguien borra la última
// aserción de un evento en las pruebas de integración.
const AUDIT_EVENTS_SECTION_6 = [
  "SHARE_REQUESTED",
  "SHARE_NO_MATCH",
  "SHARE_OTP_SENT",
  "SHARE_OTP_FAILED",
  "SHARE_OTP_LOCKED",
  "SHARE_APPROVED",
  "SHARE_DENIED",
  "SHARE_REQUEST_EXPIRED",
  "SHARE_GRANT_EXPIRED",
  "SHARE_REVOKED",
  "SHARE_VIEWED",
  "SHARE_ACCESS_DENIED",
  "SHARE_ABUSE_REPORTED",
];

describe("Batería de seguridad — cobertura de eventos de audit_log (PR-EXP-01 §6)", () => {
  it("cada evento se busca en audit_log en al menos una prueba de integración", () => {
    const integration = listSources(__dirname)
      .filter((f) => f.endsWith(".integration.spec.ts"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    for (const event of AUDIT_EVENTS_SECTION_6) {
      const asserted = new RegExp(`auditLog\\.(findFirst|findMany|count)\\([^;]*["']${event}["']`, "s").test(integration);
      expect(asserted, `${event} no se verifica en audit_log en ninguna prueba`).toBe(true);
    }
  });
});

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}
