// Fase 8 · Prompt 50 (docs/medicfy-58-prompts.md, Bloque 9) — forma
// del contexto que el servidor arma para "El Segundo Lector". Vive
// solo aquí (no en packages/contracts): nunca cruza al frontend, solo
// del servidor al modelo. Por eso NO tiene campos de identidad — ver
// ContextAssemblerService para la SEUDONIMIZACIÓN. A petición del
// usuario (2026-10-16) lleva TODO lo clínico del expediente y de la
// consulta en curso; lo único que nunca viaja es la identidad.

export interface AssistantPatientBlock {
  edadAnios: number;
  sexo: "F" | "M";
  embarazo: { semanasGestacion: number; diasGestacion: number } | null;
  tipoSangre: string | null;
  // Municipio/estado, nunca calle ni número: la zona de residencia
  // cambia el diferencial (enfermedades endémicas) sin identificar a
  // nadie.
  residencia: { municipio: string | null; estado: string | null } | null;
}

export interface AssistantAllergyBlock {
  sustancia: string;
  reaccion: string | null;
  gravedad: string;
}

export interface AssistantProblemBlock {
  codigoIcd10: string | null;
  descripcion: string;
  fecha: string;
}

export interface AssistantMedicationBlock {
  nombreGenerico: string;
  dosis: string;
  via: string;
  frecuencia: string;
}

// Los NEGADOS también viajan: "niega diabetes" es un dato clínico,
// no la ausencia de uno.
export interface AssistantHistoryBlock {
  categoria: string;
  subtipo: string;
  estado: "PRESENTE" | "NEGADO";
  parentesco: string | null;
  comentario: string | null;
}

export interface AssistantSubstanceUseBlock {
  sustancia: string;
  estado: string;
  cantidad: string | null;
  unidad: string | null;
  edadInicio: number | null;
  indiceTabaquico: string | null;
  bebidasEstandarPorSemana: string | null;
  comentario: string | null;
}

export interface AssistantGynecoBlock {
  menarcaEdad: number | null;
  cicloDuracionDias: number | null;
  cicloFrecuenciaDias: number | null;
  cicloCantidad: string | null;
  dismenorrea: boolean | null;
  otroFlujo: string | null;
  inicioVidaSexualEdad: number | null;
  parejasSexuales: number | null;
  metodoAnticonceptivo: string | null;
  frecuenciaSexual: string | null;
  antecedenteIts: string | null;
  gestas: number | null;
  partos: number | null;
  cesareas: number | null;
  abortos: number | null;
  antecedentesPerinatales: string | null;
}

// Mismas claves que vitalsSchema (contracts) con la unidad en el
// nombre, más lo que calcula el servidor (IMC, superficie corporal).
// fueraDeRango/criticos: evaluateVitalRanges() por edad — el modelo
// recibe el juicio ya hecho por el servidor, igual que con los
// analitos de laboratorio.
export interface AssistantVitalsBlock {
  presionSistolicaMmHg?: number;
  presionDiastolicaMmHg?: number;
  frecuenciaCardiacaLpm?: number;
  frecuenciaRespiratoriaRpm?: number;
  temperaturaC?: number;
  spo2Porcentaje?: number;
  glucosaCapilarMgDl?: number;
  llenadoCapilarSegundos?: number;
  pesoKg?: number;
  tallaCm?: number;
  perimetroCefalicoCm?: number;
  perimetroAbdominalCm?: number;
  imc?: number;
  superficieCorporalM2?: number;
  fueraDeRango: string[];
  criticos: string[];
}

export interface AssistantPreviousVitalsBlock extends AssistantVitalsBlock {
  fecha: string;
}

export interface AssistantLabBlock {
  analito: string;
  valor: string;
  unidad: string;
  rangoMin: string | null;
  rangoMax: string | null;
  fecha: string;
  // v2.5 · Capa 4: ya decidido por el servidor (Capa 2,
  // M10-RN-008/LabReferenceRangeService.evaluateForAnalyte) — el
  // modelo correlaciona sobre esto, nunca lo redecide.
  estado: "normal" | "low" | "high" | "critical" | "unknown";
}

export interface AssistantTrajectoryNoteBlock {
  fecha: string;
  tipoConsulta: string;
  motivoConsulta: string;
  valoracion: string;
  plan: string;
}

// "por campos", tal como llegan de ClinicalEncounter.draftContent —
// mismas claves que clinicalNoteDraftUpdateSchema. Todas opcionales:
// es la nota TAL COMO VA, no una nota completa.
export interface AssistantCurrentNoteBlock {
  motivoConsulta?: string;
  padecimientoActual?: string;
  exploracionFisica?: string;
  valoracion?: string;
  plan?: string;
  pronostico?: string;
  indicacionesPaciente?: string;
  proximaCitaDias?: number;
}

export interface AssistantScaleBlock {
  escala: string;
  valor: number;
  interpretacion: string | null;
}

export interface AssistantEncounterDiagnosisBlock {
  codigoIcd10: string | null;
  descripcion: string;
  tipo: string;
  certeza: string;
}

export interface AssistantRedFlagBlock {
  hallazgo: string;
  urgencia: string;
}

export interface AssistantEncounterDocumentsBlock {
  recetas: { medicamento: string; dosis: string; via: string; frecuencia: string; duracion: string }[];
  ordenesEstudio: { estudio: string; indicacion: string }[];
}

export interface AssistantEncuadreBlock {
  especialidad: string | null;
  tipoConsulta: string;
}

// "Bloque estable": paciente/seguridad/problemas/medicación/
// antecedentes/laboratorio/trayectoria — se arma una vez por consulta
// y se reutiliza entre los 4 pases (Prompt 51 decide el mecanismo de
// caché; aquí solo se separa para que ese seam exista).
export interface AssistantStableContext {
  paciente: AssistantPatientBlock;
  seguridad: AssistantAllergyBlock[];
  problemas: AssistantProblemBlock[];
  medicacion: AssistantMedicationBlock[];
  antecedentes: AssistantHistoryBlock[];
  toxicomanias: AssistantSubstanceUseBlock[];
  ginecoObstetricos: AssistantGynecoBlock | null;
  laboratorio: AssistantLabBlock[];
  signosVitalesPrevios: AssistantPreviousVitalsBlock[];
  trayectoria: AssistantTrajectoryNoteBlock[];
}

// "Bloque incremental": cambia en cada pase de la misma consulta.
export interface AssistantCurrentContext {
  actual: AssistantCurrentNoteBlock;
  signosVitales: AssistantVitalsBlock;
  escalas: AssistantScaleBlock[];
  sintomasAlarmaMarcados: string[];
  diagnosticosConsulta: AssistantEncounterDiagnosisBlock[];
  banderasRojasDetectadas: AssistantRedFlagBlock[];
  documentosConsulta: AssistantEncounterDocumentsBlock;
  encuadre: AssistantEncuadreBlock;
}

export type AssembledAssistantContext = AssistantStableContext & AssistantCurrentContext;

export interface AssembledAssistantContextResult {
  context: AssembledAssistantContext;
  hashContexto: string;
}
