"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TimelineEncounter } from "@/lib/use-patient-clinical";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { FieldWrapper, SelectInput, TextInput } from "@/components/ui/field";

interface TreatmentProtocolRecord {
  id: string;
  name: string;
  sourceCitation: string | null;
}

interface ProtocolSessionRecord {
  id: string;
  sequenceNumber: number;
  proposedDate: string;
  actualDate: string | null;
  withinWindow: boolean | null;
  encounterId: string | null;
  template: { label: string };
}

interface PatientProtocolInstanceRecord {
  id: string;
  status: "ACTIVE" | "CLOSED";
  startedAt: string;
  closedAt: string | null;
  closureReason: string | null;
  closureNotes: string | null;
  protocol: { name: string; sourceCitation: string | null };
  sessions: ProtocolSessionRecord[];
}

const CLOSURE_REASON_LABEL: Record<string, string> = {
  COMPLETADO: "Completado",
  ABANDONADO: "Abandonado",
  CAMBIO_PLAN: "Cambio de plan",
  REFERIDO: "Referido",
};

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(new Date(iso));
}

// Fase 7 · Prompt 48B — vista de adherencia: qué sesiones se
// cumplieron dentro de ventana y cuáles no. Color + texto siempre
// (CLAUDE.md §5) — nunca solo el color.
function sessionStatusBadge(session: ProtocolSessionRecord) {
  if (!session.actualDate) {
    return <span className="rounded-full border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500">Pendiente</span>;
  }
  if (session.withinWindow) {
    return <span className="rounded-full border border-success-600 px-2 py-0.5 text-xs font-medium text-success-600">Cumplida en ventana</span>;
  }
  return <span className="rounded-full border border-warn-600 px-2 py-0.5 text-xs font-medium text-warn-600">Cumplida fuera de ventana</span>;
}

// Registrar sesión: fecha real + liga opcional a una nota ya firmada
// (prompt 47C). Deliberadamente SIN los campos dinámicos de
// ProtocolFieldSchema todavía — ningún protocolo real (control
// prenatal/vacunación, prompt 48A) está configurado aún, así que
// construir ahora el renderizador genérico de esos campos se
// arriesgaría a adivinar la forma equivocada. El backend ya acepta
// `data` arbitrario vía la API para cuando lleguen.
function RecordSessionForm({
  patientId,
  instanceId,
  sessionId,
  signedEncounters,
  accessToken,
  onRecorded,
  onCancel,
}: {
  patientId: string;
  instanceId: string;
  sessionId: string;
  signedEncounters: TimelineEncounter[];
  accessToken: string;
  onRecorded: () => void;
  onCancel: () => void;
}) {
  const [actualDate, setActualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [encounterId, setEncounterId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/records/patients/${patientId}/protocol-instances/${instanceId}/sessions/${sessionId}/record`, {
        method: "POST",
        accessToken,
        body: { actualDate, ...(encounterId ? { encounterId } : {}) },
      });
      onRecorded();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3 rounded-md border border-gray-300 p-3" noValidate>
      {error ? <ErrorState error={error} /> : null}
      <FieldWrapper label="Fecha real" htmlFor={`session-date-${sessionId}`}>
        <TextInput id={`session-date-${sessionId}`} type="date" required value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
      </FieldWrapper>
      <FieldWrapper label="Ligar a una nota firmada (opcional)" htmlFor={`session-encounter-${sessionId}`}>
        <SelectInput id={`session-encounter-${sessionId}`} value={encounterId} onChange={(e) => setEncounterId(e.target.value)}>
          <option value="">Sin ligar</option>
          {signedEncounters.map((e) => (
            <option key={e.id} value={e.id}>
              {formatMxDate(e.signedAt ?? e.startedAt)}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>
      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting}>
          Registrar
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function CloseInstanceForm({
  patientId,
  instanceId,
  accessToken,
  onClosed,
  onCancel,
}: {
  patientId: string;
  instanceId: string;
  accessToken: string;
  onClosed: () => void;
  onCancel: () => void;
}) {
  const [closureReason, setClosureReason] = useState("COMPLETADO");
  const [closureNotes, setClosureNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/records/patients/${patientId}/protocol-instances/${instanceId}/close`, {
        method: "POST",
        accessToken,
        body: { closureReason, ...(closureNotes.trim() ? { closureNotes: closureNotes.trim() } : {}) },
      });
      onClosed();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3 rounded-md border border-gray-300 p-3" noValidate>
      {error ? <ErrorState error={error} /> : null}
      <FieldWrapper label="Motivo de cierre" htmlFor="closure-reason">
        <SelectInput id="closure-reason" value={closureReason} onChange={(e) => setClosureReason(e.target.value)}>
          {Object.entries(CLOSURE_REASON_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>
      <FieldWrapper label="Notas (opcional)" htmlFor="closure-notes">
        <TextInput id="closure-notes" value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} />
      </FieldWrapper>
      <div className="flex gap-3">
        <Button type="submit" variant="danger" isLoading={isSubmitting}>
          Cerrar instancia
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function StartInstanceForm({
  patientId,
  protocols,
  accessToken,
  onStarted,
}: {
  patientId: string;
  protocols: TreatmentProtocolRecord[];
  accessToken: string;
  onStarted: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [protocolId, setProtocolId] = useState(protocols[0]?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/records/patients/${patientId}/protocol-instances`, {
        method: "POST",
        accessToken,
        body: { protocolId },
      });
      setIsOpen(false);
      onStarted();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (protocols.length === 0) return null;

  if (!isOpen) {
    return (
      <Button type="button" variant="secondary" onClick={() => setIsOpen(true)}>
        + Iniciar protocolo
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-md border border-gray-300 p-4" noValidate>
      {error ? <ErrorState error={error} /> : null}
      <FieldWrapper label="Protocolo" htmlFor="start-protocol">
        <SelectInput id="start-protocol" value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
          {protocols.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>
      {!protocols.find((p) => p.id === protocolId)?.sourceCitation ? (
        <p className="text-sm text-warn-600">Este protocolo no tiene una fuente clínica citada — es de demostración, no para uso clínico real.</p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting}>
          Iniciar
        </Button>
        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// Fase 7 · Prompt 47/48 — protocolos longitudinales del paciente:
// instancias activas/cerradas y su adherencia por sesión.
export function TabProtocolos({ patientId, accessToken, encounters }: { patientId: string; accessToken: string; encounters: TimelineEncounter[] }) {
  const [instances, setInstances] = useState<PatientProtocolInstanceRecord[] | null>(null);
  const [protocols, setProtocols] = useState<TreatmentProtocolRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [closingInstanceId, setClosingInstanceId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<PatientProtocolInstanceRecord[]>(`/records/patients/${patientId}/protocol-instances`, { accessToken })
      .then(setInstances)
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(load, [load]);
  useEffect(() => {
    apiFetch<TreatmentProtocolRecord[]>("/protocols", { accessToken })
      .then(setProtocols)
      .catch(() => setProtocols([]));
  }, [accessToken]);

  const signedEncounters = encounters.filter((e) => e.status === "SIGNED");

  if (error && !instances) return <ErrorState error={error} onRetry={load} />;
  if (!instances) return <LoadingState label="Cargando protocolos…" />;

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorState error={error} /> : null}
      {instances.length === 0 ? (
        <EmptyState title="Sin protocolos iniciados" description="Inicia un protocolo de seguimiento longitudinal para este paciente." />
      ) : (
        <ul className="flex flex-col gap-3">
          {instances.map((instance) => (
            <li key={instance.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-medium text-gray-900">{instance.protocol.name}</p>
                    <p className="text-sm text-gray-500">
                      Iniciado {formatMxDate(instance.startedAt)}
                      {instance.status === "CLOSED"
                        ? ` · Cerrado ${formatMxDate(instance.closedAt as string)} · ${CLOSURE_REASON_LABEL[instance.closureReason as string] ?? instance.closureReason}`
                        : ""}
                    </p>
                    {!instance.protocol.sourceCitation ? (
                      <p className="text-sm text-warn-600">Sin fuente clínica citada — protocolo de demostración.</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-medium ${
                      instance.status === "ACTIVE" ? "border-success-600 text-success-600" : "border-gray-300 text-gray-500"
                    }`}
                  >
                    {instance.status === "ACTIVE" ? "Activo" : "Cerrado"}
                  </span>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {instance.sessions.map((session) => (
                    <li key={session.id} className="rounded-md border border-gray-300 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-base text-gray-900">{session.template.label}</p>
                          <p className="text-sm text-gray-500">
                            Propuesta {formatMxDate(session.proposedDate)}
                            {session.actualDate ? ` · Real ${formatMxDate(session.actualDate)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {sessionStatusBadge(session)}
                          {!session.actualDate && instance.status === "ACTIVE" && recordingSessionId !== session.id ? (
                            <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setRecordingSessionId(session.id)}>
                              Registrar sesión
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {recordingSessionId === session.id ? (
                        <RecordSessionForm
                          patientId={patientId}
                          instanceId={instance.id}
                          sessionId={session.id}
                          signedEncounters={signedEncounters}
                          accessToken={accessToken}
                          onRecorded={() => {
                            setRecordingSessionId(null);
                            load();
                          }}
                          onCancel={() => setRecordingSessionId(null)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>

                {instance.status === "ACTIVE" ? (
                  closingInstanceId === instance.id ? (
                    <CloseInstanceForm
                      patientId={patientId}
                      instanceId={instance.id}
                      accessToken={accessToken}
                      onClosed={() => {
                        setClosingInstanceId(null);
                        load();
                      }}
                      onCancel={() => setClosingInstanceId(null)}
                    />
                  ) : (
                    <Button type="button" variant="secondary" className="mt-3 min-h-11 px-3 text-sm" onClick={() => setClosingInstanceId(instance.id)}>
                      Cerrar instancia
                    </Button>
                  )
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <StartInstanceForm patientId={patientId} protocols={protocols ?? []} accessToken={accessToken} onStarted={load} />
    </div>
  );
}
