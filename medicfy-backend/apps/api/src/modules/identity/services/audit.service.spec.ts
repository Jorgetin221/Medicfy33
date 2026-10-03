import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuditLogChainHashInput, sha256Hex } from "../../../common/content-hash.util";
import { AuditService } from "./audit.service";
import { Prisma } from "@prisma/client";

// M15-RN-002: estas pruebas cubren el encadenamiento de hashes, no la
// persistencia real (no hay Postgres en este entorno) — se mockea
// PrismaService reproduciendo el contrato exacto que AuditService.log()
// usa: $transaction(cb), tx.$queryRaw (lee audit_log_chain_state),
// tx.auditLog.create, tx.$executeRaw (avanza el puntero). El mock
// mantiene su propio estado en memoria para simular la fila única
// bloqueada por SELECT ... FOR UPDATE entre llamadas sucesivas.
function buildPrismaMock() {
  const chainState: { lastSequence: bigint; lastHashSha256: string | null } = {
    lastSequence: 0n,
    lastHashSha256: null,
  };
  const createdRows: Record<string, unknown>[] = [];

  const mockTx = {
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray) => [
      { lastSequence: chainState.lastSequence, lastHashSha256: chainState.lastHashSha256 },
    ]),
    $executeRaw: vi.fn(async (_strings: TemplateStringsArray, sequence: bigint, hashSha256: string) => {
      chainState.lastSequence = sequence;
      chainState.lastHashSha256 = hashSha256;
    }),
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdRows.push(data);
        return data;
      }),
    },
  };

  // Nombre distinto al del parámetro (`client`, no `tx`) a propósito:
  // `(tx: typeof tx)` con el mismo nombre para parámetro y anotación
  // de tipo es un self-reference de TypeScript (TS2502), no un typo.
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
  } as unknown as ConstructorParameters<typeof AuditService>[0];

  return { prisma, tx: mockTx, createdRows, chainState };
}

describe("AuditService.log — encadenamiento de hashes (M15-RN-002)", () => {
  let mock: ReturnType<typeof buildPrismaMock>;
  let service: AuditService;

  beforeEach(() => {
    mock = buildPrismaMock();
    service = new AuditService(mock.prisma);
  });

  it("la primera fila encadenada arranca en sequence=1 con previousHashSha256 null", async () => {
    await service.log({ action: "test.action", resourceType: "test_resource", result: "SUCCESS" });

    expect(mock.createdRows).toHaveLength(1);
    const row = mock.createdRows[0]!;
    expect(row.sequence).toBe(1n);
    expect(row.previousHashSha256).toBeNull();
    expect(typeof row.hashSha256).toBe("string");
    expect((row.hashSha256 as string).length).toBe(64); // hex SHA-256
  });

  it("la segunda fila encadena con el hashSha256 de la primera y avanza la secuencia", async () => {
    await service.log({ action: "first", resourceType: "r", result: "SUCCESS" });
    const firstHash = mock.createdRows[0]!.hashSha256 as string;

    await service.log({ action: "second", resourceType: "r", result: "SUCCESS" });
    const second = mock.createdRows[1]!;

    expect(second.sequence).toBe(2n);
    expect(second.previousHashSha256).toBe(firstHash);
  });

  it("el hash guardado es recalculable de forma independiente a partir de los mismos campos", async () => {
    await service.log({
      actorUserId: "user-1",
      actorRole: "DOCTOR",
      action: "records.documents.view",
      resourceType: "clinical_attachment",
      resourceId: "att-1",
      patientId: "patient-1",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      requestId: "req-1",
      result: "SUCCESS",
      metadata: { note: "sin contenido clínico" },
    });

    const row = mock.createdRows[0]!;
    const recomputed = sha256Hex(
      buildAuditLogChainHashInput({
        id: row.id as string,
        actorUserId: row.actorUserId as string | null,
        actorRole: row.actorRole as string | null,
        action: row.action as string,
        resourceType: row.resourceType as string,
        resourceId: row.resourceId as string | null,
        patientId: row.patientId as string | null,
        ipAddress: row.ipAddress as string | null,
        userAgent: row.userAgent as string | null,
        requestId: row.requestId as string | null,
        justification: row.justification as string | null,
        result: row.result as string,
        metadata: row.metadata,
        occurredAtIso: (row.occurredAt as Date).toISOString(),
        sequence: (row.sequence as bigint).toString(),
        previousHashSha256: row.previousHashSha256 as string | null,
      })
    );

    expect(recomputed).toBe(row.hashSha256);
  });

  it("metadata ausente se guarda como Prisma.JsonNull (columna Json?, nunca undefined)", async () => {
    await service.log({ action: "no.metadata", resourceType: "r", result: "DENIED" });
    // Prisma tipa una columna Json nullable como
    // InputJsonValue | JsonNull | DbNull, así que el valor explícito que
    // viaja al create es el centinela JsonNull, no un `null` crudo.
    // Equivalen en la base: ambos escriben json 'null' (no SQL NULL),
    // que es lo que las filas encadenadas ya contenían antes del cambio.
    expect(mock.createdRows[0]!.metadata).toBe(Prisma.JsonNull);
    // Lo que esta prueba cuida de verdad: nunca `undefined`, porque
    // Prisma lo interpretaría como "no toques esta columna".
    expect(mock.createdRows[0]!.metadata).not.toBeUndefined();
  });

  it("bloquea la fila puntero con FOR UPDATE antes de calcular el hash (no lee sin bloquear)", async () => {
    await service.log({ action: "a", resourceType: "r", result: "SUCCESS" });
    const strings = mock.tx.$queryRaw.mock.calls[0]![0] as unknown as string[];
    const sql = strings.join(" ");
    expect(sql.toUpperCase()).toContain("FOR UPDATE");
  });
});
