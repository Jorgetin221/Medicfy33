// Catálogo de medicamentos compartido por prisma/seed.ts (base real) y
// dev-server.mjs (mock local), para que la demo tenga el mismo
// catálogo con o sin PostgreSQL. Sin imports a propósito: el mock lo
// carga con el type-stripping de Node.
// Catálogo sintético mínimo para probar el flujo de punta a punta
// (M9-RN-012 bloqueo de Grupo I/II incluido). Nombres genéricos y
// clasificación de grupo son datos públicos (Ley General de Salud
// art. 226); dosis/presentaciones aquí son de ejemplo, NO una
// indicación clínica real — ver el plan sobre no inventar contenido
// clínico. Poblar el Cuadro Básico completo queda pendiente.
export const MEDICATIONS = [
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

  // Ampliación del catálogo para la demo (2026-11-03), a petición del
  // usuario. Medicamentos de uso común en consulta privada en México,
  // con código ATC de la clasificación pública de la OMS (ATC/DDD) y
  // nombre comercial de referencia. Mismo criterio que el resto:
  // presentaciones de ejemplo, NO una indicación clínica.

  // Cardiovascular / lípidos
  { genericName: "Simvastatina", brandNames: ["Zocor"], presentations: [{ label: "Tableta 20 mg" }], atcCode: "C10AA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Rosuvastatina", brandNames: ["Crestor"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "C10AA07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Valsartán", brandNames: ["Diovan"], presentations: [{ label: "Tableta 80 mg" }], atcCode: "C09CA03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Telmisartán", brandNames: ["Micardis"], presentations: [{ label: "Tableta 40 mg" }], atcCode: "C09CA07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Captopril", brandNames: ["Capoten"], presentations: [{ label: "Tableta 25 mg" }], atcCode: "C09AA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Bisoprolol", brandNames: ["Concor"], presentations: [{ label: "Tableta 5 mg" }], atcCode: "C07AB07", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Propranolol", brandNames: ["Inderal"], presentations: [{ label: "Tableta 40 mg" }], atcCode: "C07AA05", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Diabetes
  { genericName: "Sitagliptina", brandNames: ["Januvia"], presentations: [{ label: "Tableta 100 mg" }], atcCode: "A10BH01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Dapagliflozina", brandNames: ["Forxiga"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "A10BK01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Empagliflozina", brandNames: ["Jardiance"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "A10BK03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Gastrointestinal
  { genericName: "Esomeprazol", brandNames: ["Nexium"], presentations: [{ label: "Tableta 40 mg" }], atcCode: "A02BC05", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Famotidina", brandNames: ["Pepcid"], presentations: [{ label: "Tableta 20 mg" }], atcCode: "A02BA03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ondansetrón", brandNames: ["Zofran"], presentations: [{ label: "Tableta 8 mg" }], atcCode: "A04AA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Respiratorio / alergia
  { genericName: "Montelukast", brandNames: ["Singulair"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "R03DC03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Fluticasona", brandNames: ["Flixonase"], presentations: [{ label: "Spray nasal 50 mcg/dosis" }], atcCode: "R01AD08", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Desloratadina", brandNames: ["Aerius"], presentations: [{ label: "Tableta 5 mg" }], atcCode: "R06AX27", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Antiinfecciosos
  { genericName: "Levofloxacino", brandNames: ["Tavanic"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "J01MA12", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Cefuroxima", brandNames: ["Zinnat"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "J01DC02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Ceftriaxona", brandNames: ["Rocephin"], presentations: [{ label: "Solución inyectable 1 g" }], atcCode: "J01DD04", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Fluconazol", brandNames: ["Diflucan"], presentations: [{ label: "Cápsula 150 mg" }], atcCode: "J02AC01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Aciclovir", brandNames: ["Zovirax"], presentations: [{ label: "Tableta 400 mg" }], atcCode: "J05AB01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Albendazol", brandNames: ["Zentel"], presentations: [{ label: "Tableta 200 mg" }], atcCode: "P02CA03", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Nitazoxanida", brandNames: ["Daxon"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "P01AX11", controlGroup: "VI" as const, isElectronicallyPrescribable: true },

  // Otros de consulta general
  { genericName: "Escitalopram", brandNames: ["Lexapro"], presentations: [{ label: "Tableta 10 mg" }], atcCode: "N06AB10", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Alopurinol", brandNames: ["Zyloprim"], presentations: [{ label: "Tableta 300 mg" }], atcCode: "M04AA01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Colchicina", brandNames: [], presentations: [{ label: "Tableta 1 mg" }], atcCode: "M04AC01", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Tamsulosina", brandNames: ["Secotex"], presentations: [{ label: "Cápsula 0.4 mg" }], atcCode: "G04CA02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
  { genericName: "Dexametasona", brandNames: ["Decadron"], presentations: [{ label: "Solución inyectable 8 mg/2 mL" }], atcCode: "H02AB02", controlGroup: "VI" as const, isElectronicallyPrescribable: true },
];
