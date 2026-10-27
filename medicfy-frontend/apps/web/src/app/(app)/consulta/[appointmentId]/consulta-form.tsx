"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  clinicalNoteSignSchema,
  type ClinicalNoteDraftUpdateInput,
  type ClinicalNoteSignInput,
  type EncounterDiagnosisInput,
} from "@medicfy/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useEncounterAutosave } from "@/lib/use-encounter-autosave";
import { loadDraftRecordLocally, clearDraftLocally } from "@/lib/offline-draft-store";
import { FieldWrapper, Textarea, TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Aviso } from "@/components/ui/alert";
import { IndicadorGuardado } from "@/components/ui/save-indicator";
import { VitalsFields } from "@/components/clinical/vitals-fields";
import { EscalasSection } from "@/components/clinical/escalas-section";
import { EmisionDocumentos } from "@/components/clinical/emision-documentos";
import { Icd10Picker } from "@/components/clinical/icd10-picker";
import { NoteTemplateBar } from "@/components/clinical/note-template-bar";
import { AntecedentesEditor, AntecedentesSummary } from "@/components/clinical/antecedentes-editor";
import type { PatientHistoryItem } from "@/lib/use-patient-clinical";
import { ENCOUNTER_TYPE_LABEL_KEY, patientAgeYears, type EncounterDetail } from "./types";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

type FreeTextField = "chiefComplaint" | "currentIllness" | "physicalExam" | "assessment" | "plan" | "prognosis";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Mismos campos que VitalsFields: los perímetros faltaban aquí y se
// perdían al recargar el borrador.
const RAW_VITALS_KEYS = [
  "bpSystolic",
  "bpDiastolic",
  "heartRate",
  "respiratoryRate",
  "tempC",
  "spo2",
  "weightKg",
  "heightCm",
  "headCircumferenceCm",
  "abdominalCircumferenceCm",
] as const;

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
    if (entry && typeof entry === "object" && "value" in entry && typeof entry.value === "number") {
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
  appointmentId,
  encounter,
  historyItems,
  patientBirthDate,
  onHistoryChanged,
  onSigned,
  onAbandoned,
  onClosedWithoutNote,
  insideModal = false,
}: {
  accessToken: string;
  // M5-RN-006 ("cerrar sin nota"): necesita la cita, no solo el
  // encuentro — la transición que cierra vive en /appointments/:id,
  // nunca en /records/encounters/:id. Toda consulta tiene una cita
  // real detrás (incluida "iniciar consulta sin cita", que crea una
  // al vuelo — ver startWalkInAppointment), así que ya no es opcional.
  appointmentId: string;
  encounter: EncounterDetail;
  historyItems: PatientHistoryItem[];
  patientBirthDate: string | null;
  onHistoryChanged: () => void;
  onSigned: () => void;
  onAbandoned: () => void;
  onClosedWithoutNote: () => void;
  // Pedido explícito del usuario (2026-10-27): este mismo formulario se
  // monta también dentro del modal de teleconsulta (consulta-screen.tsx).
  // La barra de firma de abajo es `fixed` al viewport real en la
  // pantalla normal (a propósito: debe verse siempre, empezando donde
  // termina el rail de navegación — ver --app-rail-width). Dentro del
  // modal no hay rail que esquivar y `fixed` se saldría de la caja del
  // modal, así que ahí se vuelve `sticky` al contenedor con scroll que
  // ya la envuelve (consulta-screen.tsx).
  insideModal?: boolean;
}) {
  const t = useT();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [isHydrated, setIsHydrated] = useState(false);
  // M5-RN-006, pedido explícito del usuario (2026-10-27): "cerrar sin
  // nota" ya existía desde la Agenda (lista de citas) — este es el
  // mismo camino, expuesto también desde dentro de DOC-06, para no
  // obligar al médico a salir de la consulta para encontrarlo.
  const [showCloseWithoutNote, setShowCloseWithoutNote] = useState(false);
  const [closeJustification, setCloseJustification] = useState("");
  const [isClosingWithoutNote, setIsClosingWithoutNote] = useState(false);
  const [closeWithoutNoteError, setCloseWithoutNoteError] = useState<unknown>(null);

  async function closeWithoutNote() {
    if (closeJustification.trim().length < 10) return;
    setIsClosingWithoutNote(true);
    setCloseWithoutNoteError(null);
    try {
      await apiFetch(`/appointments/${appointmentId}/complete`, {
        method: "POST",
        accessToken,
        body: { justification: closeJustification.trim() },
      });
      onClosedWithoutNote();
    } catch (error) {
      setCloseWithoutNoteError(error);
    } finally {
      setIsClosingWithoutNote(false);
    }
  }
  const [showAntecedentesEditor, setShowAntecedentesEditor] = useState(false);
  const [activeField, setActiveField] = useState<FreeTextField>("plan");
  const [signError, setSignError] = useState<unknown>(null);
  const [isSigning, setIsSigning] = useState(false);
  // Cerrar la consulta: confirmación explícita "¿Desea cerrar la
  // consulta?" (sin contraseña desde 2026-10-16, decisión del usuario)
  // y, al firmar, el aviso "Consulta terminada" antes de salir de la
  // pantalla.
  const [showConfirm, setShowConfirm] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [missingFields, setMissingFields] = useState(false);
  // La barra fija de firma publica su altura (--consulta-footer-height)
  // para que los paneles laterales terminen encima de ella y no debajo.
  const footerRef = useRef<HTMLDivElement | null>(null);
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
    resolver: useZodResolver<ClinicalNoteSignInput>(clinicalNoteSignSchema),
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
    },
  });

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--consulta-footer-height", `${footer.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consulta-footer-height");
    };
  }, []);

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
    void (async () => {
      // A-20: el respaldo local solo gana si es MÁS NUEVO que lo que
      // tiene el servidor. Antes ganaba siempre: un respaldo viejo de
      // otro día pisaba lo que el médico ya había guardado después
      // desde otro equipo.
      const localRecord = await loadDraftRecordLocally(encounter.id);
      const serverUpdatedAt = encounter.updatedAt ? new Date(encounter.updatedAt) : null;
      const localIsNewer = localRecord !== null && (serverUpdatedAt === null || localRecord.updatedAt > serverUpdatedAt);
      if (localRecord && !localIsNewer) await clearDraftLocally(encounter.id);
      const local = localIsNewer ? localRecord.draft : null;
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
        // Los diagnósticos del borrador (autoguardados) mandan; si no
        // hay, los ya guardados del encuentro.
        diagnoses:
          base.diagnoses && base.diagnoses.length > 0
            ? base.diagnoses
            : encounter.diagnoses.map((d) => ({
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
    // También se autoguardan: sobreviven una recarga y el asistente
    // clínico los ve antes de firmar.
    diagnoses: watched.diagnoses,
    ...(watched.patientInstructions !== undefined && watched.patientInstructions !== "" ? { patientInstructions: watched.patientInstructions } : {}),
    ...(watched.suggestedFollowUpDays !== undefined && !Number.isNaN(watched.suggestedFollowUpDays) ? { suggestedFollowUpDays: watched.suggestedFollowUpDays } : {}),
  };

  const { saveState, lastSavedAt, saveNow, fatalError, resolveConflict } = useEncounterAutosave({
    encounterId: encounter.id,
    accessToken,
    values: draftPatch,
    enabled: isHydrated,
    initialDraftVersion: encounter.draftVersion,
  });
  const hasDraftConflict = fatalError instanceof ApiError && fatalError.code === "DRAFT_CONFLICT";

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
    // v2.5 · Capa 3: labResultAnalyteIds lo maneja LabAnalytesPanel
    // (pestaña Resultados, componente hermano), autoguardado vía su
    // propio PATCH — este formulario no lo registra como campo. Se
    // relee fresco del encuentro justo antes de firmar (en vez de
    // confiar en el `encounter` de props, que puede estar desfasado
    // respecto al último PATCH de ese panel) para que la selección
    // real llegue a la nota firmada.
    try {
      const fresh = await apiFetch<EncounterDetail>(`/records/encounters/${encounter.id}`, { accessToken });
      const freshIds = fresh.draftContent.labResultAnalyteIds;
      if (Array.isArray(freshIds) && freshIds.length > 0) {
        values.labResultAnalyteIds = freshIds as string[];
      }
    } catch {
      // Si esta relectura falla, se firma sin sección de laboratorio
      // en vez de bloquear la firma por completo — el resto de la
      // nota no depende de esto.
    }
    setSignError(null);
    setIsSigning(true);
    try {
      await apiFetch(`/records/encounters/${encounter.id}/sign`, { method: "POST", accessToken, body: values });
      await clearDraftLocally(encounter.id);
      finishConsultation();
    } catch (error) {
      if (error instanceof ApiError && error.code === "ENCOUNTER_ABANDONED") {
        onAbandoned();
      } else if (error instanceof ApiError && error.code === "VITALS_CRITICAL_CONFIRMATION_REQUIRED") {
        // Prompt 26: un signo vital CRÍTICO exige confirmación
        // explícita del médico — se le muestra cuáles y confirma.
        const fields = ((error.details as { criticalFields?: string[] } | undefined)?.criticalFields ?? []).join(", ");
        // M-26: diálogo propio (traducido, accesible) en vez de window.confirm.
        const confirmed = await confirm({
          title: t("consulta.firma.vitalesCriticosTitulo"),
          body: t("consulta.firma.vitalesCriticosCuerpo", { campos: fields }),
          confirmLabel: t("consulta.firma.vitalesCriticosConfirmar"),
        });
        if (confirmed) {
          try {
            await apiFetch(`/records/encounters/${encounter.id}/sign`, {
              method: "POST",
              accessToken,
              body: { ...values, criticalVitalsConfirmed: true },
            });
            await clearDraftLocally(encounter.id);
            finishConsultation();
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

  function finishConsultation() {
    setShowConfirm(false);
    setIsSigning(false);
    setIsFinished(true);
  }

  // Si falta un campo obligatorio, se cierra la confirmación para que el
  // médico vea en la nota qué campo marcó la validación.
  const handleSignSubmit = form.handleSubmit(onSign, () => {
    setShowConfirm(false);
    setMissingFields(true);
  });

  function handleSignClick() {
    if (planPanelOpen || isFinished) return;
    setSignError(null);
    setMissingFields(false);
    setShowConfirm(true);
  }

  function closeConfirm() {
    if (isSigning) return;
    setShowConfirm(false);
    setSignError(null);
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
    <>
      {confirmDialog}
      <div className={insideModal ? "flex h-full flex-col" : "flex flex-1 flex-col gap-6 pb-24"}>
        {/* Pantalla normal: estos campos son hijos directos de arriba
            (gap-6 ya los separa) y la página entera hace scroll —
            `contents` los deja así, sin crear una caja nueva. Dentro del
            modal: este div pasa a ser el único que hace scroll, así el
            footer de abajo queda fuera, siempre visible, sin dejar
            espacio muerto cuando la nota es corta. */}
        <div className={insideModal ? "flex flex-1 flex-col gap-6 overflow-y-auto p-6" : "contents"}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-300 bg-white p-3">
          <div>
            <p className="text-base font-medium text-brand-900">{t(ENCOUNTER_TYPE_LABEL_KEY[encounter.encounterType])}</p>
            {/* CLAUDE.md §6: dos modos con tiempo objetivo — Historia
                Clínica 12–15 min, Nota de Evolución 3–4 min. Rebasado el
                objetivo lo dice el TEXTO además del color (el color
                nunca es el único portador de significado). */}
            <p className={`text-sm ${elapsedSeconds > targetSeconds ? "font-medium text-warn-600" : "text-gray-500"}`}>
              {t("consulta.tiempo", { transcurrido: formatElapsed(elapsedSeconds), objetivo: targetLabel })}
              {elapsedSeconds > targetSeconds ? t("consulta.rebasado") : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <IndicadorGuardado state={saveState} lastSavedAt={lastSavedAt} />
            {/* Prompt 32 (F4): "la receta pertenece a una nota firmada;
                un borrador no emite recetas" — receta, órdenes e
                indicaciones se emiten AL FIRMAR, en la vista siguiente. */}
            <p className="text-sm text-gray-500">{t("consulta.emisionAlFirmar")}</p>
          </div>
        </div>

        {hasDraftConflict ? (
          <Aviso variant="advertencia" title={t("consulta.conflictoBorrador.titulo")}>
            <p className="mb-3 text-base">{t("consulta.conflictoBorrador.cuerpo")}</p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void resolveConflict("mine")}>
                {t("consulta.conflictoBorrador.conservarMia")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void resolveConflict("server")}>
                {t("consulta.conflictoBorrador.usarServidor")}
              </Button>
            </div>
          </Aviso>
        ) : null}

        <NoteTemplateBar accessToken={accessToken} onInsert={insertTemplate} pendingContent={form.getValues(activeField) ?? ""} />

        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6" noValidate>
          <FieldWrapper label={t("consulta.campos.motivoConsulta")} htmlFor="chiefComplaint" error={form.formState.errors.chiefComplaint?.message}>
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

          <FieldWrapper label={t("consulta.campos.padecimientoActual")} htmlFor="currentIllness" error={form.formState.errors.currentIllness?.message}>
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
            <h2 className="mb-2 text-base font-semibold text-gray-900">{t("consulta.campos.antecedentes")}</h2>
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
                  {showAntecedentesEditor ? t("consulta.campos.ocultarAntecedentes") : t("consulta.campos.actualizarAntecedentes")}
                </Button>
                {showAntecedentesEditor && (
                  <AntecedentesEditor patientId={encounter.patientId} accessToken={accessToken} historyItems={historyItems} onChanged={onHistoryChanged} />
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">{t("consulta.campos.signosVitales")}</h2>
            <VitalsFields form={form} patientAgeYears={patientBirthDate ? patientAgeYears(patientBirthDate) : null} />
          </section>

          <EscalasSection
            accessToken={accessToken}
            values={watched.specialtyData ?? {}}
            onChange={(next) => form.setValue("specialtyData", next, { shouldDirty: true })}
            patientAgeYears={patientBirthDate ? patientAgeYears(patientBirthDate) : null}
          />

          <FieldWrapper label={t("consulta.campos.exploracionFisica")} htmlFor="physicalExam">
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
            <h2 className="mb-2 text-base font-semibold text-gray-900">{t("consulta.campos.diagnosticos")}</h2>
            <Icd10Picker accessToken={accessToken} selected={diagnoses} onChange={handleDiagnosesChange} />
            {diagnosesErrorMessage ? (
              <p role="alert" className="mt-1 flex items-center gap-1 text-sm text-danger-600">
                <span aria-hidden="true">⚠</span> {diagnosesErrorMessage}
              </p>
            ) : null}
          </section>

          <FieldWrapper label={t("consulta.campos.analisis")} htmlFor="assessment" error={form.formState.errors.assessment?.message}>
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

          <FieldWrapper label={t("consulta.campos.plan")} htmlFor="plan" error={form.formState.errors.plan?.message}>
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
            label={t("consulta.campos.indicaciones")}
            htmlFor="patientInstructions"
            hint={t("consulta.campos.indicacionesAyuda")}
          >
            <Textarea id="patientInstructions" rows={3} {...form.register("patientInstructions")} />
          </FieldWrapper>

          <FieldWrapper label={t("consulta.campos.proximaCita")} htmlFor="suggestedFollowUpDays">
            <TextInput
              id="suggestedFollowUpDays"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              className="max-w-40"
              {...form.register("suggestedFollowUpDays", {
                setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
              })}
            />
          </FieldWrapper>

          <FieldWrapper label={t("consulta.campos.pronostico")} htmlFor="prognosis">
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
        </div>

        {/* Pantalla normal: fixed al viewport, empezando donde termina el
            rail (app-nav.tsx, --app-rail-width) — con inset-x-0 tapaba
            Perfil, idioma y Cerrar sesión. Dentro del modal de
            teleconsulta: fuera del contenedor con scroll de arriba, así
            que queda fijo al fondo del panel sin necesitar `fixed` ni el
            hueco del rail (ahí no hay rail que esquivar). */}
        <div
          ref={footerRef}
          className={
            insideModal
              ? "shrink-0 border-t border-gray-300 bg-white p-4"
              : "fixed bottom-0 left-0 right-0 z-20 border-t border-gray-300 bg-white p-4 md:left-[var(--app-rail-width,0px)]"
          }
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <IndicadorGuardado state={saveState} lastSavedAt={lastSavedAt} />
              {planPanelOpen ? (
                <span className="text-sm text-warn-600">{t("consulta.firma.cierraPanel")}</span>
              ) : null}
              {missingFields && !planPanelOpen ? (
                <span role="alert" className="text-sm text-warn-600">
                  {t("consulta.firma.faltanDatos")}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" disabled={planPanelOpen} onClick={() => setShowCloseWithoutNote(true)}>
                {t("agenda.acciones.cerrarSinNota")}
              </Button>
              <Button type="button" isLoading={isSigning} disabled={planPanelOpen} onClick={handleSignClick} className="px-6">
                {t("consulta.firma.firmarYCerrar")} <span className="ml-1 opacity-70">⌘/Ctrl+Enter</span>
              </Button>
            </div>
          </div>
        </div>

        <Modal open={showConfirm} onClose={closeConfirm} title={t("consulta.firma.confirmarTitulo")} size="dialog">
          <div className="flex flex-col gap-4">
            <p className="text-base text-gray-700">{t("consulta.firma.advertencia")}</p>
            {signError ? (
              <Aviso variant="error" title={t("consulta.firma.errorTitulo")}>
                {signError instanceof ApiError ? signError.message : t("consulta.firma.intentaDeNuevo")}
              </Aviso>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="button" isLoading={isSigning} onClick={() => void handleSignSubmit()} className="px-6">
                {t("consulta.firma.siCerrar")}
              </Button>
              <Button type="button" variant="secondary" disabled={isSigning} onClick={closeConfirm}>
                {t("common.acciones.cancelar")}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={showCloseWithoutNote}
          onClose={() => (isClosingWithoutNote ? undefined : setShowCloseWithoutNote(false))}
          title={t("consulta.cerrarSinNota.titulo")}
          size="dialog"
        >
          <div className="flex flex-col gap-4">
            <p className="text-base text-gray-700">{t("agenda.justificacionCierre")}</p>
            <label htmlFor="close-without-note-justification" className="text-sm font-medium text-gray-700">
              {t("consulta.cerrarSinNota.etiquetaJustificacion")}
            </label>
            <textarea
              id="close-without-note-justification"
              value={closeJustification}
              onChange={(e) => setCloseJustification(e.target.value)}
              minLength={10}
              className="min-h-[80px] w-full rounded-md border border-gray-300 bg-white p-3 text-base text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            />
            {closeWithoutNoteError ? (
              <Aviso variant="error" title={t("consulta.firma.errorTitulo")}>
                {closeWithoutNoteError instanceof ApiError ? closeWithoutNoteError.message : t("consulta.firma.intentaDeNuevo")}
              </Aviso>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                isLoading={isClosingWithoutNote}
                disabled={closeJustification.trim().length < 10}
                onClick={() => void closeWithoutNote()}
                className="px-6"
              >
                {t("agenda.acciones.confirmarCierre")}
              </Button>
              <Button type="button" variant="secondary" disabled={isClosingWithoutNote} onClick={() => setShowCloseWithoutNote(false)}>
                {t("common.acciones.cancelar")}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal open={isFinished} onClose={onSigned} title={t("consulta.firma.terminadaTitulo")} size="dialog">
          <div className="flex flex-col gap-4">
            <Aviso variant="exito" title={t("consulta.firma.terminadaTitulo")}>
              {t("consulta.firma.terminadaCuerpo")}
            </Aviso>
            <Button type="button" onClick={onSigned} className="w-fit px-6">
              {t("consulta.firma.aceptar")}
            </Button>
          </div>
        </Modal>
      </div>
    </>
  );
}
