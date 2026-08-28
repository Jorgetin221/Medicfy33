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
import { FieldWrapper, Textarea, TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Aviso } from "@/components/ui/alert";
import { IndicadorGuardado } from "@/components/ui/save-indicator";
import { VitalsFields } from "@/components/clinical/vitals-fields";
import { EscalasSection } from "@/components/clinical/escalas-section";
import { EmisionDocumentos } from "@/components/clinical/emision-documentos";
import { Icd10Picker } from "@/components/clinical/icd10-picker";
import { NoteTemplateBar } from "@/components/clinical/note-template-bar";
import { AntecedentesEditor, AntecedentesSummary } from "@/components/clinical/antecedentes-editor";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { ENCOUNTER_TYPE_LABEL, patientAgeYears, type EncounterDetail } from "./types";

type FreeTextField = "chiefComplaint" | "currentIllness" | "physicalExam" | "assessment" | "plan" | "prognosis";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const RAW_VITALS_KEYS = ["bpSystolic", "bpDiastolic", "heartRate", "respiratoryRate", "tempC", "spo2", "weightKg", "heightCm"] as const;

// El draftContent que guarda el servidor trae vitals con bmi/bmiFormula/
// bmiFormulaVersion ya mezclados (withComputedVitals, backend) —
// vitalsSchema es .strict(), así que hay que quitarlos al hidratar o
// el siguiente autoguardado los reenviaría y el servidor los
// rechazaría con 400.
function stripComputedVitals(vitals: Record<string, unknown>): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const key of RAW_VITALS_KEYS) {
    const value = vitals[key];
    if (typeof value === "number") raw[key] = value;
  }
  return raw;
}

// Mismo problema para specialtyData: el servidor guarda
// {fieldKey: {value, interpretation?}} (SpecialtyScaleService); el
// formulario y el contrato solo aceptan fieldKey -> número crudo.
function unwrapSpecialtyData(specialtyData: Record<string, unknown>): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const [key, entry] of Object.entries(specialtyData)) {
    if (entry && typeof entry === "object" && "value" in entry && typeof (entry as { value: unknown }).value === "number") {
      raw[key] = (entry as { value: number }).value;
    }
  }
  return raw;
}

// DOC-06 — "la pantalla que decide todo" (CLAUDE.md §6). Autoguardado
// cada 10s (use-encounter-autosave), atajos de teclado, plantillas
// insertables por atajo, receta/orden sin salir de la pantalla.
export function ConsultaForm({
  accessToken,
  encounter,
  historyItems,
  patientBirthDate,
  onHistoryChanged,
  onSigned,
  onAbandoned,
}: {
  accessToken: string;
  encounter: EncounterDetail;
  historyItems: PatientHistoryItem[];
  patientBirthDate: string | null;
  onHistoryChanged: () => void;
  onSigned: () => void;
  onAbandoned: () => void;
}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [showAntecedentesEditor, setShowAntecedentesEditor] = useState(false);
  const [activeField, setActiveField] = useState<FreeTextField>("plan");
  const [signError, setSignError] = useState<unknown>(null);
  const [isSigning, setIsSigning] = useState(false);
  // Fase 6 · Prompt 43: firmar exige reautenticación (password+TOTP,
  // SignatureVerificationService en servidor). El panel de reauth ES
  // la confirmación — reemplaza el window.confirm() que había antes,
  // porque escribir contraseña+código es una confirmación más fuerte
  // que un diálogo nativo.
  const [showReauthPanel, setShowReauthPanel] = useState(false);
  // Fase 4b: receta/estudios ya se pueden emitir contra la nota en
  // borrador (encounter-editable.util.ts, backend) — mientras el
  // panel de EmisionDocumentos esté abierto con edición sin guardar,
  // no se deja firmar para no perderla.
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.floor((Date.now() - new Date(encounter.startedAt).getTime()) / 1000));
  // M8-RN-013 / CLAUDE.md §6: el objetivo del modo — el límite alto de
  // cada rango (15 y 4 min). La métrica real la fija el servidor al
  // firmar (timeToSignSeconds); esto es solo la señal en pantalla.
  const targetSeconds = encounter.encounterType === "FIRST_VISIT" ? 15 * 60 : 4 * 60;
  const targetLabel = encounter.encounterType === "FIRST_VISIT" ? "12–15 min" : "3–4 min";

  const form = useForm<ClinicalNoteSignInput>({
    resolver: zodResolver(clinicalNoteSignSchema),
    defaultValues: {
      chiefComplaint: "",
      currentIllness: "",
      vitals: {},
      specialtyData: {},
      physicalExam: "",
      assessment: "",
      plan: "",
      prognosis: "",
      diagnoses: [],
      password: "",
      totpCode: "",
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - new Date(encounter.startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [encounter.startedAt]);

  // Punto de scroll → sessionStorage (rebote de 500ms), para que la
  // recarga recupere también dónde estaba leyendo/escribiendo.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    function handleScroll() {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        try {
          sessionStorage.setItem(`medicfy:scroll:${encounter.id}`, String(window.scrollY));
        } catch {
          // sin sessionStorage simplemente no se restaura el scroll
        }
      }, 500);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [encounter.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadDraftLocally(encounter.id);
      const base = (local ?? encounter.draftContent ?? {}) as ClinicalNoteDraftUpdateInput;
      if (cancelled) return;
      form.reset({
        chiefComplaint: base.chiefComplaint ?? "",
        currentIllness: base.currentIllness ?? "",
        vitals: stripComputedVitals(base.vitals ?? {}),
        specialtyData: unwrapSpecialtyData(base.specialtyData ?? {}),
        physicalExam: base.physicalExam ?? "",
        assessment: base.assessment ?? "",
        plan: base.plan ?? "",
        prognosis: base.prognosis ?? "",
        // Prompt 37 (F4): indicaciones al paciente y próxima cita
        // también sobreviven en el borrador.
        ...(base.patientInstructions !== undefined ? { patientInstructions: base.patientInstructions } : {}),
        ...(base.suggestedFollowUpDays !== undefined ? { suggestedFollowUpDays: base.suggestedFollowUpDays } : {}),
        diagnoses: encounter.diagnoses.map((d) => ({
          description: d.description,
          diagnosisType: d.diagnosisType,
          certainty: d.certainty,
          ...(d.icd10Code ? { icd10Code: d.icd10Code } : { codeAbsentReason: d.codeAbsentReason ?? "" }),
        })),
      });
      setIsHydrated(true);
      // Prompt 15: restaurar el punto de scroll tras recargar.
      // sessionStorage: es posición de UI, no dato clínico (CLAUDE.md
      // §5 prohíbe storage del navegador para datos clínicos, no para
      // esto), y sobrevive exactamente a la recarga que nos importa.
      try {
        const savedScroll = sessionStorage.getItem(`medicfy:scroll:${encounter.id}`);
        if (savedScroll) requestAnimationFrame(() => window.scrollTo(0, Number(savedScroll)));
      } catch {
        // sin sessionStorage no hay restauración — no es fatal
      }
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
    specialtyData: watched.specialtyData,
    physicalExam: watched.physicalExam,
    assessment: watched.assessment,
    plan: watched.plan,
    prognosis: watched.prognosis,
    ...(watched.patientInstructions !== undefined && watched.patientInstructions !== "" ? { patientInstructions: watched.patientInstructions } : {}),
    ...(watched.suggestedFollowUpDays !== undefined && !Number.isNaN(watched.suggestedFollowUpDays) ? { suggestedFollowUpDays: watched.suggestedFollowUpDays } : {}),
  };

  const { saveState, lastSavedAt, saveNow, fatalError } = useEncounterAutosave({
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

  async function onSign(rawValues: ClinicalNoteSignInput) {
    // Campos opcionales de F4: vacío = no viaja (no se firma "").
    const values: ClinicalNoteSignInput = { ...rawValues };
    if (!values.patientInstructions?.trim()) delete values.patientInstructions;
    if (values.suggestedFollowUpDays === undefined || Number.isNaN(values.suggestedFollowUpDays)) delete values.suggestedFollowUpDays;
    setSignError(null);
    setIsSigning(true);
    try {
      await apiFetch(`/records/encounters/${encounter.id}/sign`, { method: "POST", accessToken, body: values });
      await clearDraftLocally(encounter.id);
      onSigned();
    } catch (error) {
      if (error instanceof ApiError && error.code === "ENCOUNTER_ABANDONED") {
        onAbandoned();
      } else if (error instanceof ApiError && error.code === "SIGNATURE_MFA_REQUIRED") {
        // Contraseña/código incorrectos o MFA sin activar — se queda en
        // el panel de reauth, nunca en el resto de la nota, y limpia
        // el código (no la contraseña: un solo dígito mal tecleado no
        // debería obligar a reescribir todo).
        form.resetField("totpCode");
        setSignError(error);
      } else if (error instanceof ApiError && error.code === "VITALS_CRITICAL_CONFIRMATION_REQUIRED") {
        // Prompt 26: un signo vital CRÍTICO exige confirmación
        // explícita del médico — se le muestra cuáles y confirma.
        const fields = ((error.details as { criticalFields?: string[] } | undefined)?.criticalFields ?? []).join(", ");
        const confirmed = window.confirm(
          `⚠ Signos vitales en rango CRÍTICO: ${fields}.\n\n¿Confirmas que los valores capturados son correctos? La nota se firmará con la marca de valor crítico.`
        );
        if (confirmed) {
          try {
            await apiFetch(`/records/encounters/${encounter.id}/sign`, {
              method: "POST",
              accessToken,
              body: { ...values, criticalVitalsConfirmed: true },
            });
            await clearDraftLocally(encounter.id);
            onSigned();
            return;
          } catch (retryError) {
            setSignError(retryError);
          }
        }
      } else {
        setSignError(error);
      }
      setIsSigning(false);
    }
  }

  const handleSignSubmit = form.handleSubmit(onSign);

  function handleSignClick() {
    if (planPanelOpen) return;
    setShowReauthPanel(true);
  }

  function closeReauthPanel() {
    setShowReauthPanel(false);
    setSignError(null);
    form.resetField("password");
    form.resetField("totpCode");
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
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNow, handleSignSubmit]);

  return (
    <div className="flex flex-1 flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-300 bg-white p-3">
        <div>
          <p className="text-base font-medium text-brand-900">{ENCOUNTER_TYPE_LABEL[encounter.encounterType]}</p>
          {/* CLAUDE.md §6: dos modos con tiempo objetivo — Historia
              Clínica 12–15 min, Nota de Evolución 3–4 min. Rebasado el
              objetivo lo dice el TEXTO además del color (el color
              nunca es el único portador de significado). */}
          <p className={`text-sm ${elapsedSeconds > targetSeconds ? "font-medium text-warn-600" : "text-gray-500"}`}>
            Tiempo transcurrido: {formatElapsed(elapsedSeconds)} · objetivo {targetLabel}
            {elapsedSeconds > targetSeconds ? " — rebasado" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorGuardado state={saveState} lastSavedAt={lastSavedAt} />
          {/* Prompt 32 (F4): "la receta pertenece a una nota firmada;
              un borrador no emite recetas" — receta, órdenes e
              indicaciones se emiten AL FIRMAR, en la vista siguiente. */}
          <p className="text-sm text-gray-500">Receta y órdenes se emiten al firmar la consulta.</p>
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
          <VitalsFields form={form} patientAgeYears={patientBirthDate ? patientAgeYears(patientBirthDate) : null} />
        </section>

        <EscalasSection
          accessToken={accessToken}
          values={watched.specialtyData ?? {}}
          onChange={(next) => form.setValue("specialtyData", next, { shouldDirty: true })}
          patientAgeYears={patientBirthDate ? patientAgeYears(patientBirthDate) : null}
        />

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

        <EmisionDocumentos
          accessToken={accessToken}
          encounterId={encounter.id}
          patientId={encounter.patientId}
          defaultDiagnosis={diagnoses.find((d) => d.diagnosisType === "PRINCIPAL")?.description ?? ""}
          hasPatientInstructions={false}
          onOpenStateChange={setPlanPanelOpen}
        />

        {/* Prompt 37 (F4): lo que el PACIENTE se lleva — lenguaje
            llano, separado de la nota técnica; se imprime como PDF
            propio desde la nota firmada. */}
        <FieldWrapper
          label="Indicaciones al paciente (opcional)"
          htmlFor="patientInstructions"
          hint="Qué hacer, cuidados y signos de alarma, en palabras para el paciente. Se imprime como documento aparte."
        >
          <Textarea id="patientInstructions" rows={3} {...form.register("patientInstructions")} />
        </FieldWrapper>

        <FieldWrapper label="Próxima cita sugerida (días, opcional)" htmlFor="suggestedFollowUpDays">
          <TextInput
            id="suggestedFollowUpDays"
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            className="max-w-40"
            {...form.register("suggestedFollowUpDays", {
              setValueAs: (v: string) => (v === "" || v === null ? undefined : Number(v)),
            })}
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

      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-300 bg-white p-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-3">
            <IndicadorGuardado state={saveState} lastSavedAt={lastSavedAt} />
            {planPanelOpen ? (
              <span className="text-sm text-warn-600">Cierra el panel de receta/estudios para firmar.</span>
            ) : null}
          </div>
          <Button type="button" isLoading={isSigning} disabled={planPanelOpen} onClick={handleSignClick} className="px-6">
            Firmar y cerrar consulta <span className="ml-1 opacity-70">⌘/Ctrl+Enter</span>
          </Button>
        </div>
      </div>

      {/* Fase 6 · Prompt 43: reautenticación obligatoria para firmar —
          el panel ES la confirmación (reemplaza el window.confirm()
          que había antes). Los campos password/totpCode viven en el
          MISMO form de react-hook-form que el resto de la nota —
          register() no depende de dónde en el DOM se monte el campo,
          así que handleSignSubmit (form.handleSubmit(onSign)) los
          incluye igual que cualquier otro campo de la nota. */}
      <Panel open={showReauthPanel} onClose={closeReauthPanel} title="Confirma tu identidad para firmar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSignSubmit();
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <p className="text-base text-gray-700">
            Una vez firmada, esta consulta no se puede editar — solo corregir con una nota nueva (adenda).
          </p>
          <FieldWrapper label="Contraseña" htmlFor="sign-password" error={form.formState.errors.password?.message}>
            <TextInput id="sign-password" type="password" autoComplete="current-password" error={!!form.formState.errors.password} {...form.register("password")} />
          </FieldWrapper>
          <FieldWrapper label="Código de verificación (TOTP)" htmlFor="sign-totp-code" error={form.formState.errors.totpCode?.message}>
            <TextInput
              id="sign-totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              error={!!form.formState.errors.totpCode}
              {...form.register("totpCode")}
            />
          </FieldWrapper>
          {signError ? (
            <Aviso variant="critico" title="No se pudo firmar la consulta">
              {signError instanceof ApiError ? signError.message : "Intenta de nuevo."}
            </Aviso>
          ) : null}
          <div className="flex gap-3">
            <Button type="submit" isLoading={isSigning} className="px-6">
              Firmar
            </Button>
            <Button type="button" variant="secondary" onClick={closeReauthPanel}>
              Cancelar
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
