// Found missing while building Sprint 5c's doctor-registration screen
// (PUB-03): nothing in the repo reproducibly creates the specialty
// catalog. The 4 rows in this session's own medicfy_mvp_dev were
// inserted by hand at some earlier point and never captured — a
// fresh clone + fresh database would have an empty `specialties`
// table, and doctor registration (primarySpecialtyCode must resolve
// to a real row) would be broken out of the box. Idempotent
// (upsert on the unique `code`), safe to run repeatedly.
//
// Usage: pnpm db:seed
import { PrismaClient } from "@prisma/client";
import cie10Dgis from "./data/cie10-dgis.json" with { type: "json" };

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// M8-RN-014: "publica schemas para exactly these four en v1.0".
const SPECIALTIES = [
  { code: "GENERAL", nameEs: "Medicina General", cieGroup: null, requiresSpecialtyLicense: false },
  { code: "GINECOLOGIA_OBSTETRICIA", nameEs: "Ginecología y Obstetricia", cieGroup: null, requiresSpecialtyLicense: true },
  { code: "PEDIATRIA", nameEs: "Pediatría", cieGroup: null, requiresSpecialtyLicense: true },
  { code: "MEDICINA_INTERNA", nameEs: "Medicina Interna", cieGroup: null, requiresSpecialtyLicense: true },
];

// Catálogo CIE-10 completo y vigente — Secretaría de Salud (DGIS/
// CEMECE) vía datos.gob.mx, licencia CC-BY-4.0, descargado 2026-08-24:
// https://www.datos.gob.mx/dataset/catalogo_cie_10
// Estándar público fijo, no una regla clínica de negocio (ver
// Icd10Code en schema.prisma). Filtrado a VALID="SI" del catálogo de
// producción oficial (excluye rúbricas dadas de baja); reemplaza el
// subconjunto de 15 ejemplos que vivía aquí antes — para refrescarlo,
// sustituir data/cie10-dgis.json por una exportación más reciente de
// la misma fuente.
const ICD10_CODES: { code: string; description: string }[] = cie10Dgis;

// Catálogo sintético mínimo para probar el flujo de punta a punta
// (M9-RN-012 bloqueo de Grupo I/II incluido). Nombres genéricos y
// clasificación de grupo son datos públicos (Ley General de Salud
// art. 226); dosis/presentaciones aquí son de ejemplo, NO una
// indicación clínica real — ver el plan sobre no inventar contenido
// clínico. Poblar el Cuadro Básico completo queda pendiente.
const MEDICATIONS = [
  { genericName: "Paracetamol", brandNames: ["Tempra"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "N02BE01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ibuprofeno", brandNames: ["Motrin"], presentations: [{ label: "Tableta 400 mg" }], atcCode: "M01AE01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Amoxicilina", brandNames: ["Amoxil"], presentations: [{ label: "Cápsula 500 mg" }], atcCode: "J01CA04", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Losartán", brandNames: ["Cozaar"], presentations: [{ label: "Tableta 50 mg" }], atcCode: "C09CA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Metformina", brandNames: ["Glucophage"], presentations: [{ label: "Tableta 850 mg" }], atcCode: "A10BA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Omeprazol", brandNames: ["Losec"], presentations: [{ label: "Cápsula 20 mg" }], atcCode: "A02BC01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Loratadina", brandNames: ["Clarityne"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "R06AX13", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Diazepam", brandNames: ["Valium"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "N05BA01", controlGroup: "IV" as const, isElectronicallyPrescribable: true },
  { genericName: "Tramadol", brandNames: ["Tradol"], presentations: [{ label: "Cápsula 50 mg" }], atcCode: "N02AX02", controlGroup: "IV" as const, isElectronicallyPrescribable: true },
  // Grupo I — deliberadamente incluido para poder probar
  // PRESCRIPTION_CONTROLLED_BLOCKED de punta a punta (M9-CA-002).
  { genericName: "Morfina", brandNames: [], presentations: [{ label: "Solución inyectable 10 mg/mL" }], atcCode: "N02AA01", controlGroup: "I" as const, isElectronicallyPrescribable: false },
];

async function main(): Promise<void> {
  for (const specialty of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { code: specialty.code },
      update: { nameEs: specialty.nameEs, requiresSpecialtyLicense: specialty.requiresSpecialtyLicense },
      create: specialty,
    });
  }
  console.log(`Seeded ${SPECIALTIES.length} specialties.`);

  // createMany en lotes en vez de upsert por fila: son ~12,500
  // códigos y es un catálogo de referencia que casi nunca cambia —
  // no vale la pena pagar 12,500 round-trips secuenciales para poder
  // actualizar la descripción de un código que no cambió. Refrescar
  // el catálogo es reemplazar data/cie10-dgis.json y volver a sembrar.
  const ICD10_BATCH_SIZE = 2000;
  let icd10Inserted = 0;
  for (let i = 0; i < ICD10_CODES.length; i += ICD10_BATCH_SIZE) {
    const batch = ICD10_CODES.slice(i, i + ICD10_BATCH_SIZE);
    const result = await prisma.icd10Code.createMany({ data: batch, skipDuplicates: true });
    icd10Inserted += result.count;
  }
  console.log(`Seeded ${icd10Inserted} new ICD-10 codes (${ICD10_CODES.length} total in catalog).`);

  for (const medication of MEDICATIONS) {
    const existing = await prisma.medicationCatalog.findFirst({ where: { genericName: medication.genericName } });
    if (existing) {
      await prisma.medicationCatalog.update({ where: { id: existing.id }, data: medication });
    } else {
      await prisma.medicationCatalog.create({ data: medication });
    }
  }
  console.log(`Seeded ${MEDICATIONS.length} medications.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
