import { PrismaService } from "../prisma/prisma.service";

// M9-RN-005/M10 §6.7: folio único e irrepetible, secuencia de
// Postgres dedicada (M9-CA-005: 1000 folios concurrentes, sin huecos
// ni duplicados) — mismo patrón que Patient.medicfyId
// (patients_medicfy_id_seq, ver patient.service.ts), no conteo a
// nivel de aplicación.
export async function nextPrescriptionFolio(prisma: PrismaService): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('prescriptions_folio_seq')`;
  const value = rows[0]?.nextval;
  if (value === undefined) {
    throw new Error("unreachable: SELECT nextval(...) always returns exactly one row");
  }
  return `MDF-${new Date().getUTCFullYear()}-${value.toString().padStart(6, "0")}`;
}

export async function nextLabOrderFolio(prisma: PrismaService): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('lab_orders_folio_seq')`;
  const value = rows[0]?.nextval;
  if (value === undefined) {
    throw new Error("unreachable: SELECT nextval(...) always returns exactly one row");
  }
  return `MDF-LAB-${new Date().getUTCFullYear()}-${value.toString().padStart(6, "0")}`;
}
