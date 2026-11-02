// SOLO LECTURA. Lista posibles expedientes duplicados que ya existen,
// para revisión manual:
//   (a) mismo teléfono normalizado + misma fecha de nacimiento, o
//   (b) mismo nombre completo normalizado + misma fecha de nacimiento.
//
// No modifica ni fusiona nada: todo corre dentro de una transacción
// `READ ONLY` de PostgreSQL, así que aunque alguien agregara por error
// una escritura aquí, la base la rechazaría. Fusionar expedientes es
// una decisión clínica-legal (NOM-004) que se toma a mano, caso por caso.
//
// Uso (desde medicfy-backend/):
//   pnpm exec tsx --env-file=.env scripts/report-possible-duplicates.ts
//   pnpm exec tsx --env-file=.env scripts/report-possible-duplicates.ts --show-names
//   pnpm exec tsx --env-file=.env scripts/report-possible-duplicates.ts --json > duplicados.json
//
// Por defecto imprime solo identificadores (Medicfy ID, id, origen,
// si tiene cuenta, médicos con vínculo): suficiente para abrir cada
// expediente. --show-names agrega el nombre — trata esa salida como
// dato personal y no la pegues en tickets ni chats. Nunca imprime
// teléfonos ni datos clínicos (R2).
import { PrismaClient } from "@prisma/client";
import { normalizeMxPhoneToE164 } from "../packages/contracts/src/validators/phone";
import { normalizePersonName } from "../apps/api/src/modules/record-share/patient-identity-normalizer.util";

const SHOW_NAMES = process.argv.includes("--show-names");
const AS_JSON = process.argv.includes("--json");

interface PatientRow {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  birthDate: Date;
  phoneE164: string;
  userId: string | null;
  source: string;
  createdAt: Date;
  careRelationships: { doctorId: string; status: string }[];
}

interface DuplicateGroup {
  criterion: "telefono+fecha_nacimiento" | "nombre+fecha_nacimiento";
  birthDate: string;
  patients: {
    id: string;
    medicfyId: string;
    name?: string;
    source: string;
    hasAccount: boolean;
    createdAt: string;
    doctorIds: string[];
  }[];
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fullName(row: PatientRow): string {
  return [row.firstName, row.lastNamePaternal, row.lastNameMaternal].filter(Boolean).join(" ");
}

// Devuelve [fecha de nacimiento, filas] por cada llave con más de una fila.
function groupBy(rows: PatientRow[], keyOf: (row: PatientRow) => string | null): [string, PatientRow[]][] {
  const groups = new Map<string, PatientRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return [...groups.values()]
    .filter((bucket) => bucket.length > 1)
    .map((bucket): [string, PatientRow[]] => [dateKey(bucket[0]?.birthDate ?? new Date(0)), bucket]);
}

function toGroup(criterion: DuplicateGroup["criterion"], bucket: PatientRow[], birthDate: string): DuplicateGroup {
  return {
    criterion,
    birthDate,
    patients: bucket.map((row) => ({
      id: row.id,
      medicfyId: row.medicfyId,
      ...(SHOW_NAMES ? { name: fullName(row) } : {}),
      source: row.source,
      hasAccount: row.userId !== null,
      createdAt: row.createdAt.toISOString(),
      doctorIds: [...new Set(row.careRelationships.map((cr) => cr.doctorId))],
    })),
  };
}

function printGroups(groups: DuplicateGroup[]): void {
  if (groups.length === 0) {
    console.info("No se encontraron posibles duplicados.");
    return;
  }
  groups.forEach((group, index) => {
    console.info(`\n#${index + 1}  criterio=${group.criterion}  fecha_nacimiento=${group.birthDate}`);
    for (const p of group.patients) {
      const name = p.name ? `  nombre="${p.name}"` : "";
      console.info(
        `  ${p.medicfyId}  id=${p.id}${name}  origen=${p.source}  cuenta=${p.hasAccount ? "sí" : "no"}  creado=${p.createdAt}  medicos=[${p.doctorIds.join(", ")}]`
      );
    }
  });
  console.info(`\nTotal: ${groups.length} grupos para revisar. Este script no modificó nada.`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL no está definida (usa --env-file=.env o expórtala antes de correr el script).");
  }
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const rows: PatientRow[] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return tx.patient.findMany({
        select: {
          id: true,
          medicfyId: true,
          firstName: true,
          lastNamePaternal: true,
          lastNameMaternal: true,
          birthDate: true,
          phoneE164: true,
          userId: true,
          source: true,
          createdAt: true,
          careRelationships: { select: { doctorId: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    });

    const byPhone = groupBy(rows, (row) => {
      // Compara normalizado aunque el script de normalización no se haya
      // corrido todavía; un teléfono que no se puede normalizar no agrupa.
      const phone = normalizeMxPhoneToE164(row.phoneE164);
      return phone ? `${phone}|${dateKey(row.birthDate)}` : null;
    }).map(([birthDate, bucket]) => toGroup("telefono+fecha_nacimiento", bucket, birthDate));

    const byName = groupBy(rows, (row) => `${normalizePersonName(fullName(row))}|${dateKey(row.birthDate)}`).map(([birthDate, bucket]) =>
      toGroup("nombre+fecha_nacimiento", bucket, birthDate)
    );

    const groups = [...byPhone, ...byName];
    if (AS_JSON) {
      console.info(JSON.stringify(groups, null, 2));
    } else {
      printGroups(groups);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
