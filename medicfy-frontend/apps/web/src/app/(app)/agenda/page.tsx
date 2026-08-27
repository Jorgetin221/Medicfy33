"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { EstadoCita, type AppointmentStatus } from "@/components/ui/status-badge";

// Formatea un instante UTC ya resuelto por el servidor a la hora del
// consultorio — presentación con IANA explícito (CLAUDE.md §4), nunca
// la zona horaria ambiente del navegador. No decide nada: el día que
// se muestra ya lo decidió GET /appointments en el servidor.
const MX_TIME_ZONE = "America/Mexico_City";

function formatMxTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
}

interface Appointment {
  id: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  patient: { firstName: string; lastNamePaternal: string; lastNameMaternal: string | null; medicfyId: string };
  service: { name: string; durationMinutes: number };
}

// DOC-01. GET /appointments (extendido en Sprint 5c) ya filtra al día
// calendario en America/Mexico_City en el servidor — "hoy" nunca se
// decide en el navegador.
export default function AgendaPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <AgendaList accessToken={accessToken} />;
}

const SUMMARY_TILES: { key: AppointmentStatus[]; label: string }[] = [
  { key: ["COMPLETED"], label: "Atendidas" },
  { key: ["IN_PROGRESS"], label: "En consulta" },
  { key: ["SCHEDULED", "CONFIRMED"], label: "Por atender" },
  { key: ["NO_SHOW"], label: "Ausente" },
];

const LEGEND: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"];

function AgendaList({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [justification, setJustification] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setAppointments(await apiFetch<Appointment[]>("/appointments", { accessToken }));
    } catch (err) {
      setError(err);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(path: string, body?: unknown) {
    setActionError(null);
    try {
      await apiFetch(path, { method: "POST", accessToken, ...(body !== undefined ? { body } : {}) });
      await load();
    } catch (err) {
      setActionError(err);
    }
  }

  function confirmAppointment(id: string) {
    void runAction(`/appointments/${id}/confirm`);
  }
  // /consulta/[appointmentId] hace el POST .../start por su cuenta
  // (y crea el encounter si hace falta) — aquí solo navegamos, para
  // no duplicar la transición de estado en dos lugares.
  function startAppointment(id: string) {
    router.push(`/consulta/${id}`);
  }
  function cancelAppointment(id: string) {
    if (!window.confirm("¿Cancelar esta cita?")) return;
    void runAction(`/appointments/${id}/cancel`, {});
  }
  function markNoShow(id: string) {
    if (!window.confirm("¿Marcar esta cita como no presentado?")) return;
    void runAction(`/appointments/${id}/no-show`);
  }
  async function completeAppointment(id: string) {
    if (justification.trim().length < 10) return;
    await runAction(`/appointments/${id}/complete`, { justification });
    setCompletingId(null);
    setJustification("");
  }

  const today = new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const summaryCounts = useMemo(() => {
    const list = appointments ?? [];
    return SUMMARY_TILES.map((tile) => ({
      ...tile,
      count: list.filter((a) => (tile.key as string[]).includes(a.status)).length,
    }));
  }, [appointments]);

  const next = useMemo(() => {
    const now = Date.now();
    return (appointments ?? [])
      .filter((a) => (a.status === "SCHEDULED" || a.status === "CONFIRMED") && new Date(a.startsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  }, [appointments]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl text-gray-900">Agenda</h1>
            <p className="text-base capitalize text-gray-500">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/disponibilidad"
              className="flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 text-base font-medium text-gray-700 hover:bg-gray-100"
            >
              Bloquear horario
            </Link>
            <Link href="/citas/nueva">
              <Button type="button">+ Nueva cita</Button>
            </Link>
          </div>
        </div>

        {appointments === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} onRetry={load} /> : null}
        {appointments && appointments.length === 0 ? (
          <EmptyState title="Sin citas para hoy" description="Las citas que agendes para hoy aparecerán aquí." />
        ) : null}
        {actionError ? <ErrorState error={actionError} /> : null}

        {appointments && appointments.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {appointments.map((appt) => (
              <li key={appt.id}>
                <Card>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-medium text-gray-900">
                        {formatMxTime(appt.startsAt)}–{formatMxTime(appt.endsAt)}
                      </p>
                      <Link href={`/pacientes/${appt.patientId}`} className="text-base font-medium text-brand-700 underline">
                        {appt.patient.firstName} {appt.patient.lastNamePaternal} {appt.patient.lastNameMaternal ?? ""}
                      </Link>
                      <p className="text-sm text-gray-500">
                        {appt.service.name} · {appt.patient.medicfyId}
                      </p>
                    </div>
                    <EstadoCita status={appt.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3">
                    {appt.status === "SCHEDULED" ? (
                      <Button type="button" variant="secondary" onClick={() => confirmAppointment(appt.id)}>
                        Confirmar
                      </Button>
                    ) : null}
                    {appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                      <Button type="button" variant="secondary" onClick={() => startAppointment(appt.id)}>
                        Iniciar
                      </Button>
                    ) : null}
                    {appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                      <Button type="button" variant="danger" onClick={() => cancelAppointment(appt.id)}>
                        Cancelar
                      </Button>
                    ) : null}
                    {appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                      <Button type="button" variant="danger" onClick={() => markNoShow(appt.id)}>
                        No se presentó
                      </Button>
                    ) : null}
                    {appt.status === "IN_PROGRESS" ? (
                      <Button type="button" onClick={() => router.push(`/consulta/${appt.id}`)}>
                        Continuar consulta
                      </Button>
                    ) : null}
                    {appt.status === "IN_PROGRESS" && completingId !== appt.id ? (
                      <Button type="button" variant="secondary" onClick={() => setCompletingId(appt.id)}>
                        Cerrar sin nota clínica
                      </Button>
                    ) : null}
                  </div>

                  {appt.status === "IN_PROGRESS" && completingId === appt.id ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-300 pt-3">
                      <label htmlFor={`justification-${appt.id}`} className="text-sm font-medium text-gray-700">
                        Justificación — excepción M5-RN-006: cierra la cita sin nota clínica firmada. La ruta normal es firmar la
                        consulta desde &quot;Continuar consulta&quot;.
                      </label>
                      <textarea
                        id={`justification-${appt.id}`}
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        minLength={10}
                        className="min-h-[80px] w-full rounded-md border border-gray-300 bg-white p-3 text-base text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                      />
                      <div className="flex gap-3">
                        <Button type="button" onClick={() => void completeAppointment(appt.id)} disabled={justification.trim().length < 10}>
                          Confirmar cierre
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setCompletingId(null);
                            setJustification("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {appointments && appointments.length > 0 ? (
        <aside className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Resumen del día</h2>
            <div className="grid grid-cols-2 gap-3">
              {summaryCounts.map((tile) => (
                <Card key={tile.label} className="p-4">
                  <p className="font-heading text-2xl text-gray-900">{tile.count}</p>
                  <p className="text-sm text-gray-500">{tile.label}</p>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Estados de cita</h2>
            <Card className="flex flex-col gap-2 p-4">
              {LEGEND.map((status) => (
                <EstadoCita key={status} status={status} />
              ))}
            </Card>
          </div>

          {next ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Siguiente</h2>
              <Card className="flex flex-col gap-2 p-4">
                <p className="text-base font-medium text-gray-900">
                  {next.patient.firstName} {next.patient.lastNamePaternal} {next.patient.lastNameMaternal ?? ""}
                </p>
                <p className="text-sm text-gray-500">
                  {formatMxTime(next.startsAt)} · {next.service.name}
                </p>
                <Button type="button" className="mt-1" onClick={() => startAppointment(next.id)}>
                  Abrir consulta
                </Button>
              </Card>
            </div>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}
