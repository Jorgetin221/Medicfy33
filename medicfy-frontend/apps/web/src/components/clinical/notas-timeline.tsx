"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError, expectArray } from "@/lib/api-client";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { FieldWrapper, SelectInput, TextInput } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { useI18n, useT, type TranslateFn } from "@/lib/i18n/context";
import { formatDateTimeMedium } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";

const ENCOUNTER_TYPE_LABEL_KEY: Record<string, MessageKey> = {
  FIRST_VISIT: "consulta.sidebar.primeraVez",
  FOLLOW_UP: "consulta.sidebar.seguimiento",
  TELECONSULTATION: "tipoEncuentro.TELECONSULTATION",
  URGENT: "tipoEncuentro.URGENT",
};

interface NoteCancellation {
  cancelledAt: string;
  reasonFreeText: string | null;
  reasonTerm: { preferredTerm: string };
}

interface NoteBodyFields {
  id: string;
  chiefComplaint: string;
  currentIllness: string;
  physicalExam: string | null;
  assessment: string;
  plan: string;
  prognosis: string | null;
  createdAt: string;
  cancellation: NoteCancellation | null;
}

interface NoteThread {
  encounterId: string;
  encounterType: string;
  signedAt: string;
  doctor: { legalFirstName: string; legalLastName: string; primarySpecialty: { nameEs: string } | null };
  note: NoteBodyFields;
  corrections: NoteBodyFields[];
}

// Un tipo de encuentro que el servidor mande y no esté en el catálogo
// del cliente se muestra tal cual, no deja un hueco.
function encounterTypeLabel(t: TranslateFn, encounterType: string): string {
  const key = ENCOUNTER_TYPE_LABEL_KEY[encounterType];
  return key ? t(key) : encounterType;
}

function CancelledBadge({ cancellation }: { cancellation: NoteCancellation }) {
  const { t, locale } = useI18n();
  const params = {
    fecha: formatDateTimeMedium(locale, cancellation.cancelledAt),
    motivo: cancellation.reasonTerm.preferredTerm,
    texto: cancellation.reasonFreeText ?? "",
  };
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded-full border border-danger-600 px-2 py-0.5 text-xs font-medium text-danger-600"
      title={cancellation.reasonFreeText ? t("clinico.notasTimeline.canceladaDetalleTexto", params) : t("clinico.notasTimeline.canceladaDetalle", params)}
    >
      {t("clinico.notasTimeline.canceladaBadge")}
    </span>
  );
}

function NoteBody({ note }: { note: NoteBodyFields }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-col gap-1 text-sm text-gray-700">
      {note.cancellation ? (
        <p className="rounded-md border border-danger-600 bg-danger-50 p-2 text-sm text-danger-600">
          {note.cancellation.reasonFreeText
            ? t("clinico.notasTimeline.canceladaDetalleTexto", {
                fecha: formatDateTimeMedium(locale, note.cancellation.cancelledAt),
                motivo: note.cancellation.reasonTerm.preferredTerm,
                texto: note.cancellation.reasonFreeText,
              })
            : t("clinico.notasTimeline.canceladaDetalle", {
                fecha: formatDateTimeMedium(locale, note.cancellation.cancelledAt),
                motivo: note.cancellation.reasonTerm.preferredTerm,
              })}
        </p>
      ) : null}
      <p>
        <span className="font-medium text-gray-900">{t("clinico.notasTimeline.motivo")}</span> {note.chiefComplaint}
      </p>
      <p>
        <span className="font-medium text-gray-900">{t("clinico.notasTimeline.padecimientoActual")}</span> {note.currentIllness}
      </p>
      {note.physicalExam ? (
        <p>
          <span className="font-medium text-gray-900">{t("clinico.notasTimeline.exploracionFisica")}</span> {note.physicalExam}
        </p>
      ) : null}
      <p>
        <span className="font-medium text-gray-900">{t("clinico.notasTimeline.analisis")}</span> {note.assessment}
      </p>
      <p>
        <span className="font-medium text-gray-900">{t("clinico.notasTimeline.plan")}</span> {note.plan}
      </p>
      {note.prognosis ? (
        <p>
          <span className="font-medium text-gray-900">{t("clinico.notasTimeline.pronostico")}</span> {note.prognosis}
        </p>
      ) : null}
    </div>
  );
}

// Fase 6 · Prompt 44B: "motivo obligatorio tomado de catálogo, más
// firma. El registro se marca cancelado, NUNCA se elimina, y sigue
// siendo consultable." Mismo mecanismo de reautenticación
// (contraseña, SignatureVerificationService) que firmar/corregir.
function CancelNoteForm({
  encounterId,
  noteId,
  accessToken,
  onCancelled,
  onClose,
}: {
  encounterId: string;
  noteId: string;
  accessToken: string;
  onCancelled: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [reasonOptions, setReasonOptions] = useState<{ id: string; key: string; preferredTerm: string }[] | null>(null);
  const [reasonTermId, setReasonTermId] = useState("");
  const [reasonFreeText, setReasonFreeText] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<unknown>("/catalogs/MOTIVO_CANCELACION_NOTA", { accessToken })
      .then((data) => {
        const options = expectArray<{ id: string; key: string; preferredTerm: string }>(data);
        setReasonOptions(options);
        if (options[0]) setReasonTermId(options[0].id);
      })
      .catch(setError);
  }, [accessToken]);

  const selectedReason = reasonOptions?.find((r) => r.id === reasonTermId);
  const requiresFreeText = selectedReason?.key === "otro";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/records/encounters/${encounterId}/notes/${noteId}/cancel`, {
        method: "POST",
        accessToken,
        body: { reasonTermId, ...(reasonFreeText.trim() ? { reasonFreeText: reasonFreeText.trim() } : {}), password },
      });
      onCancelled();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SIGNATURE_MFA_REQUIRED") setPassword("");
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!reasonOptions) return <LoadingState label={t("clinico.notasTimeline.cargandoMotivos")} />;

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3 rounded-md border border-danger-600 bg-danger-50 p-3" noValidate>
      <p className="text-sm font-medium text-danger-600">{t("clinico.notasTimeline.cancelarNota")}</p>
      <FieldWrapper label={t("clinico.notasTimeline.etiquetaMotivo")} htmlFor={`cancel-reason-${noteId}`}>
        <SelectInput id={`cancel-reason-${noteId}`} value={reasonTermId} onChange={(e) => setReasonTermId(e.target.value)}>
          {reasonOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.preferredTerm}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>
      {requiresFreeText ? (
        <FieldWrapper label={t("clinico.notasTimeline.especificaMotivo")} htmlFor={`cancel-reason-text-${noteId}`}>
          <TextInput id={`cancel-reason-text-${noteId}`} required value={reasonFreeText} onChange={(e) => setReasonFreeText(e.target.value)} />
        </FieldWrapper>
      ) : null}
      <FieldWrapper label={t("clinico.notasTimeline.contrasena")} htmlFor={`cancel-password-${noteId}`}>
        <PasswordInput id={`cancel-password-${noteId}`} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </FieldWrapper>
      {error ? <ErrorState error={error} /> : null}
      <div className="flex gap-3">
        {/* `danger` (relleno rojo) justificado: es el punto de no retorno de una
            cancelación de nota firmada, tras motivo y contraseña — la intención ya
            está expresada dos veces. Ver ui/button.tsx. */}
        <Button type="submit" variant="danger" isLoading={isSubmitting}>
          {t("clinico.notasTimeline.confirmarCancelacion")}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("common.acciones.cerrar")}
        </Button>
      </div>
    </form>
  );
}

// Fase 5 · Prompt 40 — línea de tiempo de notas del panel. Cada nota
// se expande EN EL LUGAR (nunca navega, nunca desmonta la nota en
// curso — prueba de aceptación #2 de la Fase 5). Las correcciones
// (adendas, M8-RN-001) siempre viajan con su nota original, nunca la
// reemplazan ni aparecen sueltas. Fase 6 · Prompt 44B: una nota
// cancelada se MUESTRA marcada, nunca se oculta.
export function NotasTimeline({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const { t, locale } = useI18n();
  const [threads, setThreads] = useState<NoteThread[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [cancellingNoteId, setCancellingNoteId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    apiFetch<unknown>(`/records/patients/${patientId}/notes-timeline${qs ? `?${qs}` : ""}`, { accessToken })
      .then((data) => setThreads(expectArray<NoteThread>(data)))
      .catch(setError);
  }, [patientId, accessToken, type, from, to, q]);

  useEffect(load, [load]);

  function noteAndButton(encounterId: string, note: NoteBodyFields) {
    const isCancelling = cancellingNoteId === note.id;
    return (
      <div>
        <NoteBody note={note} />
        {!note.cancellation ? (
          isCancelling ? (
            <CancelNoteForm
              encounterId={encounterId}
              noteId={note.id}
              accessToken={accessToken}
              onCancelled={() => {
                setCancellingNoteId(null);
                load();
              }}
              onClose={() => setCancellingNoteId(null)}
            />
          ) : (
            <button type="button" className="mt-2 text-sm font-medium text-danger-600 underline" onClick={() => setCancellingNoteId(note.id)}>
              Cancelar esta nota
            </button>
          )
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <SelectInput aria-label={t("clinico.notasTimeline.filtrarPorTipo")} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t("clinico.notasTimeline.todosLosTipos")}</option>
          {Object.entries(ENCOUNTER_TYPE_LABEL_KEY).map(([value, labelKey]) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </SelectInput>
        <div className="flex gap-2">
          <DateInput aria-label={t("clinico.notasTimeline.desde")} value={from} onChange={setFrom} max={to || undefined} className="min-w-0 flex-1" />
          <DateInput aria-label={t("clinico.notasTimeline.hasta")} value={to} onChange={setTo} min={from || undefined} className="min-w-0 flex-1" />
        </div>
        <TextInput
          aria-label={t("clinico.notasTimeline.buscarEtiqueta")}
          type="search"
          placeholder={t("clinico.notasTimeline.buscarPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="text-sm"
        />
      </div>

      {error ? <ErrorState error={error} /> : null}
      {!threads ? (
        <LoadingState label={t("clinico.notasTimeline.cargandoNotas")} />
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-500">{t("clinico.notasTimeline.sinCoincidencias")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((thread) => (
            <li key={thread.note.id} className="rounded-md border border-gray-300 p-3">
              <button
                type="button"
                className="w-full min-h-11 text-left"
                onClick={() => setExpandedNoteId((id) => (id === thread.note.id ? null : thread.note.id))}
              >
                <p className="text-base font-medium text-gray-900">
                  {encounterTypeLabel(t, thread.encounterType)} ·{" "}
                  {formatDateTimeMedium(locale, thread.signedAt)}
                  {thread.corrections.length > 0 ? (
                    <span className="ml-2 rounded-full border border-warn-600 px-2 py-0.5 text-xs font-medium text-warn-600">
                      {thread.corrections.length > 1
                        ? t("clinico.notasTimeline.adendas", { n: thread.corrections.length })
                        : t("clinico.notasTimeline.adenda", { n: thread.corrections.length })}
                    </span>
                  ) : null}
                  {thread.note.cancellation ? <CancelledBadge cancellation={thread.note.cancellation} /> : null}
                </p>
                <p className="text-sm text-gray-500">
                  {t("clinico.notasTimeline.doctorPrefijo")} {thread.doctor.legalFirstName} {thread.doctor.legalLastName}
                  {thread.doctor.primarySpecialty ? ` (${thread.doctor.primarySpecialty.nameEs})` : ""}
                </p>
                <p className="text-sm text-gray-700">{thread.note.chiefComplaint}</p>
              </button>
              {expandedNoteId === thread.note.id ? (
                <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
                  {noteAndButton(thread.encounterId, thread.note)}
                  {thread.corrections.map((c) => (
                    <div key={c.id} className="rounded-md border border-warn-600 bg-warn-50 p-2">
                      <p className="mb-1 flex items-center text-xs font-semibold uppercase tracking-wide text-warn-600">
                        {t("clinico.notasTimeline.adendaTitulo", { fecha: formatDateTimeMedium(locale, c.createdAt) })}
                        {c.cancellation ? <CancelledBadge cancellation={c.cancellation} /> : null}
                      </p>
                      {noteAndButton(thread.encounterId, c)}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
