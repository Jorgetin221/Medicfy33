import { describe, expect, it } from "vitest";
import { buildAuditLogChainHashInput, sha256Hex } from "../../../common/content-hash.util";
import { AuditChainVerifierService } from "./audit-chain-verifier.service";

interface FixtureRow {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  patientId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  justification: string | null;
  result: string;
  metadata: unknown;
  occurredAt: Date;
  sequence: bigint;
  hashSha256: string;
  previousHashSha256: string | null;
}

// Construye una cadena válida de `count` filas, exactamente con el
// mismo cálculo que AuditService.log() — para poder alterar una sola
// fila en las pruebas y confirmar que el verificador la detecta, sin
// depender de Postgres real.
function buildValidChain(count: number): FixtureRow[] {
  const rows: FixtureRow[] = [];
  let previousHashSha256: string | null = null;

  for (let i = 1; i <= count; i++) {
    const base = {
      id: `row-${i}`,
      actorUserId: `user-${i}`,
      actorRole: "DOCTOR",
      action: `action.${i}`,
      resourceType: "test_resource",
      resourceId: null,
      patientId: null,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestId: null,
      justification: null,
      result: "SUCCESS",
      metadata: null,
      occurredAt: new Date(2026, 0, i),
      sequence: BigInt(i),
    };
    const hashSha256 = sha256Hex(
      buildAuditLogChainHashInput({
        ...base,
        occurredAtIso: base.occurredAt.toISOString(),
        sequence: base.sequence.toString(),
        previousHashSha256,
      })
    );
    rows.push({ ...base, hashSha256, previousHashSha256 });
    previousHashSha256 = hashSha256;
  }

  return rows;
}

function buildService(rows: FixtureRow[]): AuditChainVerifierService {
  const prisma = {
    auditLog: { findMany: async () => rows },
  } as unknown as ConstructorParameters<typeof AuditChainVerifierService>[0];
  return new AuditChainVerifierService(prisma);
}

describe("AuditChainVerifierService (M15-RN-002)", () => {
  it("reporta OK sobre una cadena de audit_log sin alteraciones", async () => {
    const result = await buildService(buildValidChain(5)).verifyChain();
    expect(result).toEqual({ status: "OK", totalChecked: 5, brokenAtSequence: null, reasons: [] });
  });

  it("reporta OK con cero filas encadenadas (aún no hay ninguna, o todas son anteriores a la migración)", async () => {
    const result = await buildService([]).verifyChain();
    expect(result).toEqual({ status: "OK", totalChecked: 0, brokenAtSequence: null, reasons: [] });
  });

  it("detecta que el contenido de una fila fue alterado directamente en la base de datos", async () => {
    const rows = buildValidChain(4);
    // Alteración directa: cambia el action de la fila 3 sin recalcular
    // su hashSha256 — simula un UPDATE hecho por fuera de la app.
    rows[2]!.action = "action.tampered";

    const result = await buildService(rows).verifyChain();

    expect(result.status).toBe("ROTA");
    expect(result.brokenAtSequence).toBe("3");
    expect(result.reasons[0]).toContain("no coincide con su propio sello");
  });

  it("detecta una fila alterada aunque su propio hashSha256 se haya recalculado para coincidir consigo misma", async () => {
    const rows = buildValidChain(4);
    // Ataque más sofisticado: recalcular el propio hash tras alterar el
    // contenido, para pasar la comparación (a). El eslabón (b) con la
    // fila SIGUIENTE sigue apuntando al hash ORIGINAL — no coincide.
    rows[1]!.action = "action.tampered";
    rows[1]!.hashSha256 = sha256Hex(
      buildAuditLogChainHashInput({
        id: rows[1]!.id,
        actorUserId: rows[1]!.actorUserId,
        actorRole: rows[1]!.actorRole,
        action: rows[1]!.action,
        resourceType: rows[1]!.resourceType,
        resourceId: rows[1]!.resourceId,
        patientId: rows[1]!.patientId,
        ipAddress: rows[1]!.ipAddress,
        userAgent: rows[1]!.userAgent,
        requestId: rows[1]!.requestId,
        justification: rows[1]!.justification,
        result: rows[1]!.result,
        metadata: rows[1]!.metadata,
        occurredAtIso: rows[1]!.occurredAt.toISOString(),
        sequence: rows[1]!.sequence.toString(),
        previousHashSha256: rows[1]!.previousHashSha256,
      })
    );

    const result = await buildService(rows).verifyChain();

    expect(result.status).toBe("ROTA");
    expect(result.brokenAtSequence).toBe("3");
    expect(result.reasons[0]).toContain("eslabón con la fila anterior");
  });
});
