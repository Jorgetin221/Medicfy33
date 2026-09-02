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
import { normalizeTerm } from "../apps/api/src/modules/catalog/term-normalizer.util";
import GROWTH_LMS from "./data/growth-lms.json";
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

  // Ampliación del catálogo (2026-09-02) — a petición explícita del
  // usuario, tras el hallazgo de que 10 medicamentos de demostración
  // no alcanzan para uso real. Cubre las 4 especialidades piloto
  // (medicina general, ginecología y obstetricia, pediatría, medicina
  // interna). Solo medicamentos de identidad y clasificación bien
  // establecidas (Ley General de Salud art. 226) — nada en zona gris.
  // Igual que el resto del catálogo, PENDIENTE de validación médica
  // formal antes de producción (ver seedCatalogosPrompt9 arriba: la
  // base clínica real llega con licencia).

  // Analgésicos / antiinflamatorios (Grupo VI)
  { genericName: "Naproxeno", brandNames: ["Flanax"], presentations: [{ label: "Tableta 250 mg" }], atcCode: "M01AE02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Diclofenaco", brandNames: ["Voltaren"], presentations: [{ label: "Tableta 100 mg" }], atcCode: "M01AB05", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ketorolaco", brandNames: ["Dolac"], presentations: [{ label: "Ampolleta 30 mg/mL" }], atcCode: "M01AB15", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Metamizol sódico", brandNames: ["Neo-Melubrina"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "N02BB02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ácido acetilsalicílico", brandNames: ["Aspirina"], presentations: [{ label: "Tableta 100 mg" }], atcCode: "N02BA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Prednisona", brandNames: ["Meticorten"], presentations: [{ label: "Tableta 5 mg" }], atcCode: "H02AB07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Antibióticos (Grupo VI)
  { genericName: "Azitromicina", brandNames: ["Zithromax"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "J01FA10", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ciprofloxacino", brandNames: ["Ciproxina"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "J01MA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Trimetoprim/Sulfametoxazol", brandNames: ["Bactrim"], presentations: [{ label: "Tableta 800/160 mg" }], atcCode: "J01EE01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Cefalexina", brandNames: ["Keflex"], presentations: [{ label: "Cápsula 500 mg" }], atcCode: "J01DB01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Clindamicina", brandNames: ["Dalacin"], presentations: [{ label: "Cápsula 300 mg" }], atcCode: "J01FF01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Doxiciclina", brandNames: ["Vibramicina"], presentations: [{ label: "Cápsula 100 mg" }], atcCode: "J01AA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Nitrofurantoína", brandNames: ["Macrodantina"], presentations: [{ label: "Cápsula 100 mg" }], atcCode: "J01XE01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Penicilina G benzatínica", brandNames: ["Benzetacil"], presentations: [{ label: "Ampolleta 1,200,000 U" }], atcCode: "J01CE08", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Metronidazol", brandNames: ["Flagyl"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "J01XD01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Claritromicina", brandNames: ["Klaricid"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "J01FA09", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Amoxicilina/Ácido clavulánico", brandNames: ["Clavulin"], presentations: [{ label: "Tableta 875/125 mg" }], atcCode: "J01CR02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Cardiovascular (Grupo VI)
  { genericName: "Enalapril", brandNames: ["Renitec"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "C09AA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Amlodipino", brandNames: ["Norvasc"], presentations: [{ label: "Tableta 5 mg" }], atcCode: "C08CA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Metoprolol", brandNames: ["Lopresor"], presentations: [{ label: "Tableta 100 mg" }], atcCode: "C07AB02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Hidroclorotiazida", brandNames: ["Microzide"], presentations: [{ label: "Tableta 25 mg" }], atcCode: "C03AA03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Atorvastatina", brandNames: ["Lipitor"], presentations: [{ label: "Tableta 20 mg" }], atcCode: "C10AA05", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Furosemida", brandNames: ["Lasix"], presentations: [{ label: "Tableta 40 mg" }], atcCode: "C03CA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Espironolactona", brandNames: ["Aldactone"], presentations: [{ label: "Tableta 25 mg" }], atcCode: "C03DA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Clopidogrel", brandNames: ["Plavix"], presentations: [{ label: "Tableta 75 mg" }], atcCode: "B01AC04", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Warfarina", brandNames: ["Coumadin"], presentations: [{ label: "Tableta 5 mg" }], atcCode: "B01AA03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Diabetes / endocrino (Grupo VI)
  { genericName: "Glibenclamida", brandNames: ["Daonil"], presentations: [{ label: "Tableta 5 mg" }], atcCode: "A10BB01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Insulina NPH", brandNames: ["Humulin N"], presentations: [{ label: "Suspensión inyectable 100 UI/mL" }], atcCode: "A10AC01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Insulina glargina", brandNames: ["Lantus"], presentations: [{ label: "Solución inyectable 100 UI/mL" }], atcCode: "A10AE04", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Levotiroxina", brandNames: ["Synthroid"], presentations: [{ label: "Tableta 100 mcg" }], atcCode: "H03AA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Gastrointestinal (Grupo VI)
  { genericName: "Pantoprazol", brandNames: ["Pantozol"], presentations: [{ label: "Tableta 40 mg" }], atcCode: "A02BC02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Butilhioscina", brandNames: ["Buscapina"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "A03BB01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Metoclopramida", brandNames: ["Plasil"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "A03FA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Loperamida", brandNames: ["Imodium"], presentations: [{ label: "Cápsula 2 mg" }], atcCode: "A07DA03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Simeticona", brandNames: ["Flatoril"], presentations: [{ label: "Tableta 125 mg" }], atcCode: "A03AX13", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Respiratorio / alergia (Grupo VI)
  { genericName: "Salbutamol", brandNames: ["Ventolin"], presentations: [{ label: "Inhalador 100 mcg/dosis" }], atcCode: "R03AC02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Budesonida", brandNames: ["Pulmicort"], presentations: [{ label: "Inhalador 200 mcg/dosis" }], atcCode: "R03BA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Cetirizina", brandNames: ["Zyrtec"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "R06AE07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ambroxol", brandNames: ["Mucosolvan"], presentations: [{ label: "Jarabe 15 mg/5mL" }], atcCode: "R05CB06", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Dimenhidrinato", brandNames: ["Dramamine"], presentations: [{ label: "Tableta 50 mg" }], atcCode: "R06AA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Ginecología y obstetricia (Grupo VI)
  { genericName: "Ácido fólico", brandNames: [], presentations: [{ label: "Tableta 5 mg" }], atcCode: "B03BB01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Sulfato ferroso", brandNames: ["Ferrifol"], presentations: [{ label: "Tableta 200 mg" }], atcCode: "B03AA07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Progesterona micronizada", brandNames: ["Utrogestan"], presentations: [{ label: "Cápsula 200 mg" }], atcCode: "G03DA04", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Nifedipino", brandNames: ["Adalat"], presentations: [{ label: "Tableta 30 mg" }], atcCode: "C08CA05", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Etinilestradiol/Levonorgestrel", brandNames: ["Microgynon"], presentations: [{ label: "Tableta 0.03/0.15 mg" }], atcCode: "G03AA07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Clotrimazol", brandNames: ["Canesten"], presentations: [{ label: "Óvulo vaginal 100 mg" }], atcCode: "G01AF02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Oxitocina", brandNames: ["Syntocinon"], presentations: [{ label: "Ampolleta 10 UI/mL" }], atcCode: "H01BB02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Psiquiatría / neurología no controlados (Grupo VI)
  { genericName: "Sertralina", brandNames: ["Zoloft"], presentations: [{ label: "Tableta 50 mg" }], atcCode: "N06AB06", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Fluoxetina", brandNames: ["Prozac"], presentations: [{ label: "Cápsula 20 mg" }], atcCode: "N06AB03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Levetiracetam", brandNames: ["Keppra"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "N03AX14", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Controlados adicionales — mismo criterio que Diazepam/Tramadol/
  // Morfina ya sembrados: clasificación bien establecida, sin zona
  // gris, para que R5 siga probado también en Grupo II (no solo I/IV).
  { genericName: "Clonazepam", brandNames: ["Rivotril"], presentations: [{ label: "Tableta 2 mg" }], atcCode: "N03AE01", controlGroup: "IV" as const, isElectronicallyPrescribable: true },
  { genericName: "Alprazolam", brandNames: ["Tafil"], presentations: [{ label: "Tableta 0.5 mg" }], atcCode: "N05BA12", controlGroup: "IV" as const, isElectronicallyPrescribable: true },
  { genericName: "Metilfenidato", brandNames: ["Ritalin"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "N06BA04", controlGroup: "II" as const, isElectronicallyPrescribable: false },
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


// Prompt 9 — "Poblar los catálogos iniciales", con estas decisiones:
// - FUENTES: cada dominio declara abajo de dónde sale. Los que vienen
//   de una lista oficial (INEGI) o de la propia especificación entran
//   sin marca; los que son listas estándar razonables pero NO
//   revisadas por Jorge entran con pendingMedicalReview=true, como el
//   prompt exige ("marca los términos que necesitan validación de un
//   médico antes de darse por buenos").
// - SNOMED CT (decisión 🔒 del prompt 9): mientras Jorge no decida
//   licenciar, TODO es codingSystem "PROPIETARIO" — catálogo propio.
// - DIFERIDOS (sin fuente estándar razonable a la mano, se declara en
//   vez de inventar): ocupaciones (SINCO es enorme), aseguradoras,
//   estudios en dos niveles y motivos de solicitud (llegan con la
//   Fase 4/5, que es donde se consumen).
type SeedTerm = { key: string; term: string; synonyms?: string[] };
async function seedDomain(domain: string, source: string, review: boolean, terms: SeedTerm[]): Promise<void> {
  let inserted = 0;
  for (const t of terms) {
    const existing = await prisma.clinicalCatalogTerm.findFirst({ where: { domain, key: t.key } });
    if (existing) continue;
    await prisma.clinicalCatalogTerm.create({
      data: {
        domain,
        key: t.key,
        preferredTerm: t.term,
        normalizedTerm: normalizeTerm(t.term),
        codingSystem: "PROPIETARIO",
        synonyms: t.synonyms ?? [],
        pendingMedicalReview: review,
      },
    });
    inserted += 1;
  }
  console.log(`Seeded ${domain}: +${inserted}/${terms.length} (fuente: ${source}${review ? "; PENDIENTE de validación médica" : ""}).`);
}

async function seedCatalogosPrompt9(): Promise<void> {
  // ANTECEDENTE — fuente: la propia especificación (los 30 subtipos de
  // §10 ya transcritos como enum cerrado en contracts). Sin invención.
  await seedDomain("ANTECEDENTE", "especificación §10 (enum de 30 subtipos)", false, [
    { key: "estado_vital", term: "Estado vital de familiares" },
    { key: "diabetes", term: "Diabetes" },
    { key: "hipertension", term: "Hipertensión arterial" },
    { key: "cardiopatia_evento_vascular", term: "Cardiopatía o evento vascular" },
    { key: "cancer", term: "Cáncer" },
    { key: "enfermedad_renal", term: "Enfermedad renal" },
    { key: "enfermedad_hereditaria_congenita", term: "Enfermedad hereditaria o congénita" },
    { key: "trastorno_neurologico_psiquiatrico", term: "Trastorno neurológico o psiquiátrico" },
    { key: "enfermedad_autoinmune", term: "Enfermedad autoinmune" },
    { key: "vivienda_servicios", term: "Vivienda y servicios" },
    { key: "alimentacion_hidratacion", term: "Alimentación e hidratación" },
    { key: "higiene", term: "Higiene" },
    { key: "actividad_fisica", term: "Actividad física" },
    { key: "sueno", term: "Sueño" },
    { key: "ocupacion_exposiciones", term: "Ocupación y exposiciones" },
    { key: "viajes_relevantes", term: "Viajes relevantes" },
    { key: "tabaquismo", term: "Tabaquismo" },
    { key: "alcohol", term: "Consumo de alcohol" },
    { key: "otras_sustancias", term: "Otras sustancias" },
    { key: "vacunacion", term: "Vacunación" },
    { key: "animales_vectores_riesgos", term: "Animales, vectores y riesgos" },
    { key: "enfermedades_previas_activas", term: "Enfermedades previas y activas" },
    { key: "hospitalizaciones", term: "Hospitalizaciones" },
    { key: "cirugias", term: "Cirugías" },
    { key: "traumatismos", term: "Traumatismos" },
    { key: "transfusiones", term: "Transfusiones" },
    { key: "enfermedades_infecciosas_relevantes", term: "Enfermedades infecciosas relevantes" },
    { key: "discapacidad_apoyos", term: "Discapacidad y apoyos" },
    { key: "salud_mental", term: "Salud mental" },
  ]);

  // ALERGIA_AGENTE — lista estándar de agentes comunes y grupos de
  // fármacos; NECESITA validación médica de Jorge.
  await seedDomain("ALERGIA_AGENTE", "lista estándar de agentes comunes", true, [
    { key: "penicilinas", term: "Penicilinas", synonyms: ["Penicilina", "Amoxicilina (grupo)"] },
    { key: "sulfonamidas", term: "Sulfonamidas", synonyms: ["Sulfas"] },
    { key: "aines", term: "AINEs", synonyms: ["Antiinflamatorios no esteroideos"] },
    { key: "acido_acetilsalicilico", term: "Ácido acetilsalicílico", synonyms: ["Aspirina"] },
    { key: "anestesicos_locales", term: "Anestésicos locales" },
    { key: "medio_contraste_yodado", term: "Medio de contraste yodado" },
    { key: "latex", term: "Látex" },
    { key: "mariscos", term: "Mariscos" },
    { key: "pescado", term: "Pescado" },
    { key: "huevo", term: "Huevo" },
    { key: "leche_vaca", term: "Proteína de leche de vaca" },
    { key: "cacahuate", term: "Cacahuate", synonyms: ["Maní"] },
    { key: "nueces_arbol", term: "Nueces de árbol" },
    { key: "soya", term: "Soya" },
    { key: "trigo_gluten", term: "Trigo" },
    { key: "picadura_himenopteros", term: "Picadura de himenópteros", synonyms: ["Abejas", "Avispas"] },
    { key: "polen", term: "Polen" },
    { key: "acaros", term: "Ácaros del polvo" },
    { key: "epitelio_animales", term: "Epitelio de animales" },
    { key: "moho", term: "Moho" },
  ]);

  // SUSTANCIA_PSICOACTIVA — categorías estándar tipo NIDA; validación
  // médica pendiente.
  await seedDomain("SUSTANCIA_PSICOACTIVA", "categorías estándar tipo NIDA", true, [
    { key: "tabaco", term: "Tabaco", synonyms: ["Cigarros", "Nicotina"] },
    { key: "alcohol", term: "Alcohol" },
    { key: "cannabis", term: "Cannabis", synonyms: ["Marihuana"] },
    { key: "cocaina", term: "Cocaína" },
    { key: "metanfetaminas", term: "Metanfetaminas", synonyms: ["Cristal"] },
    { key: "heroina", term: "Heroína" },
    { key: "opioides_prescripcion", term: "Opioides de prescripción" },
    { key: "benzodiacepinas", term: "Benzodiacepinas" },
    { key: "inhalantes", term: "Inhalantes" },
    { key: "alucinogenos", term: "Alucinógenos" },
    { key: "mdma", term: "MDMA", synonyms: ["Éxtasis"] },
    { key: "esteroides_anabolicos", term: "Esteroides anabólicos" },
  ]);

  // VIA_ADMINISTRACION — el mismo vocabulario cerrado del contrato
  // (P4 §2.8: "catálogo cerrado en cualquier estándar del mundo").
  await seedDomain("VIA_ADMINISTRACION", "estándar farmacológico (contrato ADMINISTRATION_ROUTES)", false, [
    { key: "vo", term: "Vía oral", synonyms: ["VO", "Oral"] },
    { key: "iv", term: "Intravenosa", synonyms: ["IV"] },
    { key: "im", term: "Intramuscular", synonyms: ["IM"] },
    { key: "sc", term: "Subcutánea", synonyms: ["SC"] },
    { key: "topica", term: "Tópica" },
    { key: "oftalmica", term: "Oftálmica" },
    { key: "otica", term: "Ótica" },
    { key: "rectal", term: "Rectal" },
    { key: "inhalada", term: "Inhalada" },
    { key: "sublingual", term: "Sublingual" },
  ]);

  // ENTIDAD_FEDERATIVA — fuente oficial: catálogo INEGI de 32 entidades.
  const entidades = ["Aguascalientes","Baja California","Baja California Sur","Campeche","Coahuila","Colima","Chiapas","Chihuahua","Ciudad de México","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas"];
  await seedDomain("ENTIDAD_FEDERATIVA", "INEGI (32 entidades)", false,
    entidades.map((e) => ({ key: normalizeTerm(e).replace(/ /g, "_"), term: e }))
  );

  // ESTADO_CIVIL — categorías INEGI.
  await seedDomain("ESTADO_CIVIL", "INEGI", false, [
    { key: "soltero", term: "Soltero(a)" },
    { key: "casado", term: "Casado(a)" },
    { key: "union_libre", term: "Unión libre" },
    { key: "separado", term: "Separado(a)" },
    { key: "divorciado", term: "Divorciado(a)" },
    { key: "viudo", term: "Viudo(a)" },
  ]);

  // TIPO_NOTA — clases de nota de NOM-004, con clave corta; la lista
  // exacta del MVP necesita el visto de Jorge.
  await seedDomain("TIPO_NOTA", "NOM-004 (clases de nota)", true, [
    { key: "hc", term: "Historia clínica" },
    { key: "ne", term: "Nota de evolución" },
    { key: "ic", term: "Nota de interconsulta" },
    { key: "ref", term: "Nota de referencia/traslado" },
    { key: "urg", term: "Nota de urgencias" },
  ]);

  // TIPO_DOCUMENTO — los dos que el prompt nombra + los operativos del
  // expediente; validación pendiente.
  await seedDomain("TIPO_DOCUMENTO", "prompt 9 + operación del expediente", true, [
    { key: "aviso_privacidad", term: "Aviso de privacidad" },
    { key: "consentimiento_informado", term: "Consentimiento informado" },
    { key: "identificacion", term: "Identificación oficial" },
    { key: "resultado_externo", term: "Resultado de estudio externo" },
    { key: "receta_externa", term: "Receta física externa" },
    { key: "otro", term: "Otro documento" },
  ]);
}


// Prompt 27/30 — referencias LMS de crecimiento. Fuente: OMS Child
// Growth Standards 2006 (0-60 meses) y CDC Growth Charts 2000
// (24-240 meses), tal como las redistribuye pygrowup 0.8.2. Verificado
// contra la mediana OMS publicada (niños, 12 meses: 9.6479 kg → P50).
async function seedGrowthReferences(): Promise<void> {
  const existing = await prisma.growthReference.count();
  if (existing >= (GROWTH_LMS as unknown[]).length) {
    console.log(`Growth references ya sembradas (${existing}).`);
    return;
  }
  const rows = GROWTH_LMS as { sex: string; measure: string; ageMonths: number; l: number; m: number; s: number; source: string }[];
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const result = await prisma.growthReference.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
    inserted += result.count;
  }
  console.log(`Seeded ${inserted} referencias LMS de crecimiento (OMS 2006 + CDC 2000).`);
}


// Prompt 29 — escalas adicionales, definidas como DATOS (alta sin
// desplegar código). Fuentes:
// - EVA (escala visual análoga de dolor 0-10): instrumento estándar
//   universal; cortes de interpretación de uso común (0 sin dolor,
//   1-3 leve, 4-6 moderado, 7-10 intenso). PENDIENTE de validación
//   médica de Jorge como todo lo clínico sembrado.
// - Bishop: Bishop EH, Obstet Gynecol 1964 — dilatación/borramiento/
//   altura de la presentación (0-3), consistencia/posición (0-2);
//   interpretación ≥8 favorable, 6-7 intermedio, ≤5 desfavorable.
// - RIESGO CARDIOVASCULAR: PENDIENTE — Framingham/Globorisk requieren
//   coeficientes publicados exactos que no se reproducen de memoria;
//   se declara en vez de inventarse (regla del propio prompt 29).
const EVA_INTERPRETATION = [
  { min: 0, max: 0, label: "Sin dolor" },
  { min: 1, max: 3, label: "Dolor leve" },
  { min: 4, max: 6, label: "Dolor moderado" },
  { min: 7, max: 10, label: "Dolor intenso" },
];
const BISHOP_0_3 = [0, 1, 2, 3].map((v) => ({ value: v, label: String(v) }));
const BISHOP_0_2 = [0, 1, 2].map((v) => ({ value: v, label: String(v) }));
const BISHOP_INTERPRETATION = [
  { min: 8, max: 13, label: "Cérvix favorable" },
  { min: 6, max: 7, label: "Intermedio" },
  { min: 0, max: 5, label: "Desfavorable" },
];
const ESCALAS_FASE3: EscalaFieldSeed[] = [
  { fieldKey: "eva_dolor", label: "Dolor (EVA 0-10)", inputType: "NUMBER", minValue: 0, maxValue: 10, displayOrder: 100 },
  { fieldKey: "eva_total", label: "EVA — interpretación", inputType: "COMPUTED", computedFormula: "eva_dolor", options: EVA_INTERPRETATION, displayOrder: 101 },
  { fieldKey: "bishop_dilatacion", label: "Dilatación (Bishop)", inputType: "SELECT", minValue: 0, maxValue: 3, options: BISHOP_0_3, displayOrder: 110 },
  { fieldKey: "bishop_borramiento", label: "Borramiento (Bishop)", inputType: "SELECT", minValue: 0, maxValue: 3, options: BISHOP_0_3, displayOrder: 111 },
  { fieldKey: "bishop_altura", label: "Altura de la presentación (Bishop)", inputType: "SELECT", minValue: 0, maxValue: 3, options: BISHOP_0_3, displayOrder: 112 },
  { fieldKey: "bishop_consistencia", label: "Consistencia (Bishop)", inputType: "SELECT", minValue: 0, maxValue: 2, options: BISHOP_0_2, displayOrder: 113 },
  { fieldKey: "bishop_posicion", label: "Posición (Bishop)", inputType: "SELECT", minValue: 0, maxValue: 2, options: BISHOP_0_2, displayOrder: 114 },
  {
    fieldKey: "bishop_total",
    label: "Bishop total",
    inputType: "COMPUTED",
    computedFormula: "bishop_dilatacion bishop_borramiento bishop_altura bishop_consistencia bishop_posicion",
    options: BISHOP_INTERPRETATION,
    displayOrder: 115,
  },
];

async function seedEscalasFase3(): Promise<void> {
  let inserted = 0;
  for (const field of ESCALAS_FASE3) {
    const existing = await prisma.specialtyFieldSchema.findFirst({ where: { section: "ESCALAS", fieldKey: field.fieldKey, version: 1 } });
    if (existing) continue;
    await prisma.specialtyFieldSchema.create({
      data: {
        specialtyId: null,
        version: 1,
        section: "ESCALAS",
        fieldKey: field.fieldKey,
        label: field.label,
        inputType: field.inputType,
        minValue: field.minValue ?? null,
        maxValue: field.maxValue ?? null,
        options: field.options === undefined ? undefined : (field.options as object),
        computedFormula: field.computedFormula ?? null,
        displayOrder: field.displayOrder,
        publishedAt: new Date(),
      },
    });
    inserted += 1;
  }
  console.log(`Seeded ${inserted} campos de escalas Fase 3 (EVA + Bishop). PENDIENTE declarado: riesgo cardiovascular (coeficientes publicados requeridos, no se inventan).`);
}


// Prompt 37A — estudios en dos niveles y motivos de solicitud. El
// vínculo estudio→tipo viaja en externalCode del término (documentado
// también en el schema). Listas clínicas comunes PENDIENTES de
// validación médica, como todo lo clínico sembrado.
async function seedEstudiosFase4(): Promise<void> {
  await seedDomain("TIPO_ESTUDIO", "operación clínica común", true, [
    { key: "laboratorio", term: "Laboratorio" },
    { key: "imagen", term: "Imagenología" },
    { key: "gabinete", term: "Gabinete" },
  ]);
  await seedDomain("MOTIVO_ESTUDIO", "operación clínica común", true, [
    { key: "diagnostico_inicial", term: "Diagnóstico inicial" },
    { key: "control_seguimiento", term: "Control / seguimiento" },
    { key: "tamizaje", term: "Tamizaje" },
    { key: "preoperatorio", term: "Valoración preoperatoria" },
    { key: "urgencia", term: "Urgencia" },
  ]);
  // Estudios concretos, con su tipo en externalCode.
  const estudios: { key: string; term: string; tipo: string; synonyms?: string[] }[] = [
    { key: "bh", term: "Biometría hemática completa", tipo: "laboratorio", synonyms: ["BH", "BHC", "Citometría hemática"] },
    { key: "qs6", term: "Química sanguínea de 6 elementos", tipo: "laboratorio", synonyms: ["QS", "QS6"] },
    { key: "ego", term: "Examen general de orina", tipo: "laboratorio", synonyms: ["EGO"] },
    { key: "perfil_lipidico", term: "Perfil de lípidos", tipo: "laboratorio" },
    { key: "hba1c", term: "Hemoglobina glucosilada (HbA1c)", tipo: "laboratorio" },
    { key: "tsh", term: "Perfil tiroideo (TSH)", tipo: "laboratorio" },
    { key: "tele_torax", term: "Telerradiografía de tórax", tipo: "imagen", synonyms: ["Tele de tórax"] },
    { key: "usg_abdominal", term: "Ultrasonido abdominal", tipo: "imagen", synonyms: ["USG abdominal"] },
    { key: "ecg", term: "Electrocardiograma de reposo", tipo: "gabinete", synonyms: ["ECG", "EKG"] },
  ];
  let inserted = 0;
  for (const e of estudios) {
    const existing = await prisma.clinicalCatalogTerm.findFirst({ where: { domain: "ESTUDIO_LABORATORIO", key: e.key } });
    if (existing) continue;
    await prisma.clinicalCatalogTerm.create({
      data: {
        domain: "ESTUDIO_LABORATORIO",
        key: e.key,
        preferredTerm: e.term,
        normalizedTerm: normalizeTerm(e.term),
        codingSystem: "PROPIETARIO",
        externalCode: e.tipo,
        synonyms: e.synonyms ?? [],
        pendingMedicalReview: true,
      },
    });
    inserted += 1;
  }
  console.log(`Seeded ESTUDIO_LABORATORIO: +${inserted}/${estudios.length} (dos niveles vía externalCode; PENDIENTE de validación médica).`);
}

// Fase 6 · Prompt 44B — motivo administrativo de cancelación de una
// nota firmada. Nunca clínico (no es diagnóstico ni tratamiento), por
// eso pendingMedicalReview=false — son categorías de trámite, mismo
// criterio ya usado para VIA_ADMINISTRACION/ESTADO_CIVIL.
async function seedFase6(): Promise<void> {
  await seedDomain("MOTIVO_CANCELACION_NOTA", "operación clínica común", false, [
    { key: "error_captura", term: "Error de captura" },
    { key: "nota_duplicada", term: "Nota duplicada" },
    { key: "paciente_equivocado", term: "Paciente equivocado" },
    { key: "otro", term: "Otro" },
  ]);
}

// Fase 7 · Prompt 48A — PENDIENTE(jorge): el control prenatal (ej.
// NOM-007-SSA2) y el esquema de vacunación (Cartilla Nacional de
// Vacunación) NO se siembran aquí — ninguna fuente fue verificada en
// esta sesión (CLAUDE.md §7: no inventar un calendario clínico).
// Este protocolo es SOLO para probar el motor genérico de extremo a
// extremo (prompt 47) — sourceCitation queda null a propósito, y el
// nombre lo marca como no clínico.
async function seedFase7(): Promise<void> {
  const existing = await prisma.treatmentProtocol.findFirst({ where: { name: "Protocolo de seguimiento — DEMOSTRACIÓN" } });
  if (existing) {
    console.log("Protocolo de demostración (Fase 7) ya sembrado.");
    return;
  }
  const generalSpecialty = await prisma.specialty.findFirst({ where: { code: "GENERAL" } });
  const protocol = await prisma.treatmentProtocol.create({
    data: {
      name: "Protocolo de seguimiento — DEMOSTRACIÓN",
      specialtyId: generalSpecialty?.id ?? null,
      version: 1,
      isActive: true,
      sourceCitation: null,
      sessionTemplates: {
        create: [
          { sequenceNumber: 1, label: "Sesión 1 — basal", windowStartOffsetDays: 0, windowEndOffsetDays: 3 },
          { sequenceNumber: 2, label: "Sesión 2 — seguimiento a 2 semanas", windowStartOffsetDays: 10, windowEndOffsetDays: 17 },
          { sequenceNumber: 3, label: "Sesión 3 — cierre a 6 semanas", windowStartOffsetDays: 38, windowEndOffsetDays: 45 },
        ],
      },
      fieldSchemas: {
        create: [
          { version: 1, fieldKey: "peso_kg", label: "Peso", inputType: "NUMBER", unit: "kg", minValue: 0, maxValue: 300, isRequired: true, displayOrder: 1 },
          { version: 1, fieldKey: "tolerancia", label: "Tolerancia", inputType: "SELECT", options: ["Buena", "Regular", "Mala"], isRequired: false, displayOrder: 2 },
        ],
      },
    },
  });
  console.log(
    `Seeded protocolo de demostración (Fase 7): ${protocol.id} — sin fuente clínica real. PENDIENTE de fuente verificada para control prenatal y esquema de vacunación.`
  );
}

// Prompt 35 — 🔒 PENDIENTE DE LICENCIA (prompt 33): estos DOS pares
// son un set de DEMOSTRACIÓN del motor, elegidos por ser interacciones
// clásicas y verificables — Tramadol+Diazepam (opioide+benzodiacepina:
// depresión aditiva del SNC; advertencia de caja de la FDA, 2016) e
// Ibuprofeno+Losartán (AINE reduce el efecto antihipertensivo de los
// ARA-II y suma riesgo renal; interacción estándar de la literatura).
// La base clínica real llega con la licencia. pendingMedicalReview=true.
async function seedInteraccionesDemo(): Promise<void> {
  const byName = async (name: string) => prisma.medicationCatalog.findFirst({ where: { genericName: name } });
  const pairs: { a: string; b: string; severity: "GRAVE" | "MODERADA"; description: string; source: string }[] = [
    {
      a: "Tramadol",
      b: "Diazepam",
      severity: "GRAVE",
      description: "Opioide + benzodiacepina: depresión respiratoria y sedación aditivas.",
      source: "FDA boxed warning opioides+BZD (2016) — PAR DE DEMOSTRACIÓN, pendiente base licenciada",
    },
    {
      a: "Ibuprofeno",
      b: "Losartán",
      severity: "MODERADA",
      description: "AINE reduce el efecto antihipertensivo del ARA-II y aumenta riesgo de deterioro renal.",
      source: "Interacción estándar AINE+ARA-II — PAR DE DEMOSTRACIÓN, pendiente base licenciada",
    },
  ];
  let inserted = 0;
  for (const pair of pairs) {
    const [a, b] = await Promise.all([byName(pair.a), byName(pair.b)]);
    if (!a || !b) continue;
    const existing = await prisma.medicationInteraction.findFirst({
      where: { OR: [{ medicationAId: a.id, medicationBId: b.id }, { medicationAId: b.id, medicationBId: a.id }] },
    });
    if (existing) continue;
    await prisma.medicationInteraction.create({
      data: { medicationAId: a.id, medicationBId: b.id, severity: pair.severity, description: pair.description, source: pair.source },
    });
    inserted += 1;
  }
  console.log(`Seeded ${inserted} interacciones de DEMOSTRACIÓN (motor listo; datos reales con la base licenciada 🔒).`);
}

// Fase 8 · Prompt 52 — banderas-rojas-medicfy.md, documento clínico
// del médico responsable (2026-09-02), fundamentado en PALS, Sepsis-3/
// qSOFA, ESI, GPC CENETEC. pendingMedicalReview=true en TODO el
// dominio: la sección 4 del documento ("checklist de aprobación")
// deja la lista final todavía como decisión abierta del médico
// responsable, aunque cada término ya viene sourceado. Los keys AQUÍ
// deben coincidir EXACTAMENTE con SYMPTOM_FLAG_MAP en
// apps/api/src/common/red-flag-detector.util.ts — un key sin match en
// ese mapa se ignora en silencio (no dispara nada), así que un typo
// aquí no rompe el build, solo apaga una bandera sin avisar.
//
// 2.8 (salud mental) SÍ se siembra — el propio documento pide
// "confirmar que cada síntoma 🔴 tenga su término en catálogo" — pero
// el detector la EXCLUYE a propósito de disparar una alerta simple.
async function seedBanderasRojas(): Promise<void> {
  await seedDomain("BANDERA_ROJA_SINTOMA", "banderas-rojas-medicfy.md (médico responsable, 2026-09-02)", true, [
    // 2.1 Cardiovascular
    { key: "cv_dolor_toracico_opresivo", term: "Dolor torácico opresivo o retroesternal" },
    { key: "cv_dolor_toracico_irradiado", term: "Dolor torácico irradiado a brazo, mandíbula, cuello o espalda" },
    { key: "cv_sincope", term: "Síncope o pérdida transitoria de la conciencia" },
    { key: "cv_palpitaciones_con_dolor_disnea", term: "Palpitaciones con dolor torácico o disnea asociada" },
    // 2.2 Respiratorio
    { key: "resp_disnea_subita_reposo", term: "Disnea súbita o dificultad respiratoria en reposo" },
    { key: "resp_estridor", term: "Estridor" },
    { key: "resp_cianosis", term: "Cianosis" },
    { key: "resp_hemoptisis", term: "Hemoptisis" },
    // 2.3 Neurológico
    { key: "neuro_deficit_focal_subito", term: "Déficit neurológico focal súbito", synonyms: ["Debilidad o asimetría facial súbita", "Disartria súbita", "Afasia súbita"] },
    { key: "neuro_cefalea_subita_intensa", term: "Cefalea súbita e intensa, de máxima intensidad" },
    { key: "neuro_alteracion_conciencia_aguda", term: "Alteración aguda del estado de conciencia o confusión de inicio reciente" },
    { key: "neuro_convulsion_activa_o_primera", term: "Convulsión activa o primera convulsión" },
    { key: "neuro_rigidez_nuca_fiebre", term: "Rigidez de nuca con fiebre" },
    // 2.4 Abdominal / Gastrointestinal
    { key: "gi_dolor_abdominal_intenso_subito", term: "Dolor abdominal intenso y súbito" },
    { key: "gi_irritacion_peritoneal", term: "Signos de irritación peritoneal", synonyms: ["Abdomen en tabla"] },
    { key: "gi_hematemesis_melena", term: "Hematemesis o melena" },
    { key: "gi_vomito_persistente_deshidratacion", term: "Vómito persistente con datos de deshidratación" },
    // 2.5 Obstétrico / Ginecológico (condicionado a sexo femenino o embarazo)
    { key: "obs_sangrado_transvaginal_abundante_embarazo", term: "Sangrado transvaginal abundante en embarazo" },
    { key: "obs_cefalea_vision_borrosa_embarazo", term: "Cefalea con alteraciones visuales en embarazo" },
    { key: "obs_dolor_abdominal_intenso_embarazo", term: "Dolor abdominal intenso en embarazada" },
    { key: "obs_disminucion_movimientos_fetales", term: "Disminución o ausencia de movimientos fetales" },
    { key: "obs_trabajo_parto_pretermino", term: "Datos de trabajo de parto pretérmino" },
    // 2.6 Infeccioso / Sepsis
    { key: "inf_fiebre_hipotension_alteracion_mental", term: "Fiebre con hipotensión y alteración del estado mental", synonyms: ["Probable choque séptico"] },
    { key: "inf_fiebre_inmunocomprometido", term: "Fiebre en paciente inmunocomprometido" },
    // 2.7 Alérgico / Trauma / Otros
    { key: "alerg_anafilaxia", term: "Reacción alérgica con compromiso respiratorio o hipotensión", synonyms: ["Anafilaxia"] },
    { key: "trauma_tce_perdida_conciencia", term: "Traumatismo craneoencefálico con pérdida de conciencia" },
    { key: "trauma_quemadura_extensa_via_aerea", term: "Quemadura extensa o sospecha de quemadura de vía aérea" },
    // 2.8 Salud mental — sembrado, NO alertado como bandera simple
    // (DECISIÓN PENDIENTE del médico responsable sobre el flujo).
    { key: "salud_mental_ideacion_autolesion", term: "Ideación, plan o intento suicida, o conducta autolesiva" },
  ]);
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
  await seedCatalogosPrompt9();
  await seedGrowthReferences();
  await seedEscalasFase3();
  await seedEstudiosFase4();
  await seedFase6();
  await seedFase7();
  await seedInteraccionesDemo();
  await seedBanderasRojas();
  await seedAdmin();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
