"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { FieldWrapper, SelectInput, TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

const ENCOUNTER_TYPE_LABEL: Record<string, string> = {
  FIRST_VISIT: "Primera vez",
  FOLLOW_UP: "Seguimiento",
  TELECONSULTATION: "Teleconsulta",
  URGENT: "Urgencia",
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

function CancelledBadge({ cancellation }: { cancellation: NoteCancellation }) {
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded-full border border-danger-600 px-2 py-0.5 text-xs font-medium text-danger-600"
      title={`Cancelada ${formatMxDateTime(cancellation.cancelledAt)} · ${cancellation.reasonTerm.preferredTerm}${cancellation.reasonFreeText ? `: ${cancellation.reasonFreeText}` : ""}`}
    >
      CANCELADA
    </span>
  );
}

function NoteBody({ note }: { note: NoteBodyFields }) {
  return (
    <div className="flex flex-col gap-1 text-sm text-gray-700">
      {note.cancellation ? (
        <p className="rounded-md border border-danger-600 bg-danger-50 p-2 text-sm text-danger-600">
          Cancelada {formatMxDateTime(note.cancellation.cancelledAt)} · {note.cancellation.reasonTerm.preferredTerm}
          {note.cancellation.reasonFreeText ? `: ${note.cancellation.reasonFreeText}` : ""}
        </p>
      ) : null}
      <p>
        <span className="font-medium text-gray-900">Motivo:</span> {note.chiefComplaint}
      </p>
      <p>
        <span className="font-medium text-gray-900">Padecimiento actual:</span> {note.currentIllness}
      </p>
      {note.physicalExam ? (
        <p>
          <span className="font-medium text-gray-900">Exploración física:</span> {note.physicalExam}
        </p>
      ) : null}
      <p>
        <span className="font-medium text-gray-900">Análisis:</span> {note.assessment}
      </p>
      <p>
        <span className="font-medium text-gray-900">Plan:</span> {note.plan}
      </p>
      {note.prognosis ? (
        <p>
          <span className="font-medium text-gray-900">Pronóstico:</span> {note.prognosis}
        </p>
      ) : null}
    </div>
  );
}

// Fase 6 · Prompt 44B: "motivo obligatorio tomado de catálogo, más
// firma. El registro se marca cancelado, NUNCA se elimina, y sigue
// siendo consultable." Mismo mecanismo de reautenticación
// (password+TOTP, SignatureVerificationService) que firmar/corregir.
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
  const [reasonOptions, setReasonOptions] = useState<{ id: string; key: string; preferredTerm: string }[] | null>(null);
  const [reasonTermId, setReasonTermId] = useState("");
  const [reasonFreeText, setReasonFreeText] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<{ id: string; key: string; preferredTerm: string }[]>("/catalogs/MOTIVO_CANCELACION_NOTA", { accessToken })
      .then((options) => {
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
        body: { reasonTermId, ...(reasonFreeText.trim() ? { reasonFreeText: reasonFreeText.trim() } : {}), password, totpCode },
      });
      onCancelled();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SIGNATURE_MFA_REQUIRED") setTotpCode("");
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!reasonOptions) return <LoadingState label="Cargando motivos…" />;

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3 rounded-md border border-danger-600 bg-danger-50 p-3" noValidate>
      <p className="text-sm font-medium text-danger-600">Cancelar esta nota — no se elimina, queda marcada como cancelada.</p>
      <FieldWrapper label="Motivo" htmlFor={`cancel-reason-${noteId}`}>
        <SelectInput id={`cancel-reason-${noteId}`} value={reasonTermId} onChange={(e) => setReasonTermId(e.target.value)}>
          {reasonOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.preferredTerm}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>
      {requiresFreeText ? (
        <FieldWrapper label="Especifica el motivo" htmlFor={`cancel-reason-text-${noteId}`}>
          <TextInput id={`cancel-reason-text-${noteId}`} required value={reasonFreeText} onChange={(e) => setReasonFreeText(e.target.value)} />
        </FieldWrapper>
      ) : null}
      <FieldWrapper label="Contraseña" htmlFor={`cancel-password-${noteId}`}>
        <TextInput id={`cancel-password-${noteId}`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </FieldWrapper>
      <FieldWrapper label="Código de verificación (TOTP)" htmlFor={`cancel-totp-${noteId}`}>
        <TextInput
          id={`cancel-totp-${noteId}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
        />
      </FieldWrapper>
      {error ? <ErrorState error={error} /> : null}
      <div className="flex gap-3">
        <Button type="submit" variant="danger" isLoading={isSubmitting}>
          Confirmar cancelación
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cerrar
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
    apiFetch<NoteThread[]>(`/records/patients/${patientId}/notes-timeline${qs ? `?${qs}` : ""}`, { accessToken })
      .then(setThreads)
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
        <SelectInput aria-label="Filtrar por tipo de nota" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(ENCOUNTER_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectInput>
        <div className="flex gap-2">
          <TextInput aria-label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm" />
          <TextInput aria-label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm" />
        </div>
        <TextInput
          aria-label="Buscar en las notas"
          type="search"
          placeholder="Buscar en las notas…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="text-sm"
        />
      </div>

      {error ? <ErrorState error={error} /> : null}
      {!threads ? (
        <LoadingState label="Cargando notas…" />
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-500">Sin notas que coincidan.</p>
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
                  {ENCOUNTER_TYPE_LABEL[thread.encounterType] ?? thread.encounterType} · {formatMxDateTime(thread.signedAt)}
                  {thread.corrections.length > 0 ? (
                    <span className="ml-2 rounded-full border border-warn-600 px-2 py-0.5 text-xs font-medium text-warn-600">
                      {thread.corrections.length} adenda{thread.corrections.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  {thread.note.cancellation ? <CancelledBadge cancellation={thread.note.cancellation} /> : null}
                </p>
                <p className="text-sm text-gray-500">
                  Dr(a). {thread.doctor.legalFirstName} {thread.doctor.legalLastName}
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
                        Adenda · {formatMxDateTime(c.createdAt)}
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
