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

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// M8-RN-014: "publica schemas para exactly these four en v1.0".
const SPECIALTIES = [
  { code: "GENERAL", nameEs: "Medicina General", cieGroup: null, requiresSpecialtyLicense: false },
  { code: "GINECOLOGIA_OBSTETRICIA", nameEs: "Ginecología y Obstetricia", cieGroup: null, requiresSpecialtyLicense: true },
  { code: "PEDIATRIA", nameEs: "Pediatría", cieGroup: null, requiresSpecialtyLicense: true },
  { code: "MEDICINA_INTERNA", nameEs: "Medicina Interna", cieGroup: null, requiresSpecialtyLicense: true },
];

// Núcleo clínico (M8/M9): catálogo público fijo (OMS/DOF), no una
// regla clínica de negocio — seguro de sembrar tal cual. Es un
// subconjunto pequeño de motivos de consulta comunes, suficiente para
// probar el flujo de punta a punta; importar el catálogo CIE-10
// completo queda pendiente de una fuente oficial (ver el plan).
const ICD10_CODES = [
  { code: "J00", description: "Rinofaringitis aguda (resfriado común)" },
  { code: "J02.9", description: "Faringitis aguda, no especificada" },
  { code: "J03.9", description: "Amigdalitis aguda, no especificada" },
  { code: "J06.9", description: "Infección aguda de las vías respiratorias superiores, no especificada" },
  { code: "A09", description: "Diarrea y gastroenteritis de presunto origen infeccioso" },
  { code: "K29.7", description: "Gastritis, no especificada" },
  { code: "I10", description: "Hipertensión esencial (primaria)" },
  { code: "E11", description: "Diabetes mellitus tipo 2" },
  { code: "E66.9", description: "Obesidad, no especificada" },
  { code: "M54.5", description: "Lumbago no especificado" },
  { code: "N39.0", description: "Infección de vías urinarias, sitio no especificado" },
  { code: "L23.9", description: "Dermatitis alérgica de contacto, de causa no especificada" },
  { code: "R51", description: "Cefalea" },
  { code: "R50.9", description: "Fiebre, no especificada" },
  { code: "Z00.0", description: "Examen médico general" },
];

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

  for (const icd10 of ICD10_CODES) {
    await prisma.icd10Code.upsert({
      where: { code: icd10.code },
      update: { description: icd10.description },
      create: icd10,
    });
  }
  console.log(`Seeded ${ICD10_CODES.length} ICD-10 codes.`);

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
