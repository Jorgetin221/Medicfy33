import { PrismaService } from "../prisma/prisma.service";

// §6.2: "medicfy_id VARCHAR UNIQUE — folio legible: MDF-000123".
// Postgres sequence (patients_medicfy_id_seq, from the M5a migration),
// not app-level counting — stays correct under concurrent patient
// creation without needing a lock. Shared by every path that creates
// a Patient row (doctor-created via PatientService, self-signup via
// AuthService) so the format never drifts between them.
export async function nextMedicfyId(prisma: PrismaService): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('patients_medicfy_id_seq')`;
  const value = rows[0]?.nextval;
  if (value === undefined) {
    throw new Error("unreachable: SELECT nextval(...) always returns exactly one row");
  }
  return `MDF-${value.toString().padStart(6, "0")}`;
}
