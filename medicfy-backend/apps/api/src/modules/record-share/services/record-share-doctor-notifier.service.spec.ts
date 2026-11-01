import { describe, expect, it, vi } from "vitest";
import { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { NotificationsService } from "../../notifications/services/notifications.service";

// PR-EXP-06 — inspección de payload (RE9/R2): lo que se entrega a
// NotificationsService nunca lleva nombre del paciente ni dato
// clínico, y un fallo de envío nunca se propaga.
const doctors: Record<string, { userId: string; legalFirstName: string; legalLastName: string; displayName: string | null }> = {
  "doc-req": { userId: "user-req", legalFirstName: "Ana", legalLastName: "Solicitante", displayName: null },
  "doc-cus": { userId: "user-cus", legalFirstName: "Luis", legalLastName: "Custodio", displayName: "Dr. Luis Custodio" },
};

function build(sendImpl?: () => Promise<unknown>) {
  const prisma = {
    doctor: { findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(doctors[where.id])) },
  };
  type SendInput = { userId: string; templateCode: string; rendered: unknown };
  const notifications = { send: vi.fn((_input: SendInput) => (sendImpl ?? (() => Promise.resolve({})))()) };
  const service = new RecordShareDoctorNotifierService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService);
  return { service, notifications };
}

const FORBIDDEN = [/Rosaura/i, /Peña/i, /diagn/i, /medicamento/i, /pat-1/];
const grant = {
  id: "grant-1",
  patientId: "pat-1",
  requesterDoctorId: "doc-req",
  custodianDoctorId: "doc-cus",
  scope: ["SUMMARY" as const, "RESULTS" as const],
  expiresAt: new Date("2026-12-01T12:00:00.000Z"),
};

describe("RecordShareDoctorNotifierService", () => {
  it("cada aviso va al médico correcto con su plantilla y sin datos del paciente", async () => {
    const { service, notifications } = build();
    await service.approved(grant);
    await service.notAuthorized({ id: "req-1", requesterDoctorId: "doc-req" });
    await service.revoked(grant);
    await service.expiring(grant);

    const calls = notifications.send.mock.calls.map(([input]) => input);
    expect(calls.map((c) => [c.userId, c.templateCode])).toEqual([
      ["user-req", "RECORD_SHARE_APPROVED"],
      ["user-req", "RECORD_SHARE_NOT_AUTHORIZED"],
      ["user-req", "RECORD_SHARE_REVOKED"],
      ["user-req", "RECORD_SHARE_EXPIRING"],
    ]);
    for (const c of calls) {
      const payload = JSON.stringify(c.rendered);
      for (const pattern of FORBIDDEN) expect(payload).not.toMatch(pattern);
    }
  });

  it("el aviso al custodio enlaza al expediente por id opaco, sin nombre del paciente (RE9)", async () => {
    const { service, notifications } = build();
    await service.custodianNotice(grant);
    const input = notifications.send.mock.calls[0]?.[0];
    if (!input) throw new Error("custodianNotice no llamó a send");
    expect(input.userId).toBe("user-cus");
    expect(input.templateCode).toBe("RECORD_SHARE_CUSTODIAN_NOTICE");
    const body = JSON.stringify(input.rendered);
    expect(body).toContain("Ana Solicitante");
    expect(body).not.toMatch(/Rosaura|Peña/);
  });

  it("un fallo de envío se registra y NO se propaga (la acción ya ocurrió)", async () => {
    const { service } = build(() => Promise.reject(new Error("smtp down")));
    await expect(service.approved(grant)).resolves.toBeUndefined();
  });
});
