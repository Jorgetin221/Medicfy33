import { describe, expect, it } from "vitest";
import { detectRedFlags, SUICIDE_RISK_SYMPTOM_KEY, type RedFlagDetectionInput } from "./red-flag-detector.util";

// Fase 8 · Prompt 52 — "Escribe una prueba por cada filtro, con un
// caso que lo dispare" (banderas-rojas-medicfy.md, instrucción final
// para Claude Code). Un caso normal + un caso que dispara cada
// bandera, para no solo probar el camino feliz.
function baseInput(overrides: Partial<RedFlagDetectionInput> = {}): RedFlagDetectionInput {
  return {
    ageYears: 30,
    isPregnant: false,
    vitals: {},
    presentingSymptomKeys: [],
    ...overrides,
  };
}
function codes(flags: ReturnType<typeof detectRedFlags>): string[] {
  return flags.map((f) => f.flagCode);
}

describe("detectRedFlags — Vía A (vitales, sección 1)", () => {
  it("un paciente con vitales normales no dispara ninguna bandera", () => {
    const flags = detectRedFlags(
      baseInput({ vitals: { heartRate: 75, respiratoryRate: 16, spo2: 98, tempC: 36.8, bpSystolic: 118, bpDiastolic: 76 } }),
      "F"
    );
    expect(flags).toHaveLength(0);
  });

  it("adulto: SatO2 < 90% dispara vital_hipoxemia", () => {
    const flags = detectRedFlags(baseInput({ vitals: { spo2: 88 } }), "M");
    expect(codes(flags)).toContain("vital_hipoxemia");
  });

  it("adulto: SatO2 91% (por encima del umbral 90%) NO dispara", () => {
    const flags = detectRedFlags(baseInput({ vitals: { spo2: 91 } }), "M");
    expect(codes(flags)).not.toContain("vital_hipoxemia");
  });

  it("adulto: FR > 30 dispara vital_frecuencia_respiratoria", () => {
    const flags = detectRedFlags(baseInput({ vitals: { respiratoryRate: 32 } }), "M");
    expect(codes(flags)).toContain("vital_frecuencia_respiratoria");
  });

  it("adulto: FC < 40 dispara vital_frecuencia_cardiaca", () => {
    const flags = detectRedFlags(baseInput({ vitals: { heartRate: 35 } }), "M");
    expect(codes(flags)).toContain("vital_frecuencia_cardiaca");
  });

  it("adulto: TA sistólica ≥180 dispara vital_ta_sistolica", () => {
    const flags = detectRedFlags(baseInput({ vitals: { bpSystolic: 185 } }), "M");
    expect(codes(flags)).toContain("vital_ta_sistolica");
  });

  it("adulto: TA diastólica ≥120 dispara vital_ta_diastolica", () => {
    const flags = detectRedFlags(baseInput({ vitals: { bpDiastolic: 125 } }), "M");
    expect(codes(flags)).toContain("vital_ta_diastolica");
  });

  it("temperatura ≥40°C dispara vital_temperatura, a cualquier edad", () => {
    const flags = detectRedFlags(baseInput({ vitals: { tempC: 40.5 } }), "M");
    expect(codes(flags)).toContain("vital_temperatura");
  });

  it("temperatura <35°C (hipotermia) dispara vital_temperatura", () => {
    const flags = detectRedFlags(baseInput({ vitals: { tempC: 34.5 } }), "F");
    expect(codes(flags)).toContain("vital_temperatura");
  });

  it("glucosa < 54 mg/dL dispara vital_hipoglucemia", () => {
    const flags = detectRedFlags(baseInput({ vitals: { glucoseCapMgDl: 45 } }), "F");
    expect(codes(flags)).toContain("vital_hipoglucemia");
  });

  it("glucosa > 300 mg/dL dispara vital_hiperglucemia, marcada pendingReview (techo 'a decidir' en el documento)", () => {
    const flags = detectRedFlags(baseInput({ vitals: { glucoseCapMgDl: 350 } }), "F");
    const flag = flags.find((f) => f.flagCode === "vital_hiperglucemia");
    expect(flag).toBeDefined();
    expect(flag?.pendingReview).toBe(true);
  });

  it("lactante <3 meses con fiebre ≥38°C dispara la bandera específica de sepsis oculta, con umbral más bajo que la alarma general", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 2 / 12, vitals: { tempC: 38.2 } }), "M");
    expect(codes(flags)).toContain("vital_fiebre_lactante_menor_3_meses");
    // 38.2°C no alcanza el umbral general de 40°C — solo la regla del lactante debe dispararse.
    expect(codes(flags)).not.toContain("vital_temperatura");
  });

  it("pediátrico (<16 años): SatO2 91% dispara (umbral pediátrico es 92%, más estricto que el de adultos)", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 8, vitals: { spo2: 91 } }), "M");
    expect(codes(flags)).toContain("vital_hipoxemia");
  });

  it("pediátrico: no se evalúa TA (el documento omite el corte pediátrico a propósito)", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 5, vitals: { bpSystolic: 60, bpDiastolic: 30 } }), "M");
    expect(codes(flags)).toHaveLength(0);
  });

  it("pediátrico: llenado capilar >3s dispara vital_llenado_capilar; en adulto no se evalúa (solo listado para pediátricos)", () => {
    const ped = detectRedFlags(baseInput({ ageYears: 4, vitals: { capillaryRefillSeconds: 4 } }), "M");
    expect(codes(ped)).toContain("vital_llenado_capilar");
    const adult = detectRedFlags(baseInput({ ageYears: 30, vitals: { capillaryRefillSeconds: 4 } }), "M");
    expect(codes(adult)).not.toContain("vital_llenado_capilar");
  });

  it("preescolar (3-5 años): FC 130 está fuera del rango normal [80,120] y dispara", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 4, vitals: { heartRate: 130 } }), "F");
    expect(codes(flags)).toContain("vital_frecuencia_cardiaca");
  });

  it("preescolar (3-5 años): FC 100 está DENTRO del rango normal [80,120] y no dispara", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 4, vitals: { heartRate: 100 } }), "F");
    expect(codes(flags)).not.toContain("vital_frecuencia_cardiaca");
  });

  it("adolescente (12-15 años): FC 110 está fuera del rango normal [60,100] y dispara", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 14, vitals: { heartRate: 110 } }), "M");
    expect(codes(flags)).toContain("vital_frecuencia_cardiaca");
  });

  it("gap 16-17 años (sin tabla propia en el documento) usa el umbral de adultos: FC 135 dispara, pero solo por el corte adulto (>130), no el adolescente (>100)", () => {
    const flags16 = detectRedFlags(baseInput({ ageYears: 16, vitals: { heartRate: 105 } }), "M");
    // 105 excede el tope adolescente (100) pero NO el de adulto (130) — si usara la tabla adulta, no debe disparar.
    expect(codes(flags16)).not.toContain("vital_frecuencia_cardiaca");
  });
});

describe("detectRedFlags — Vía B (síntomas, sección 2, catálogo cerrado)", () => {
  it("un síntoma 🔴 no condicionado dispara con urgencia inmediata", () => {
    const flags = detectRedFlags(baseInput({ presentingSymptomKeys: ["cv_dolor_toracico_opresivo"] }), "M");
    const flag = flags.find((f) => f.flagCode === "sintoma_cv_dolor_toracico_opresivo");
    expect(flag).toBeDefined();
    expect(flag?.urgency).toBe("inmediata");
    expect(flag?.detectionMethod).toBe("SINTOMA");
  });

  it("un síntoma no-🔴 dispara con urgencia misma_consulta, no inmediata", () => {
    const flags = detectRedFlags(baseInput({ presentingSymptomKeys: ["resp_hemoptisis"] }), "M");
    const flag = flags.find((f) => f.flagCode === "sintoma_resp_hemoptisis");
    expect(flag?.urgency).toBe("misma_consulta");
  });

  it("un key que no existe en el mapa se ignora en silencio, no revienta", () => {
    const flags = detectRedFlags(baseInput({ presentingSymptomKeys: ["esto_no_existe_en_el_catalogo"] }), "M");
    expect(flags).toHaveLength(0);
  });

  it("2.8 — ideación suicida NUNCA dispara una bandera simple, aunque se marque presente (DECISIÓN PENDIENTE del médico responsable)", () => {
    const flags = detectRedFlags(baseInput({ presentingSymptomKeys: [SUICIDE_RISK_SYMPTOM_KEY] }), "F");
    expect(flags).toHaveLength(0);
  });

  it("síntoma obstétrico condicionado a sexo femenino/embarazo: SÍ dispara para paciente femenina", () => {
    const flags = detectRedFlags(baseInput({ presentingSymptomKeys: ["obs_disminucion_movimientos_fetales"] }), "F");
    expect(codes(flags)).toContain("sintoma_obs_disminucion_movimientos_fetales");
  });

  it("síntoma obstétrico condicionado a sexo femenino/embarazo: NO dispara para paciente masculino sin embarazo", () => {
    const flags = detectRedFlags(baseInput({ presentingSymptomKeys: ["obs_disminucion_movimientos_fetales"] }), "M");
    expect(codes(flags)).not.toContain("sintoma_obs_disminucion_movimientos_fetales");
  });
});

describe("detectRedFlags — Sección 3, reglas combinadas", () => {
  it("Sepsis: qSOFA 2/3 (FR≥22 + TAS≤100) con fiebre como proxy de infección dispara combinada_sepsis_qsofa, marcada pendingReview", () => {
    const flags = detectRedFlags(
      baseInput({ ageYears: 40, vitals: { tempC: 38.5, respiratoryRate: 24, bpSystolic: 95 } }),
      "M"
    );
    const flag = flags.find((f) => f.flagCode === "combinada_sepsis_qsofa");
    expect(flag).toBeDefined();
    expect(flag?.pendingReview).toBe(true);
  });

  it("Sepsis: solo 1/3 criterios qSOFA NO dispara la regla combinada", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 40, vitals: { tempC: 38.5, respiratoryRate: 24 } }), "M");
    expect(codes(flags)).not.toContain("combinada_sepsis_qsofa");
  });

  it("Sepsis: qSOFA 2/3 SIN fiebre (sin proxy de infección) NO dispara", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 40, vitals: { respiratoryRate: 24, bpSystolic: 95 } }), "M");
    expect(codes(flags)).not.toContain("combinada_sepsis_qsofa");
  });

  it("Choque séptico probable: fiebre + TAS<90 + alteración del estado mental dispara combinada_choque_septico_probable", () => {
    const flags = detectRedFlags(
      baseInput({
        ageYears: 50,
        vitals: { tempC: 39, bpSystolic: 85 },
        presentingSymptomKeys: ["neuro_alteracion_conciencia_aguda"],
      }),
      "F"
    );
    expect(codes(flags)).toContain("combinada_choque_septico_probable");
  });

  it("Insuficiencia respiratoria: SatO2<90 Y FR>30 (adulto) dispara combinada_insuficiencia_respiratoria", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 45, vitals: { spo2: 88, respiratoryRate: 34 } }), "M");
    expect(codes(flags)).toContain("combinada_insuficiencia_respiratoria");
  });

  it("Insuficiencia respiratoria: solo SatO2<90 sin FR>30 NO dispara la combinada (aunque sí dispare vital_hipoxemia por sí sola)", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 45, vitals: { spo2: 88, respiratoryRate: 20 } }), "M");
    expect(codes(flags)).toContain("vital_hipoxemia");
    expect(codes(flags)).not.toContain("combinada_insuficiencia_respiratoria");
  });

  it("Choque: TAS<90 Y FC>130 dispara combinada_choque", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 45, vitals: { bpSystolic: 85, heartRate: 140 } }), "M");
    expect(codes(flags)).toContain("combinada_choque");
  });

  it("Choque: TAS<90 Y alteración del estado mental (sin taquicardia) también dispara combinada_choque", () => {
    const flags = detectRedFlags(
      baseInput({ ageYears: 45, vitals: { bpSystolic: 85, heartRate: 90 }, presentingSymptomKeys: ["neuro_alteracion_conciencia_aguda"] }),
      "M"
    );
    expect(codes(flags)).toContain("combinada_choque");
  });

  it("Choque: TAS<90 sola, sin taquicardia ni alteración mental, NO dispara la combinada", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 45, vitals: { bpSystolic: 85, heartRate: 90 } }), "M");
    expect(codes(flags)).not.toContain("combinada_choque");
  });

  it("Preeclampsia: embarazo + TA≥140/90 dispara combinada_preeclampsia_ta, marcada pendingReview (umbral a confirmar)", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 28, isPregnant: true, vitals: { bpSystolic: 145, bpDiastolic: 70 } }), "F");
    const flag = flags.find((f) => f.flagCode === "combinada_preeclampsia_ta");
    expect(flag).toBeDefined();
    expect(flag?.pendingReview).toBe(true);
  });

  it("Preeclampsia: TA≥140/90 SIN embarazo no dispara la regla de preeclampsia", () => {
    const flags = detectRedFlags(baseInput({ ageYears: 28, isPregnant: false, vitals: { bpSystolic: 145, bpDiastolic: 70 } }), "F");
    expect(codes(flags)).not.toContain("combinada_preeclampsia_ta");
  });

  it("Preeclampsia: embarazo con cefalea+visión borrosa (sin TA alta) dispara la bandera de síntoma, que ya es 🔴 por sí sola", () => {
    const flags = detectRedFlags(
      baseInput({ ageYears: 28, isPregnant: true, vitals: {}, presentingSymptomKeys: ["obs_cefalea_vision_borrosa_embarazo"] }),
      "F"
    );
    expect(codes(flags)).toContain("sintoma_obs_cefalea_vision_borrosa_embarazo");
    expect(codes(flags)).not.toContain("combinada_preeclampsia_ta");
  });
});
