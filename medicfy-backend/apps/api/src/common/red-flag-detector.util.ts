// Fase 8 · Prompt 52 — filtro de seguridad determinista,
// INDEPENDIENTE del modelo de IA. Fuente: banderas-rojas-medicfy.md,
// documento clínico del médico responsable (2026-09-02), fundamentado
// en PALS, Sepsis-3/qSOFA, ESI, GPC CENETEC. "No razona ni pondera
// probabilidades: si un dato entra en rango de alarma, la bandera se
// dispara." No sustituye a vital-ranges.util.ts (ese es un gate de
// PLAUSIBILIDAD DE CAPTURA al firmar, con sus propios rangos por edad
// tomados en Prompt 26) — este archivo es la red de seguridad clínica
// que corre en cada autoguardado, nunca bloquea nada, y usa umbrales
// propios y distintos, dados explícitamente por el médico responsable.
//
// Vía A (vitales): comparación numérica contra los cortes de este
// archivo. Vía B (síntomas): coincidencia contra keys del catálogo
// cerrado BANDERA_ROJA_SINTOMA — NUNCA contra texto libre.
//
// pendingReview=true en una bandera marca un umbral o una decisión que
// el propio documento del médico deja como "decidir/confirmar" — se
// implementa con el valor propuesto, pero señalado para su revisión.

export type RedFlagUrgency = "inmediata" | "misma_consulta" | "seguimiento";
export type RedFlagDetectionMethod = "VITALES" | "SINTOMA" | "COMBINADA";

export interface DetectedRedFlag {
  flagCode: string;
  urgency: RedFlagUrgency;
  detectionMethod: RedFlagDetectionMethod;
  finding: string;
  triggerData: Record<string, unknown>;
  pendingReview?: true;
}

export interface RedFlagVitalsInput {
  bpSystolic?: number | undefined;
  bpDiastolic?: number | undefined;
  heartRate?: number | undefined;
  respiratoryRate?: number | undefined;
  tempC?: number | undefined;
  spo2?: number | undefined;
  glucoseCapMgDl?: number | undefined;
  capillaryRefillSeconds?: number | undefined;
}

export interface RedFlagDetectionInput {
  ageYears: number;
  isPregnant: boolean;
  vitals: RedFlagVitalsInput;
  // Keys de ClinicalCatalogTerm (domain=BANDERA_ROJA_SINTOMA) que el
  // médico marcó como presentes — nunca texto libre.
  presentingSymptomKeys: string[];
}

// Sección 1.2 del documento da tablas hasta "adolescente 12-15 años";
// la 1.1 da la tabla de adultos desde "≥18". Ningún rango cubre 16-17
// — vacío real del documento, no mío. Cierre explícito: 16-17 usa la
// tabla de adultos (fisiológicamente más cercanos a adulto que a la
// tabla 12-15), marcado pendingReview para que el médico lo confirme.
const ADULT_AGE_YEARS = 16;
const INFANT_FEVER_AGE_MONTHS = 3;

interface Interval {
  min: number;
  max: number;
}

function outside(value: number | undefined, range: Interval): boolean {
  return value !== undefined && (value < range.min || value > range.max);
}

// ── Vía A · Sección 1.1 (adultos) y 1.2 (pediátricos) ───────────────

function heartRateRange(ageYears: number): Interval {
  if (ageYears < 1) return { min: 100, max: 190 };
  if (ageYears < 3) return { min: 98, max: 140 };
  if (ageYears < 6) return { min: 80, max: 120 };
  if (ageYears < 12) return { min: 75, max: 118 };
  if (ageYears < ADULT_AGE_YEARS) return { min: 60, max: 100 };
  return { min: 40, max: 130 };
}

function respiratoryRateRange(ageYears: number): Interval {
  if (ageYears < 1) return { min: 30, max: 53 };
  if (ageYears < 3) return { min: 22, max: 37 };
  if (ageYears < 6) return { min: 20, max: 28 };
  if (ageYears < 12) return { min: 18, max: 25 };
  if (ageYears < ADULT_AGE_YEARS) return { min: 12, max: 20 };
  return { min: 8, max: 30 };
}

function spo2Min(ageYears: number): number {
  // Pediátrico: <92% a cualquier edad. Adulto: <90%.
  return ageYears < ADULT_AGE_YEARS ? 92 : 90;
}

function detectVitalFlags(ageYears: number, ageMonths: number, vitals: RedFlagVitalsInput): DetectedRedFlag[] {
  const flags: DetectedRedFlag[] = [];
  const isAdult = ageYears >= ADULT_AGE_YEARS;

  if (outside(vitals.heartRate, heartRateRange(ageYears))) {
    flags.push({
      flagCode: "vital_frecuencia_cardiaca",
      urgency: "inmediata",
      detectionMethod: "VITALES",
      finding: `Frecuencia cardiaca fuera de rango de alarma para la edad (${vitals.heartRate} lpm).`,
      triggerData: { heartRate: vitals.heartRate, ageYears },
    });
  }
  if (outside(vitals.respiratoryRate, respiratoryRateRange(ageYears))) {
    flags.push({
      flagCode: "vital_frecuencia_respiratoria",
      urgency: "inmediata",
      detectionMethod: "VITALES",
      finding: `Frecuencia respiratoria fuera de rango de alarma para la edad (${vitals.respiratoryRate} rpm).`,
      triggerData: { respiratoryRate: vitals.respiratoryRate, ageYears },
    });
  }
  if (vitals.spo2 !== undefined && vitals.spo2 < spo2Min(ageYears)) {
    flags.push({
      flagCode: "vital_hipoxemia",
      urgency: "inmediata",
      detectionMethod: "VITALES",
      finding: `SatO2 por debajo del umbral de alarma (${vitals.spo2}%).`,
      triggerData: { spo2: vitals.spo2, ageYears },
    });
  }
  if (outside(vitals.tempC, { min: 35, max: 40 })) {
    flags.push({
      flagCode: "vital_temperatura",
      urgency: "inmediata",
      detectionMethod: "VITALES",
      finding: `Temperatura fuera de rango de alarma (${vitals.tempC}°C).`,
      triggerData: { tempC: vitals.tempC },
    });
  }
  // Regla adicional, no excluyente de la anterior: fiebre en lactante
  // <3 meses es alarma por sí misma (sepsis oculta) a un umbral MÁS
  // BAJO (38°C) que la alarma general de temperatura (40°C).
  if (ageMonths < INFANT_FEVER_AGE_MONTHS && vitals.tempC !== undefined && vitals.tempC >= 38) {
    flags.push({
      flagCode: "vital_fiebre_lactante_menor_3_meses",
      urgency: "inmediata",
      detectionMethod: "VITALES",
      finding: `Fiebre (${vitals.tempC}°C) en lactante menor de 3 meses — alarma por sí misma (sepsis oculta).`,
      triggerData: { tempC: vitals.tempC, ageMonths },
    });
  }
  // TA: solo tabla de adultos en el documento — la pediátrica se
  // omite a propósito ("depende de percentilas de edad/sexo/talla").
  if (isAdult) {
    if (outside(vitals.bpSystolic, { min: 90, max: 179 })) {
      flags.push({
        flagCode: "vital_ta_sistolica",
        urgency: "inmediata",
        detectionMethod: "VITALES",
        finding: `TA sistólica fuera de rango de alarma (${vitals.bpSystolic} mmHg).`,
        triggerData: { bpSystolic: vitals.bpSystolic },
      });
    }
    if (vitals.bpDiastolic !== undefined && vitals.bpDiastolic >= 120) {
      flags.push({
        flagCode: "vital_ta_diastolica",
        urgency: "inmediata",
        detectionMethod: "VITALES",
        finding: `TA diastólica ≥120 mmHg (${vitals.bpDiastolic} mmHg) — corte clásico de crisis hipertensiva.`,
        triggerData: { bpDiastolic: vitals.bpDiastolic },
      });
    }
  }
  // Glucosa: el documento solo da corte de adultos, sin distinción
  // pediátrica — se aplica a toda edad. El límite inferior (54) está
  // sourceado (ADA nivel 2); el superior (300) el propio documento lo
  // marca "techo a decidir por ti".
  if (vitals.glucoseCapMgDl !== undefined) {
    if (vitals.glucoseCapMgDl < 54) {
      flags.push({
        flagCode: "vital_hipoglucemia",
        urgency: "inmediata",
        detectionMethod: "VITALES",
        finding: `Glucosa capilar < 54 mg/dL (${vitals.glucoseCapMgDl}) — hipoglucemia clínicamente significativa.`,
        triggerData: { glucoseCapMgDl: vitals.glucoseCapMgDl },
      });
    } else if (vitals.glucoseCapMgDl > 300) {
      flags.push({
        flagCode: "vital_hiperglucemia",
        urgency: "inmediata",
        detectionMethod: "VITALES",
        finding: `Glucosa capilar > 300 mg/dL (${vitals.glucoseCapMgDl}).`,
        triggerData: { glucoseCapMgDl: vitals.glucoseCapMgDl },
        pendingReview: true,
      });
    }
  }
  // Llenado capilar: solo listado para pediátricos en el documento.
  if (!isAdult && vitals.capillaryRefillSeconds !== undefined && vitals.capillaryRefillSeconds > 3) {
    flags.push({
      flagCode: "vital_llenado_capilar",
      urgency: "inmediata",
      detectionMethod: "VITALES",
      finding: `Llenado capilar > 3 s (${vitals.capillaryRefillSeconds} s).`,
      triggerData: { capillaryRefillSeconds: vitals.capillaryRefillSeconds },
    });
  }
  return flags;
}

// ── Vía B · Sección 2 — catálogo cerrado BANDERA_ROJA_SINTOMA ───────
// key -> {finding, urgency, requiresFemaleOrPregnant}. La 2.8 (salud
// mental) se SIEMBRA en catálogo (checklist del documento) pero se
// EXCLUYE aquí a propósito — el propio documento pide dejarla como
// decisión pendiente de un flujo dedicado, no una alerta simple.
const SYMPTOM_FLAG_MAP: Record<string, { finding: string; urgency: RedFlagUrgency; requiresFemaleOrPregnant?: true }> = {
  cv_dolor_toracico_opresivo: { finding: "Dolor torácico opresivo o retroesternal — sospecha de síndrome coronario agudo.", urgency: "inmediata" },
  cv_dolor_toracico_irradiado: { finding: "Dolor torácico irradiado a brazo, mandíbula, cuello o espalda.", urgency: "inmediata" },
  cv_sincope: { finding: "Síncope o pérdida transitoria de la conciencia.", urgency: "inmediata" },
  cv_palpitaciones_con_dolor_disnea: { finding: "Palpitaciones con dolor torácico o disnea asociada.", urgency: "misma_consulta" },
  resp_disnea_subita_reposo: { finding: "Disnea súbita o dificultad respiratoria en reposo.", urgency: "inmediata" },
  resp_estridor: { finding: "Estridor.", urgency: "inmediata" },
  resp_cianosis: { finding: "Cianosis.", urgency: "inmediata" },
  resp_hemoptisis: { finding: "Hemoptisis.", urgency: "misma_consulta" },
  neuro_deficit_focal_subito: { finding: "Déficit neurológico focal súbito — sospecha de EVC/código ictus.", urgency: "inmediata" },
  neuro_cefalea_subita_intensa: { finding: "Cefalea súbita e intensa, de máxima intensidad.", urgency: "inmediata" },
  neuro_alteracion_conciencia_aguda: { finding: "Alteración aguda del estado de conciencia o confusión de inicio reciente.", urgency: "inmediata" },
  neuro_convulsion_activa_o_primera: { finding: "Convulsión activa o primera convulsión.", urgency: "inmediata" },
  neuro_rigidez_nuca_fiebre: { finding: "Rigidez de nuca con fiebre — sospecha de meningitis.", urgency: "misma_consulta" },
  gi_dolor_abdominal_intenso_subito: { finding: "Dolor abdominal intenso y súbito.", urgency: "inmediata" },
  gi_irritacion_peritoneal: { finding: "Signos de irritación peritoneal / abdomen en tabla.", urgency: "inmediata" },
  gi_hematemesis_melena: { finding: "Hematemesis o melena.", urgency: "inmediata" },
  gi_vomito_persistente_deshidratacion: { finding: "Vómito persistente con datos de deshidratación.", urgency: "misma_consulta" },
  obs_sangrado_transvaginal_abundante_embarazo: { finding: "Sangrado transvaginal abundante en embarazo.", urgency: "inmediata", requiresFemaleOrPregnant: true },
  obs_cefalea_vision_borrosa_embarazo: { finding: "Cefalea con alteraciones visuales en embarazo — sospecha de preeclampsia.", urgency: "inmediata", requiresFemaleOrPregnant: true },
  obs_dolor_abdominal_intenso_embarazo: { finding: "Dolor abdominal intenso en embarazada.", urgency: "inmediata", requiresFemaleOrPregnant: true },
  obs_disminucion_movimientos_fetales: { finding: "Disminución o ausencia de movimientos fetales.", urgency: "inmediata", requiresFemaleOrPregnant: true },
  obs_trabajo_parto_pretermino: { finding: "Datos de trabajo de parto pretérmino.", urgency: "misma_consulta", requiresFemaleOrPregnant: true },
  inf_fiebre_hipotension_alteracion_mental: { finding: "Fiebre con hipotensión y alteración del estado mental — probable choque séptico.", urgency: "inmediata" },
  inf_fiebre_inmunocomprometido: { finding: "Fiebre en paciente inmunocomprometido.", urgency: "misma_consulta" },
  alerg_anafilaxia: { finding: "Reacción alérgica con compromiso respiratorio o hipotensión — sospecha de anafilaxia.", urgency: "inmediata" },
  trauma_tce_perdida_conciencia: { finding: "Traumatismo craneoencefálico con pérdida de conciencia.", urgency: "inmediata" },
  trauma_quemadura_extensa_via_aerea: { finding: "Quemadura extensa o sospecha de quemadura de vía aérea.", urgency: "misma_consulta" },
};

// Excluida a propósito de SYMPTOM_FLAG_MAP — sembrada en catálogo,
// nunca dispara alerta simple. Ver sección 2.8 del documento.
export const SUICIDE_RISK_SYMPTOM_KEY = "salud_mental_ideacion_autolesion";

function detectSymptomFlags(presentingSymptomKeys: string[], isFemaleOrPregnant: boolean): DetectedRedFlag[] {
  const flags: DetectedRedFlag[] = [];
  for (const key of presentingSymptomKeys) {
    if (key === SUICIDE_RISK_SYMPTOM_KEY) continue; // PENDIENTE(jorge): flujo propio, no alerta simple.
    const entry = SYMPTOM_FLAG_MAP[key];
    if (!entry) continue;
    if (entry.requiresFemaleOrPregnant && !isFemaleOrPregnant) continue;
    flags.push({
      flagCode: `sintoma_${key}`,
      urgency: entry.urgency,
      detectionMethod: "SINTOMA",
      finding: entry.finding,
      triggerData: { symptomKey: key },
    });
  }
  return flags;
}

// ── Sección 3 · Reglas combinadas ───────────────────────────────────

const MENTAL_STATUS_SYMPTOM_KEY = "neuro_alteracion_conciencia_aguda";
// "En contexto de infección sospechada" no tiene señal estructurada
// hoy (no existe un flag de "sospecha de infección" en el sistema) —
// se usa fiebre ≥38°C como proxy clínico razonable, NO como
// equivalencia exacta de qSOFA. Decisión propia, marcada pendingReview.
const FEVER_AS_INFECTION_CONTEXT_C = 38;

function detectCombinedFlags(
  ageYears: number,
  isPregnant: boolean,
  vitals: RedFlagVitalsInput,
  presentingSymptomKeys: string[]
): DetectedRedFlag[] {
  const flags: DetectedRedFlag[] = [];
  const isAdult = ageYears >= ADULT_AGE_YEARS;
  const hasAlteredMentalStatus = presentingSymptomKeys.includes(MENTAL_STATUS_SYMPTOM_KEY);
  const hasFever = vitals.tempC !== undefined && vitals.tempC >= FEVER_AS_INFECTION_CONTEXT_C;

  // 1. Sepsis: qSOFA ≥2 de 3, en contexto de infección sospechada
  // (adultos — qSOFA está derivado y validado en población adulta).
  if (isAdult && hasFever) {
    const qsofaCriteria = [
      hasAlteredMentalStatus,
      vitals.respiratoryRate !== undefined && vitals.respiratoryRate >= 22,
      vitals.bpSystolic !== undefined && vitals.bpSystolic <= 100,
    ].filter(Boolean).length;
    if (qsofaCriteria >= 2) {
      flags.push({
        flagCode: "combinada_sepsis_qsofa",
        urgency: "inmediata",
        detectionMethod: "COMBINADA",
        finding: `Sospecha de sepsis: qSOFA ${qsofaCriteria}/3 en contexto de fiebre (proxy de infección sospechada).`,
        triggerData: { qsofaCriteria, tempC: vitals.tempC, respiratoryRate: vitals.respiratoryRate, bpSystolic: vitals.bpSystolic },
        pendingReview: true,
      });
    }
  }

  // Fiebre + hipotensión + alteración del estado mental (choque
  // séptico probable) — ítem 🔴 propio de la sección 2.6, no depende
  // de contar criterios qSOFA.
  if (isAdult && hasFever && hasAlteredMentalStatus && vitals.bpSystolic !== undefined && vitals.bpSystolic < 90) {
    flags.push({
      flagCode: "combinada_choque_septico_probable",
      urgency: "inmediata",
      detectionMethod: "COMBINADA",
      finding: "Fiebre + hipotensión + alteración del estado mental — probable choque séptico.",
      triggerData: { tempC: vitals.tempC, bpSystolic: vitals.bpSystolic },
    });
  }

  // 2. Insuficiencia respiratoria: SatO2<90% Y FR>30 (tabla de
  // adultos — no hay combinación pediátrica equivalente en el documento).
  if (isAdult && vitals.spo2 !== undefined && vitals.spo2 < 90 && vitals.respiratoryRate !== undefined && vitals.respiratoryRate > 30) {
    flags.push({
      flagCode: "combinada_insuficiencia_respiratoria",
      urgency: "inmediata",
      detectionMethod: "COMBINADA",
      finding: `Compromiso respiratorio combinado: SatO2 ${vitals.spo2}% y FR ${vitals.respiratoryRate} rpm.`,
      triggerData: { spo2: vitals.spo2, respiratoryRate: vitals.respiratoryRate },
    });
  }

  // 3. Choque: TAS<90 Y (FC>130 O alteración del estado mental).
  if (isAdult && vitals.bpSystolic !== undefined && vitals.bpSystolic < 90) {
    const tachycardic = vitals.heartRate !== undefined && vitals.heartRate > 130;
    if (tachycardic || hasAlteredMentalStatus) {
      flags.push({
        flagCode: "combinada_choque",
        urgency: "inmediata",
        detectionMethod: "COMBINADA",
        finding: `TA sistólica ${vitals.bpSystolic} mmHg con ${tachycardic ? `FC ${vitals.heartRate} lpm` : "alteración del estado mental"}.`,
        triggerData: { bpSystolic: vitals.bpSystolic, heartRate: vitals.heartRate, hasAlteredMentalStatus },
      });
    }
  }

  // 4. Preeclampsia: embarazo Y (TA≥140/90 O cefalea+visión borrosa —
  // esta segunda vía ya dispara su propia bandera de síntoma; aquí se
  // agrega la vía de TA como disparador independiente). El umbral
  // 140/90 el documento pide confirmarlo explícitamente.
  if (isPregnant) {
    const hypertensive = (vitals.bpSystolic !== undefined && vitals.bpSystolic >= 140) || (vitals.bpDiastolic !== undefined && vitals.bpDiastolic >= 90);
    if (hypertensive) {
      flags.push({
        flagCode: "combinada_preeclampsia_ta",
        urgency: "inmediata",
        detectionMethod: "COMBINADA",
        finding: `TA ≥140/90 en embarazo (${vitals.bpSystolic ?? "?"}/${vitals.bpDiastolic ?? "?"} mmHg) — sospecha de preeclampsia.`,
        triggerData: { bpSystolic: vitals.bpSystolic, bpDiastolic: vitals.bpDiastolic },
        pendingReview: true,
      });
    }
  }

  return flags;
}

export function detectRedFlags(input: RedFlagDetectionInput, sexAtBirth: "F" | "M"): DetectedRedFlag[] {
  const ageMonths = input.ageYears * 12;
  const isFemaleOrPregnant = sexAtBirth === "F" || input.isPregnant;
  return [
    ...detectVitalFlags(input.ageYears, ageMonths, input.vitals),
    ...detectSymptomFlags(input.presentingSymptomKeys, isFemaleOrPregnant),
    ...detectCombinedFlags(input.ageYears, input.isPregnant, input.vitals, input.presentingSymptomKeys),
  ];
}
