import { describe, expect, it, vi } from "vitest";
import { RecordShareSweepService } from "./record-share-sweep.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { AuditService } from "../../identity/services/audit.service";
import type { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";

// PR-EXP-06 — barrido con dobles: sin base de datos. La prueba con
// Postgres real vive en record-share-revocation.integration.spec.ts.
function build(options: { requestUpdateCount?: number; grantUpdateCount?: number } = {}) {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const staleRequest = { id: "req-1", patientId: "pat-1", requesterDoctorId: "doc-1" };
  const expiredGrant = { id: "grant-1", patientId: "pat-1", requesterDoctorId: "doc-1", expiresAt: new Date(now.getTime() - 1) };
  const soonGrant = { id: "grant-2", patientId: "pat-2", requesterDoctorId: "doc-1", expiresAt: new Date(now.getTime() + 60 * 60 * 1000) };

  const prisma = {
    recordShareRequest: {
      findMany: vi.fn().mockResolvedValue([staleRequest]),
      updateMany: vi.fn().mockResolvedValue({ count: options.requestUpdateCount ?? 1 }),
    },
    recordShareGrant: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([expiredGrant])
        .mockResolvedValueOnce([soonGrant]),
      updateMany: vi.fn().mockResolvedValue({ count: options.grantUpdateCount ?? 1 }),
    },
  };
  const audit = { log: vi.fn().mockResolvedValue(undefined) };
  const notifier = {
    notAuthorized: vi.fn().mockResolvedValue(undefined),
    expiring: vi.fn().mockResolvedValue(undefined),
  };
  const service = new RecordShareSweepService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    notifier as unknown as RecordShareDoctorNotifierService
  );
  return { service, prisma, audit, notifier, now, staleRequest, soonGrant };
}

describe("RecordShareSweepService", () => {
  it("vence solicitudes y grants con compare-and-set, audita y avisa", async () => {
    const { service, prisma, audit, notifier, now, staleRequest, soonGrant } = build();
    const result = await service.sweep(now);

    expect(result).toEqual({ requestsExpired: 1, grantsExpired: 1, expiringNotified: 1 });
    expect(prisma.recordShareRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", status: "PENDING_PATIENT" },
      data: { status: "EXPIRED_UNANSWERED" },
    });
    expect(prisma.recordShareGrant.updateMany).toHaveBeenCalledWith({
      where: { id: "grant-1", status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    expect(audit.log.mock.calls.map(([e]) => e.action)).toEqual(["SHARE_REQUEST_EXPIRED", "SHARE_GRANT_EXPIRED"]);
    expect(notifier.notAuthorized).toHaveBeenCalledWith(staleRequest);
    expect(notifier.expiring).toHaveBeenCalledWith(soonGrant);
  });

  it("si otro proceso ganó la carrera (count=0) no audita ni avisa dos veces", async () => {
    const { service, audit, notifier, now } = build({ requestUpdateCount: 0, grantUpdateCount: 0 });
    const result = await service.sweep(now);
    expect(result.requestsExpired).toBe(0);
    expect(result.grantsExpired).toBe(0);
    expect(audit.log).not.toHaveBeenCalled();
    expect(notifier.notAuthorized).not.toHaveBeenCalled();
  });

  it("un fallo de base de datos no tumba el proceso", async () => {
    const { service, prisma, now } = build();
    prisma.recordShareRequest.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(service.sweep(now)).resolves.toEqual({ requestsExpired: 0, grantsExpired: 0, expiringNotified: 0 });
  });

  it("no arranca el intervalo en NODE_ENV=test", () => {
    const { service } = build();
    const spy = vi.spyOn(global, "setInterval");
    service.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
