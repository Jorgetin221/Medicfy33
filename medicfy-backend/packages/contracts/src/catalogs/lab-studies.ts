// Catálogo de estudios de la orden (Prompt 37, dos niveles: el tipo de
// cada estudio viaja en externalCode del término). Un solo lugar para la
// siembra de la base (prisma/seed.ts), el mock local y las pruebas.
//
// Ampliado a petición del usuario (2026-10-17). Son NOMBRES de estudios
// de uso común en consulta privada en México, no reglas clínicas; como
// todo lo clínico sembrado, quedan marcados para validación médica
// (pendingMedicalReview). Lo que no esté aquí, el médico lo escribe
// como "otro estudio" (customStudyName en labOrderItemCreateSchema).
// Las claves existentes (bh, qs6, ego…) no cambian: hay órdenes
// emitidas que las referencian.
// Archivo puro (sin imports): el mock lo importa con el type-stripping
// de Node.

export interface LabStudyCatalogEntry {
  key: string;
  term: string;
  tipo: "laboratorio" | "imagen" | "gabinete";
  synonyms?: readonly string[];
}

export const LAB_STUDY_TYPES = [
  { key: "laboratorio", term: "Laboratorio" },
  { key: "imagen", term: "Imagenología" },
  { key: "gabinete", term: "Gabinete" },
] as const;

export const LAB_STUDY_MOTIVES = [
  { key: "diagnostico_inicial", term: "Diagnóstico inicial" },
  { key: "control_seguimiento", term: "Control / seguimiento" },
  { key: "tamizaje", term: "Tamizaje" },
  { key: "preoperatorio", term: "Valoración preoperatoria" },
  { key: "urgencia", term: "Urgencia" },
] as const;

export const LAB_STUDIES: readonly LabStudyCatalogEntry[] = [
  // ── Laboratorio: hematología y coagulación
  { key: "bh", term: "Biometría hemática completa", tipo: "laboratorio", synonyms: ["BH", "BHC", "Citometría hemática"] },
  { key: "reticulocitos", term: "Cuenta de reticulocitos", tipo: "laboratorio" },
  { key: "vsg", term: "Velocidad de sedimentación globular (VSG)", tipo: "laboratorio", synonyms: ["VSG"] },
  { key: "grupo_rh", term: "Grupo sanguíneo y factor Rh", tipo: "laboratorio" },
  { key: "tiempos_coagulacion", term: "Tiempos de coagulación (TP, TTPa, INR)", tipo: "laboratorio", synonyms: ["TP", "TTP", "INR"] },
  { key: "fibrinogeno", term: "Fibrinógeno", tipo: "laboratorio" },
  { key: "dimero_d", term: "Dímero D", tipo: "laboratorio" },
  { key: "frotis_sangre", term: "Frotis de sangre periférica", tipo: "laboratorio" },
  // ── Laboratorio: química y metabolismo
  { key: "glucosa_ayuno", term: "Glucosa en ayuno", tipo: "laboratorio" },
  { key: "qs3", term: "Química sanguínea de 3 elementos", tipo: "laboratorio", synonyms: ["QS3"] },
  { key: "qs6", term: "Química sanguínea de 6 elementos", tipo: "laboratorio", synonyms: ["QS", "QS6"] },
  { key: "qs24", term: "Química sanguínea de 24 elementos", tipo: "laboratorio", synonyms: ["QS24", "Química completa"] },
  { key: "hba1c", term: "Hemoglobina glucosilada (HbA1c)", tipo: "laboratorio" },
  { key: "curva_tolerancia_glucosa", term: "Curva de tolerancia a la glucosa oral", tipo: "laboratorio", synonyms: ["CTGO"] },
  { key: "insulina", term: "Insulina sérica", tipo: "laboratorio" },
  { key: "perfil_lipidico", term: "Perfil de lípidos", tipo: "laboratorio" },
  { key: "pfh", term: "Pruebas de función hepática", tipo: "laboratorio", synonyms: ["PFH"] },
  { key: "funcion_renal", term: "Pruebas de función renal (urea, creatinina, BUN)", tipo: "laboratorio" },
  { key: "depuracion_creatinina", term: "Depuración de creatinina en orina de 24 h", tipo: "laboratorio" },
  { key: "acido_urico", term: "Ácido úrico", tipo: "laboratorio" },
  { key: "electrolitos", term: "Electrolitos séricos (Na, K, Cl)", tipo: "laboratorio", synonyms: ["ES"] },
  { key: "calcio_fosforo_magnesio", term: "Calcio, fósforo y magnesio", tipo: "laboratorio" },
  { key: "amilasa_lipasa", term: "Amilasa y lipasa", tipo: "laboratorio" },
  { key: "gasometria", term: "Gasometría arterial", tipo: "laboratorio" },
  { key: "perfil_hierro", term: "Perfil de hierro y ferritina", tipo: "laboratorio" },
  { key: "vitamina_b12_folato", term: "Vitamina B12 y ácido fólico", tipo: "laboratorio" },
  { key: "vitamina_d", term: "Vitamina D (25-OH)", tipo: "laboratorio" },
  // ── Laboratorio: inflamación, cardiaco
  { key: "pcr", term: "Proteína C reactiva (PCR)", tipo: "laboratorio" },
  { key: "procalcitonina", term: "Procalcitonina", tipo: "laboratorio" },
  { key: "troponina", term: "Troponina", tipo: "laboratorio" },
  { key: "ck_mb", term: "CPK y CK-MB", tipo: "laboratorio" },
  { key: "bnp", term: "Péptido natriurético (BNP / NT-proBNP)", tipo: "laboratorio" },
  // ── Laboratorio: endocrino y hormonal
  { key: "tsh", term: "Perfil tiroideo (TSH)", tipo: "laboratorio" },
  { key: "perfil_tiroideo_completo", term: "Perfil tiroideo completo (TSH, T3, T4 libre)", tipo: "laboratorio" },
  { key: "perfil_hormonal_femenino", term: "Perfil hormonal femenino (FSH, LH, estradiol, prolactina)", tipo: "laboratorio" },
  { key: "testosterona", term: "Testosterona total y libre", tipo: "laboratorio" },
  { key: "cortisol", term: "Cortisol sérico", tipo: "laboratorio" },
  { key: "hcg", term: "Prueba de embarazo en sangre (hCG cuantitativa)", tipo: "laboratorio", synonyms: ["β-hCG"] },
  { key: "psa", term: "Antígeno prostático específico (PSA)", tipo: "laboratorio" },
  // ── Laboratorio: orina y heces
  { key: "ego", term: "Examen general de orina", tipo: "laboratorio", synonyms: ["EGO"] },
  { key: "urocultivo", term: "Urocultivo con antibiograma", tipo: "laboratorio" },
  { key: "microalbuminuria", term: "Microalbuminuria", tipo: "laboratorio" },
  { key: "coproparasitoscopico", term: "Coproparasitoscópico seriado (3 muestras)", tipo: "laboratorio", synonyms: ["CPS"] },
  { key: "coprocultivo", term: "Coprocultivo", tipo: "laboratorio" },
  { key: "sangre_oculta_heces", term: "Sangre oculta en heces", tipo: "laboratorio" },
  // ── Laboratorio: infecciosas e inmunología
  { key: "vih", term: "Prueba de VIH", tipo: "laboratorio" },
  { key: "vdrl", term: "VDRL", tipo: "laboratorio" },
  { key: "hepatitis_b", term: "Antígeno de superficie de hepatitis B (HBsAg)", tipo: "laboratorio" },
  { key: "hepatitis_c", term: "Anticuerpos contra hepatitis C", tipo: "laboratorio" },
  { key: "reacciones_febriles", term: "Reacciones febriles", tipo: "laboratorio" },
  { key: "exudado_faringeo", term: "Exudado faríngeo con cultivo", tipo: "laboratorio" },
  { key: "covid_influenza", term: "Prueba de COVID-19 / influenza", tipo: "laboratorio" },
  { key: "factor_reumatoide", term: "Factor reumatoide", tipo: "laboratorio" },
  { key: "antiestreptolisinas", term: "Antiestreptolisinas (ASO)", tipo: "laboratorio" },
  { key: "papanicolaou", term: "Citología cervicovaginal (Papanicolaou)", tipo: "laboratorio", synonyms: ["PAP"] },
  // ── Imagenología
  { key: "tele_torax", term: "Telerradiografía de tórax", tipo: "imagen", synonyms: ["Tele de tórax"] },
  { key: "rx_columna", term: "Radiografía de columna", tipo: "imagen" },
  { key: "rx_extremidades", term: "Radiografía de extremidades", tipo: "imagen" },
  { key: "rx_senos_paranasales", term: "Radiografía de senos paranasales", tipo: "imagen" },
  { key: "rx_abdomen", term: "Radiografía simple de abdomen", tipo: "imagen" },
  { key: "usg_abdominal", term: "Ultrasonido abdominal", tipo: "imagen", synonyms: ["USG abdominal"] },
  { key: "usg_pelvico", term: "Ultrasonido pélvico", tipo: "imagen" },
  { key: "usg_obstetrico", term: "Ultrasonido obstétrico", tipo: "imagen" },
  { key: "usg_renal", term: "Ultrasonido renal y de vías urinarias", tipo: "imagen" },
  { key: "usg_tiroides", term: "Ultrasonido de tiroides", tipo: "imagen" },
  { key: "usg_mamario", term: "Ultrasonido mamario", tipo: "imagen" },
  { key: "usg_doppler", term: "Ultrasonido Doppler vascular", tipo: "imagen" },
  { key: "mastografia", term: "Mastografía", tipo: "imagen" },
  { key: "densitometria", term: "Densitometría ósea", tipo: "imagen" },
  { key: "tac_simple", term: "Tomografía computada simple", tipo: "imagen", synonyms: ["TAC"] },
  { key: "tac_contrastada", term: "Tomografía computada contrastada", tipo: "imagen" },
  { key: "resonancia", term: "Resonancia magnética", tipo: "imagen", synonyms: ["RM", "IRM"] },
  // ── Gabinete
  { key: "ecg", term: "Electrocardiograma de reposo", tipo: "gabinete", synonyms: ["ECG", "EKG"] },
  { key: "ecocardiograma", term: "Ecocardiograma", tipo: "gabinete" },
  { key: "prueba_esfuerzo", term: "Prueba de esfuerzo", tipo: "gabinete" },
  { key: "holter", term: "Holter de 24 horas", tipo: "gabinete" },
  { key: "mapa", term: "Monitoreo ambulatorio de presión arterial (MAPA)", tipo: "gabinete" },
  { key: "espirometria", term: "Espirometría", tipo: "gabinete" },
  { key: "electroencefalograma", term: "Electroencefalograma", tipo: "gabinete", synonyms: ["EEG"] },
  { key: "audiometria", term: "Audiometría", tipo: "gabinete" },
  { key: "endoscopia", term: "Endoscopia de tubo digestivo alto", tipo: "gabinete" },
  { key: "colonoscopia", term: "Colonoscopia", tipo: "gabinete" },
];
