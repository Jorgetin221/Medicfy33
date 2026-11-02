// Normaliza a E.164 (+52 + 10 dígitos) los teléfonos ya guardados, para
// que la detección de coincidencias por teléfono (registro de paciente)
// y la advertencia de posible duplicado (alta por el médico) comparen
// siempre valores normalizados. Usa EXACTAMENTE la misma función que
// los esquemas de entrada (@medicfy/contracts normalizeMxPhoneToE164).
//
// Seguro por diseño:
// - Por defecto NO escribe nada: solo reporta qué cambiaría.
//   Con --apply escribe, en una transacción por tabla.
// - Solo cambia el FORMATO de un número que ya es mexicano válido
//   ("33 1234 5678" → "+523312345678"). Un valor que no se puede
//   normalizar con certeza se deja intacto y se reporta para revisión
//   manual — nunca se adivina, nunca se borra.
// - No toca ninguna tabla clínica (R1): solo users, patients y
//   patient_guardians, que medicfy_app ya puede actualizar.
// - Idempotente: correrlo dos veces no cambia nada la segunda vez.
//
// Uso (desde medicfy-backend/, con DATABASE_URL del dueño del esquema):
//   pnpm exec tsx --env-file=.env scripts/normalize-patient-phones.ts           # solo reporte
//   pnpm exec tsx --env-file=.env scripts/normalize-patient-phones.ts --apply   # escribe
//
// La salida lista ids y conteos, nunca el teléfono completo (R2: los
// logs no llevan datos de contacto de pacientes en claro).
import { PrismaClient, type Prisma } from "@prisma/client";
import { normalizeMxPhoneToE164 } from "../packages/contracts/src/validators/phone";

const APPLY = process.argv.includes("--apply");

interface PhoneColumn {
  label: string;
  load: (prisma: PrismaClient) => Promise<{ id: string; phone: string | null }[]>;
  update: (tx: Prisma.TransactionClient, id: string, phone: string) => Promise<unknown>;
}

const COLUMNS: PhoneColumn[] = [
  {
    label: "users.phoneE164",
    load: async (prisma) =>
      (await prisma.user.findMany({ select: { id: true, phoneE164: true } })).map((r) => ({ id: r.id, phone: r.phoneE164 })),
    update: (tx, id, phone) => tx.user.update({ where: { id }, data: { phoneE164: phone } }),
  },
  {
    label: "patients.phoneE164",
    load: async (prisma) =>
      (await prisma.patient.findMany({ select: { id: true, phoneE164: true } })).map((r) => ({ id: r.id, phone: r.phoneE164 })),
    update: (tx, id, phone) => tx.patient.update({ where: { id }, data: { phoneE164: phone } }),
  },
  {
    label: "patients.emergencyContactPhone",
    load: async (prisma) =>
      (await prisma.patient.findMany({ select: { id: true, emergencyContactPhone: true } })).map((r) => ({
        id: r.id,
        phone: r.emergencyContactPhone,
      })),
    update: (tx, id, phone) => tx.patient.update({ where: { id }, data: { emergencyContactPhone: phone } }),
  },
  {
    label: "patient_guardians.guardianPhoneE164",
    load: async (prisma) =>
      (await prisma.patientGuardian.findMany({ select: { id: true, guardianPhoneE164: true } })).map((r) => ({
        id: r.id,
        phone: r.guardianPhoneE164,
      })),
    update: (tx, id, phone) => tx.patientGuardian.update({ where: { id }, data: { guardianPhoneE164: phone } }),
  },
];

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `…${digits.slice(-4)}`;
}

async function processColumn(prisma: PrismaClient, column: PhoneColumn): Promise<void> {
  const rows = await column.load(prisma);
  const changes: { id: string; phone: string }[] = [];
  const unresolved: { id: string; masked: string }[] = [];

  for (const row of rows) {
    if (row.phone === null || row.phone === "") continue;
    const normalized = normalizeMxPhoneToE164(row.phone);
    if (normalized === null) {
      unresolved.push({ id: row.id, masked: maskPhone(row.phone) });
    } else if (normalized !== row.phone) {
      changes.push({ id: row.id, phone: normalized });
    }
  }

  console.info(`\n${column.label}: ${rows.length} filas, ${changes.length} por normalizar, ${unresolved.length} sin normalizar`);
  for (const item of unresolved) {
    console.info(`  REVISAR A MANO  id=${item.id}  valor=${item.masked}`);
  }
  if (!APPLY || changes.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      await column.update(tx, change.id, change.phone);
    }
  });
  console.info(`  ${changes.length} filas actualizadas.`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no está definida (usa --env-file=.env o expórtala antes de correr el script).");
  }
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    console.info(APPLY ? "Modo --apply: se escribirán los cambios." : "Modo reporte (sin --apply): no se escribe nada.");
    for (const column of COLUMNS) {
      await processColumn(prisma, column);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
