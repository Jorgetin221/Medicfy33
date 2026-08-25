"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  clinicalNoteSignSchema,
  type ClinicalNoteDraftUpdateInput,
  type ClinicalNoteSignInput,
  type EncounterDiagnosisInput,
} from "@medicfy/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useEncounterAutosave } from "@/lib/use-encounter-autosave";
import { loadDraftLocally, clearDraftLocally } from "@/lib/offline-draft-store";
import { FieldWrapper, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/alert";
import { IndicadorGuardado } from "@/components/ui/save-indicator";
import { VitalsFields } from "@/components/clinical/vitals-fields";
import { Icd10Picker } from "@/components/clinical/icd10-picker";
import { NoteTemplateBar } from "@/components/clinical/note-template-bar";
import { PrescriptionPanel } from "@/components/clinical/prescription-panel";
import { LabOrderPanel } from "@/components/clinical/lab-order-panel";
import { AntecedentesEditor, AntecedentesSummary } from "@/components/clinical/antecedentes-editor";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { ENCOUNTER_TYPE_LABEL, type EncounterDetail } from "./types";

type FreeTextField = "chiefComplaint" | "currentIllness" | "physicalExam" | "assessment" | "plan" | "prognosis";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// DOC-06 — "la pantalla que decide todo" (CLAUDE.md §6). Autoguardado
// cada 10s (use-encounter-autosave), atajos de teclado, plantillas
// insertables por atajo, receta/orden sin salir de la pantalla.
export function ConsultaForm({
  accessToken,
  encounter,
  historyItems,
  onHistoryChanged,
  onSigned,
  onAbandoned,
}: {
  accessToken: string;
  encounter: EncounterDetail;
  historyItems: PatientHistoryItem[];
  onHistoryChanged: () => void;
  onSigned: () => void;
  onAbandoned: () => void;
}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [showAntecedentesEditor, setShowAntecedentesEditor] = useState(false);
  const [activeField, setActiveField] = useState<FreeTextField>("plan");
  const [rxPanelOpen, setRxPanelOpen] = useState(false);
  const [labPanelOpen, setLabPanelOpen] = useState(false);
  const [signError, setSignError] = useState<unknown>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.floor((Date.now() - new Date(encounter.startedAt).getTime()) / 1000));

  const form = useForm<ClinicalNoteSignInput>({
    resolver: zodResolver(clinicalNoteSignSchema),
    defaultValues: { chiefComplaint: "", currentIllness: "", vitals: {}, physicalExam: "", assessment: "", plan: "", prognosis: "", diagnoses: [] },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(encounter.startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [encounter.startedAt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadDraftLocally(encounter.id);
      const base = (local ?? encounter.draftContent ?? {}) as ClinicalNoteDraftUpdateInput;
      if (cancelled) return;
      form.reset({
        chiefComplaint: base.chiefComplaint ?? "",
        currentIllness: base.currentIllness ?? "",
        vitals: base.vitals ?? {},
        physicalExam: base.physicalExam ?? "",
        assessment: base.assessment ?? "",
        plan: base.plan ?? "",
        prognosis: base.prognosis ?? "",
        diagnoses: encounter.diagnoses.map((d) => ({
          description: d.description,
          diagnosisType: d.diagnosisType,
          certainty: d.certainty,
          ...(d.icd10Code ? { icd10Code: d.icd10Code } : { codeAbsentReason: d.codeAbsentReason ?? "" }),
        })),
      });
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // encounter.id identifica de forma única este montaje — reintentar
    // con cada cambio de referencia de `form`/`encounter` reiniciaría
    // el borrador en cada re-render.
  }, [encounter.id]);

  const watched = form.watch();
  const draftPatch: ClinicalNoteDraftUpdateInput = {
    chiefComplaint: watched.chiefComplaint,
    currentIllness: watched.currentIllness,
    vitals: watched.vitals,
    physicalExam: watched.physicalExam,
    assessment: watched.assessment,
    plan: watched.plan,
    prognosis: watched.prognosis,
  };

  const { saveState, saveNow, fatalError } = useEncounterAutosave({
    encounterId: encounter.id,
    accessToken,
    values: draftPatch,
    enabled: isHydrated,
  });

  useEffect(() => {
    if (fatalError instanceof ApiError && fatalError.code === "ENCOUNTER_ABANDONED") {
      onAbandoned();
    }
  }, [fatalError, onAbandoned]);

  const chiefComplaintField = form.register("chiefComplaint");
  const currentIllnessField = form.register("currentIllness");
  const physicalExamField = form.register("physicalExam");
  const assessmentField = form.register("assessment");
  const planField = form.register("plan");
  const prognosisField = form.register("prognosis");

  const chiefComplaintRef = useRef<HTMLTextAreaElement | null>(null);
  const currentIllnessRef = useRef<HTMLTextAreaElement | null>(null);
  const physicalExamRef = useRef<HTMLTextAreaElement | null>(null);
  const assessmentRef = useRef<HTMLTextAreaElement | null>(null);
  const planRef = useRef<HTMLTextAreaElement | null>(null);
  const prognosisRef = useRef<HTMLTextAreaElement | null>(null);
  const fieldRefs: Record<FreeTextField, React.RefObject<HTMLTextAreaElement | null>> = {
    chiefComplaint: chiefComplaintRef,
    currentIllness: currentIllnessRef,
    physicalExam: physicalExamRef,
    assessment: assessmentRef,
    plan: planRef,
    prognosis: prognosisRef,
  };

  const insertTemplate = useCallback(
    (content: string) => {
      const el = fieldRefs[activeField].current;
      const currentValue = form.getValues(activeField) ?? "";
      if (el) {
        const start = el.selectionStart ?? currentValue.length;
        const end = el.selectionEnd ?? currentValue.length;
        const newValue = currentValue.slice(0, start) + content + currentValue.slice(end);
        form.setValue(activeField, newValue, { shouldDirty: true });
        requestAnimationFrame(() => {
          el.focus();
          const pos = start + content.length;
          el.setSelectionRange(pos, pos);
        });
      } else {
        form.setValue(activeField, currentValue + (currentValue ? "\n" : "") + content, { shouldDirty: true });
      }
    },
    // fieldRefs es un objeto de refs estable entre renders (mismos
    // objetos useRef) — no necesita estar en deps.
    [activeField, form]
  );

  const diagnoses = form.watch("diagnoses") ?? [];
  function handleDiagnosesChange(next: EncounterDiagnosisInput[]) {
    form.setValue("diagnoses", next, { shouldDirty: true, shouldValidate: true });
  }
  // RHF ubica el error de un arreglo de nivel raíz (min 1) en .message
  // o en .root.message según la versión — cubrimos ambos en vez de
  // adivinar cuál aplica exactamente a react-hook-form@7.54.
  const diagnosesFieldError = form.formState.errors.diagnoses as { message?: string; root?: { message?: string } } | undefined;
  const diagnosesErrorMessage = diagnosesFieldError?.message ?? diagnosesFieldError?.root?.message;

  async function onSign(values: ClinicalNoteSignInput) {
    setSignError(null);
    setIsSigning(true);
    try {
      await apiFetch(`/records/encounters/${encounter.id}/sign`, { method: "POST", accessToken, body: values });
      await clearDraftLocally(encounter.id);
      onSigned();
    } catch (error) {
      if (error instanceof ApiError && error.code === "ENCOUNTER_ABANDONED") {
        onAbandoned();
      } else {
        setSignError(error);
      }
      setIsSigning(false);
    }
  }

  const handleSignSubmit = form.handleSubmit(onSign);

  function handleSignClick() {
    if (!window.confirm("¿Firmar esta consulta? Una vez firmada, la nota no se puede editar — solo corregir con una nota nueva.")) return;
    void handleSignSubmit();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (isMod && e.key === "Enter") {
        e.preventDefault();
        handleSignClick();
      } else if (e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setRxPanelOpen(true);
      } else if (e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setLabPanelOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNow, handleSignSubmit]);

  const principalDiagnosis = diagnoses.find((d) => d.diagnosisType === "PRINCIPAL")?.description ?? watched.assessment ?? "";

  return (
    <div className="flex flex-1 flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-300 bg-white p-3">
        <div>
          <p className="text-base font-medium text-brand-900">{ENCOUNTER_TYPE_LABEL[encounter.encounterType]}</p>
          <p className="text-sm text-gray-500">Tiempo transcurrido: {formatElapsed(elapsedSeconds)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorGuardado state={saveState} />
          <Button type="button" variant="secondary" onClick={() => setLabPanelOpen(true)} className="min-h-11 px-3 text-sm">
            Ordenar laboratorio <span className="ml-1 text-gray-400">Alt+L</span>
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRxPanelOpen(true)} className="min-h-11 px-3 text-sm">
            Emitir receta <span className="ml-1 text-gray-400">Alt+R</span>
          </Button>
        </div>
      </div>

      <NoteTemplateBar accessToken={accessToken} onInsert={insertTemplate} pendingContent={form.getValues(activeField) ?? ""} />

      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6" noValidate>
        <FieldWrapper label="Motivo de consulta" htmlFor="chiefComplaint" error={form.formState.errors.chiefComplaint?.message}>
          <Textarea
            id="chiefComplaint"
            rows={2}
            error={!!form.formState.errors.chiefComplaint}
            {...chiefComplaintField}
            ref={(el) => {
              chiefComplaintField.ref(el);
              fieldRefs.chiefComplaint.current = el;
            }}
            onFocus={() => setActiveField("chiefComplaint")}
          />
        </FieldWrapper>

        <FieldWrapper label="Padecimiento actual" htmlFor="currentIllness" error={form.formState.errors.currentIllness?.message}>
          <Textarea
            id="currentIllness"
            rows={4}
            error={!!form.formState.errors.currentIllness}
            {...currentIllnessField}
            ref={(el) => {
              currentIllnessField.ref(el);
              fieldRefs.currentIllness.current = el;
            }}
            onFocus={() => setActiveField("currentIllness")}
          />
        </FieldWrapper>

        <section>
          <h2 className="mb-2 text-base font-semibold text-gray-900">Antecedentes</h2>
          {encounter.encounterType === "FIRST_VISIT" ? (
            // M8-RN-012 "Modo Historia Clínica (primera vez)": los
            // antecedentes se capturan aquí — viven en el paciente, no
            // en este encuentro, así que se guardan de inmediato por
            // ítem (AntecedentesEditor), no como parte del draft/firma.
            <AntecedentesEditor patientId={encounter.patientId} accessToken={accessToken} historyItems={historyItems} onChanged={onHistoryChanged} />
          ) : (
            // M8-RN-012 "Modo Nota de Evolución": "se muestran de la
            // consulta anterior, editables, no se recapturan" — resumen
            // colapsado por default, el mismo editor queda un clic
            // atrás si algo cambió.
            <div className="flex flex-col gap-2">
              <AntecedentesSummary historyItems={historyItems} />
              <Button type="button" variant="secondary" className="w-fit" onClick={() => setShowAntecedentesEditor((v) => !v)}>
                {showAntecedentesEditor ? "Ocultar antecedentes" : "Actualizar antecedentes"}
              </Button>
              {showAntecedentesEditor && (
                <AntecedentesEditor patientId={encounter.patientId} accessToken={accessToken} historyItems={historyItems} onChanged={onHistoryChanged} />
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-gray-900">Signos vitales</h2>
          <VitalsFields form={form} />
        </section>

        <FieldWrapper label="Exploración física (opcional)" htmlFor="physicalExam">
          <Textarea
            id="physicalExam"
            rows={4}
            {...physicalExamField}
            ref={(el) => {
              physicalExamField.ref(el);
              fieldRefs.physicalExam.current = el;
            }}
            onFocus={() => setActiveField("physicalExam")}
          />
        </FieldWrapper>

        <section>
          <h2 className="mb-2 text-base font-semibold text-gray-900">Diagnósticos</h2>
          <Icd10Picker accessToken={accessToken} selected={diagnoses} onChange={handleDiagnosesChange} />
          {diagnosesErrorMessage ? (
            <p role="alert" className="mt-1 flex items-center gap-1 text-sm text-danger-600">
              <span aria-hidden="true">⚠</span> {diagnosesErrorMessage}
            </p>
          ) : null}
        </section>

        <FieldWrapper label="Análisis" htmlFor="assessment" error={form.formState.errors.assessment?.message}>
          <Textarea
            id="assessment"
            rows={3}
            error={!!form.formState.errors.assessment}
            {...assessmentField}
            ref={(el) => {
              assessmentField.ref(el);
              fieldRefs.assessment.current = el;
            }}
            onFocus={() => setActiveField("assessment")}
          />
        </FieldWrapper>

        <FieldWrapper label="Plan" htmlFor="plan" error={form.formState.errors.plan?.message}>
          <Textarea
            id="plan"
            rows={3}
            error={!!form.formState.errors.plan}
            {...planField}
            ref={(el) => {
              planField.ref(el);
              fieldRefs.plan.current = el;
            }}
            onFocus={() => setActiveField("plan")}
          />
        </FieldWrapper>

        <FieldWrapper label="Pronóstico (opcional)" htmlFor="prognosis">
          <Textarea
            id="prognosis"
            rows={2}
            {...prognosisField}
            ref={(el) => {
              prognosisField.ref(el);
              fieldRefs.prognosis.current = el;
            }}
            onFocus={() => setActiveField("prognosis")}
          />
        </FieldWrapper>

        {signError ? (
          <Aviso variant="critico" title="No se pudo firmar la consulta">
            {signError instanceof ApiError ? signError.message : "Intenta de nuevo."}
          </Aviso>
        ) : null}
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-300 bg-white p-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-2">
          <IndicadorGuardado state={saveState} />
          <Button type="button" isLoading={isSigning} onClick={handleSignClick} className="px-6">
            Firmar consulta <span className="ml-1 opacity-70">⌘/Ctrl+Enter</span>
          </Button>
        </div>
      </div>

      <PrescriptionPanel
        open={rxPanelOpen}
        onClose={() => setRxPanelOpen(false)}
        accessToken={accessToken}
        encounterId={encounter.id}
        defaultDiagnosis={principalDiagnosis}
        onIssued={() => void saveNow()}
      />
      <LabOrderPanel open={labPanelOpen} onClose={() => setLabPanelOpen(false)} accessToken={accessToken} encounterId={encounter.id} onIssued={() => void saveNow()} />
    </div>
  );
}
