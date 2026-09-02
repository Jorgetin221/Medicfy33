// Fase 8 · Prompt 50 (docs/medicfy-58-prompts.md, Bloque 9) — forma
// del contexto que el servidor arma para "El Segundo Lector". Vive
// solo aquí (no en packages/contracts): nunca cruza al frontend, solo
// del servidor al modelo. Por eso NO tiene campos de identidad — ver
// ContextAssemblerService para la SEUDONIMIZACIÓN.

export interface AssistantPatientBlock {
  edadAnios: number;
  sexo: "F" | "M";
  embarazo: { semanasGestacion: number; diasGestacion: number } | null;
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

export interface AssistantHistoryBlock {
  categoria: string;
  subtipo: string;
  parentesco: string | null;
  comentario: string | null;
}

export interface AssistantLabBlock {
  analito: string;
  valor: string;
  unidad: string;
  rangoMin: string | null;
  rangoMax: string | null;
  fecha: string;
}

export interface AssistantTrajectoryNoteBlock {
  fecha: string;
  tipoConsulta: string;
  motivoConsulta: string;
  valoracion: string;
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
  laboratorio: AssistantLabBlock[];
  trayectoria: AssistantTrajectoryNoteBlock[];
}

// "Bloque incremental": cambia en cada pase de la misma consulta.
export interface AssistantCurrentContext {
  actual: AssistantCurrentNoteBlock;
  encuadre: AssistantEncuadreBlock;
}

export type AssembledAssistantContext = AssistantStableContext & AssistantCurrentContext;

export interface AssembledAssistantContextResult {
  context: AssembledAssistantContext;
  hashContexto: string;
}
