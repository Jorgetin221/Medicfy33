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
import * as argon2 from "argon2";
import cie10Dgis from "./data/cie10-dgis.json" with { type: "json" };

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// ADM-01/02: sin esto no había ninguna forma de llegar a
// /admin/verificacion por /login real — AdminGuard existía y
// admin-doctors.controller.ts funcionaba, pero solo era alcanzable
// firmando un JWT a mano en pruebas (hallazgo del pase de M2). R7:
// dato sintético, nunca producción — por eso el guard de abajo.
const SEED_ADMIN_EMAIL = "admin@medicfy.dev";
const SEED_ADMIN_PASSWORD = "Correcto-Caballo-Bateria-47!Grafito";

async function seedAdmin(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedAdmin() must not run in production — it creates an account with a known password.");
  }
  const passwordHash = await argon2.hash(SEED_ADMIN_PASSWORD, { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: { email: SEED_ADMIN_EMAIL, passwordHash, primaryRole: "ADMIN", status: "ACTIVE", emailVerifiedAt: new Date() },
  });
  // upsert por la unique compuesta (userId, role, scopeId) rechaza un
  // scopeId explícito en null (limitación conocida de Prisma con
  // claves compuestas que incluyen una columna nullable) — findFirst
  // + create condicional lo evita, y un seed no necesita atomicidad
  // real aquí (no hay escritura concurrente).
  const existingRole = await prisma.userRole.findFirst({ where: { userId: admin.id, role: "ADMIN" } });
  if (!existingRole) {
    await prisma.userRole.create({ data: { userId: admin.id, role: "ADMIN" } });
  }
  console.log(`Seeded ADMIN account: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD} (dev only, R7 — no reutilizar en producción).`);
}

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

// Motor de escalas (SpecialtyFieldSchema, sección ESCALAS): la
// infraestructura ya existía en el esquema desde M8-RN-014 sin una
// sola fila sembrada. Acotado a Glasgow y Apgar — son instrumentos
// universales, sin variación entre fuentes ni necesidad de licencia,
// a diferencia de Bishop o un score de riesgo cardiovascular con
// nombre propio, que quedan pendientes hasta tener una fuente única
// que citar. Valores de referencia sin modificar:
// - Glasgow Coma Scale: Teasdale G, Jennett B. "Assessment of coma
//   and impaired consciousness." Lancet. 1974;2(7872):81-84.
// - Apgar score: Apgar V. "A proposal for a new method of evaluation
//   of the newborn infant." Curr Res Anesth Analg. 1953;32(4):260-267.
const GLASGOW_OCULAR_OPTIONS = [
  { value: 4, label: "Espontánea (4)" },
  { value: 3, label: "Al habla (3)" },
  { value: 2, label: "Al dolor (2)" },
  { value: 1, label: "Sin respuesta (1)" },
];
const GLASGOW_VERBAL_OPTIONS = [
  { value: 5, label: "Orientado (5)" },
  { value: 4, label: "Confuso (4)" },
  { value: 3, label: "Palabras inapropiadas (3)" },
  { value: 2, label: "Sonidos incomprensibles (2)" },
  { value: 1, label: "Sin respuesta (1)" },
];
const GLASGOW_MOTORA_OPTIONS = [
  { value: 6, label: "Obedece órdenes (6)" },
  { value: 5, label: "Localiza el dolor (5)" },
  { value: 4, label: "Retira al dolor (4)" },
  { value: 3, label: "Flexión anormal — decorticación (3)" },
  { value: 2, label: "Extensión anormal — descerebración (2)" },
  { value: 1, label: "Sin respuesta (1)" },
];
const GLASGOW_INTERPRETATION = [
  { min: 13, max: 15, label: "Leve" },
  { min: 9, max: 12, label: "Moderado" },
  { min: 3, max: 8, label: "Severo" },
];
const APGAR_ITEM_OPTIONS = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
];
const APGAR_INTERPRETATION = [
  { min: 7, max: 10, label: "Normal" },
  { min: 4, max: 6, label: "Depresión moderada" },
  { min: 0, max: 3, label: "Depresión severa" },
];

const ESCALAS_VERSION = 1;
type EscalaFieldSeed = {
  fieldKey: string;
  label: string;
  inputType: "SELECT" | "COMPUTED";
  minValue?: number;
  maxValue?: number;
  options?: unknown;
  computedFormula?: string;
  displayOrder: number;
};
const ESCALAS_FIELDS: EscalaFieldSeed[] = [
  { fieldKey: "glasgow_ocular", label: "Apertura ocular", inputType: "SELECT", minValue: 1, maxValue: 4, options: GLASGOW_OCULAR_OPTIONS, displayOrder: 0 },
  { fieldKey: "glasgow_verbal", label: "Respuesta verbal", inputType: "SELECT", minValue: 1, maxValue: 5, options: GLASGOW_VERBAL_OPTIONS, displayOrder: 1 },
  { fieldKey: "glasgow_motora", label: "Respuesta motora", inputType: "SELECT", minValue: 1, maxValue: 6, options: GLASGOW_MOTORA_OPTIONS, displayOrder: 2 },
  {
    fieldKey: "glasgow_total",
    label: "Glasgow total",
    inputType: "COMPUTED",
    computedFormula: "glasgow_ocular glasgow_verbal glasgow_motora",
    options: GLASGOW_INTERPRETATION,
    displayOrder: 3,
  },
  ...(["1min", "5min"] as const).flatMap((momento, momentoIndex) => {
    const items: EscalaFieldSeed[] = [
      { fieldKey: `apgar_${momento}_apariencia`, label: `Apariencia (${momento})`, inputType: "SELECT", minValue: 0, maxValue: 2, options: APGAR_ITEM_OPTIONS, displayOrder: momentoIndex * 10 },
      { fieldKey: `apgar_${momento}_pulso`, label: `Pulso (${momento})`, inputType: "SELECT", minValue: 0, maxValue: 2, options: APGAR_ITEM_OPTIONS, displayOrder: momentoIndex * 10 + 1 },
      { fieldKey: `apgar_${momento}_gesticulacion`, label: `Gesticulación/irritabilidad refleja (${momento})`, inputType: "SELECT", minValue: 0, maxValue: 2, options: APGAR_ITEM_OPTIONS, displayOrder: momentoIndex * 10 + 2 },
      { fieldKey: `apgar_${momento}_actividad`, label: `Actividad/tono muscular (${momento})`, inputType: "SELECT", minValue: 0, maxValue: 2, options: APGAR_ITEM_OPTIONS, displayOrder: momentoIndex * 10 + 3 },
      { fieldKey: `apgar_${momento}_respiracion`, label: `Respiración (${momento})`, inputType: "SELECT", minValue: 0, maxValue: 2, options: APGAR_ITEM_OPTIONS, displayOrder: momentoIndex * 10 + 4 },
      {
        fieldKey: `apgar_total_${momento}`,
        label: `Apgar total (${momento})`,
        inputType: "COMPUTED",
        computedFormula: [`apariencia`, `pulso`, `gesticulacion`, `actividad`, `respiracion`].map((k) => `apgar_${momento}_${k}`).join(" "),
        options: APGAR_INTERPRETATION,
        displayOrder: momentoIndex * 10 + 5,
      },
    ];
    return items;
  }),
];

async function seedEscalas(): Promise<void> {
  for (const field of ESCALAS_FIELDS) {
    const existing = await prisma.specialtyFieldSchema.findFirst({
      where: { specialtyId: null, section: "ESCALAS", fieldKey: field.fieldKey, version: ESCALAS_VERSION },
    });
    const data = {
      specialtyId: null,
      section: "ESCALAS" as const,
      version: ESCALAS_VERSION,
      fieldKey: field.fieldKey,
      label: field.label,
      inputType: field.inputType,
      minValue: field.minValue ?? null,
      maxValue: field.maxValue ?? null,
      options: field.options ?? undefined,
      computedFormula: field.computedFormula ?? null,
      displayOrder: field.displayOrder,
      publishedAt: new Date(),
    };
    if (existing) {
      await prisma.specialtyFieldSchema.update({ where: { id: existing.id }, data });
    } else {
      await prisma.specialtyFieldSchema.create({ data });
    }
  }
  console.log(`Seeded ${ESCALAS_FIELDS.length} campos de escalas (Glasgow + Apgar).`);
}


// Prompt 9 / P4 §4.4: el clúster de respuestas negativas — la forma en
// que cuatro médicos distintos dicen "no hay nada que reportar" — es
// el grupo de duplicados más frecuente del sistema de referencia y no
// lo resuelve ningún normalizador de forma (no comparten raíz). Se
// siembra como UN término canónico del dominio ANTECEDENTE con las
// variantes conocidas como sinónimos curados: el chequeo de alta del
// catálogo (ClinicalCatalogService.create) los consulta, así que
// ninguna variante puede volver a nacer como término separado.
// El vocabulario de subtipos de antecedentes sigue siendo el enum
// cerrado de 30 valores de clinical.schema.ts — esto lo complementa,
// no lo sustituye.
async function seedCatalogoAntecedentes(): Promise<void> {
  const NEGATIVE_CLUSTER = {
    domain: "ANTECEDENTE",
    key: "negado",
    preferredTerm: "Negado",
    normalizedTerm: "negado",
    codingSystem: "PROPIETARIO",
    synonyms: ["Ninguno", "Ninguna", "Negados", "Negada", "SANO", "Sana", "Sin antecedentes"],
  };
  const existing = await prisma.clinicalCatalogTerm.findFirst({
    where: { domain: NEGATIVE_CLUSTER.domain, key: NEGATIVE_CLUSTER.key },
  });
  if (existing) {
    await prisma.clinicalCatalogTerm.update({
      where: { id: existing.id },
      data: { synonyms: NEGATIVE_CLUSTER.synonyms },
    });
  } else {
    await prisma.clinicalCatalogTerm.create({ data: NEGATIVE_CLUSTER });
  }
  console.log("Seeded catálogo ANTECEDENTE: término canónico 'Negado' + sinónimos del clúster negativo.");
}

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

  await seedEscalas();
  await seedCatalogoAntecedentes();
  await seedAdmin();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
