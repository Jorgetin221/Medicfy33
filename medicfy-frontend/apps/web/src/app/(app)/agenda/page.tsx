"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { EstadoCita, type AppointmentStatus } from "@/components/ui/status-badge";
import { useI18n } from "@/lib/i18n/context";
import { formatTime, formatWeekdayLong } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

// La hora se pinta en la zona del consultorio con IANA explícito
// (CLAUDE.md §4, ver lib/i18n/format.ts), nunca en la zona ambiente
// del navegador ni en función del idioma elegido. No decide nada: el
// día que se muestra ya lo decidió GET /appointments en el servidor.

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

const SUMMARY_TILES: { key: AppointmentStatus[]; labelKey: MessageKey }[] = [
  { key: ["COMPLETED"], labelKey: "agenda.resumen.atendidas" },
  { key: ["IN_PROGRESS"], labelKey: "agenda.resumen.enConsulta" },
  { key: ["SCHEDULED", "CONFIRMED"], labelKey: "agenda.resumen.porAtender" },
  { key: ["NO_SHOW"], labelKey: "agenda.resumen.ausente" },
];

const LEGEND: AppointmentStatus[] = ["PENDING_PAYMENT", "SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"];

function AgendaList({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
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
    void load();
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
  // A-11: una reserva pública queda en PENDING_PAYMENT hasta que el
  // consultorio registra el pago (no hay pasarela todavía).
  function confirmPayment(id: string) {
    void runAction(`/appointments/${id}/confirm-payment`);
  }
  // /consulta/[appointmentId] hace el POST .../start por su cuenta
  // (y crea el encounter si hace falta) — aquí solo navegamos, para
  // no duplicar la transición de estado en dos lugares.
  function startAppointment(id: string) {
    router.push(`/consulta/${id}`);
  }
  async function cancelAppointment(id: string) {
    if (!(await confirm({ title: t("agenda.confirmarCancelar"), destructive: true }))) return;
    void runAction(`/appointments/${id}/cancel`, {});
  }
  async function markNoShow(id: string) {
    if (!(await confirm({ title: t("agenda.confirmarNoShow") }))) return;
    void runAction(`/appointments/${id}/no-show`);
  }
  async function completeAppointment(id: string) {
    if (justification.trim().length < 10) return;
    await runAction(`/appointments/${id}/complete`, { justification });
    setCompletingId(null);
    setJustification("");
  }

  const today = formatWeekdayLong(locale, new Date());

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
    <>
      {dialog}
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl text-gray-900">{t("agenda.titulo")}</h1>
              <p className="text-base capitalize text-gray-500">{today}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/disponibilidad"
                className="flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                {t("agenda.bloquearHorario")}
              </Link>
              <ButtonLink href="/citas/nueva">{t("agenda.nuevaCita")}</ButtonLink>
            </div>
          </div>

          {appointments === null && !error ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={load} /> : null}
          {appointments && appointments.length === 0 ? (
            <EmptyState title={t("agenda.sinCitasHoy")} description={t("agenda.sinCitasHoyAyuda")} />
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
                          {formatTime(locale, appt.startsAt)}–{formatTime(locale, appt.endsAt)}
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
                      {appt.status === "PENDING_PAYMENT" ? (
                        <Button type="button" onClick={() => confirmPayment(appt.id)}>
                          {t("agenda.acciones.confirmarPago")}
                        </Button>
                      ) : null}
                      {appt.status === "SCHEDULED" ? (
                        <Button type="button" variant="secondary" onClick={() => confirmAppointment(appt.id)}>
                          {t("agenda.acciones.confirmar")}
                        </Button>
                      ) : null}
                      {/* Iniciar es la acción que esta pantalla existe para provocar:
                          va en primario. Antes era `secondary` mientras Cancelar era
                          rojo sólido — el botón que el médico pulsa decenas de veces
                          al día pesaba menos que el que casi nunca debe pulsar. */}
                      {appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                        <Button type="button" onClick={() => startAppointment(appt.id)}>
                          {t("agenda.acciones.iniciar")}
                        </Button>
                      ) : null}
                      {appt.status === "PENDING_PAYMENT" || appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                        <Button type="button" variant="destructive" onClick={() => void cancelAppointment(appt.id)}>
                          {t("agenda.acciones.cancelar")}
                        </Button>
                      ) : null}
                      {appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                        <Button type="button" variant="secondary" onClick={() => void markNoShow(appt.id)}>
                          {t("agenda.acciones.noSePresento")}
                        </Button>
                      ) : null}
                      {appt.status === "PENDING_PAYMENT" || appt.status === "SCHEDULED" || appt.status === "CONFIRMED" ? (
                        <Button type="button" variant="secondary" onClick={() => router.push(`/citas/${appt.id}/reprogramar`)}>
                          {t("agenda.acciones.reprogramar")}
                        </Button>
                      ) : null}
                      {appt.status === "IN_PROGRESS" ? (
                        <Button type="button" onClick={() => router.push(`/consulta/${appt.id}`)}>
                          {t("agenda.acciones.continuarConsulta")}
                        </Button>
                      ) : null}
                      {appt.status === "IN_PROGRESS" && completingId !== appt.id ? (
                        <Button type="button" variant="secondary" onClick={() => setCompletingId(appt.id)}>
                          {t("agenda.acciones.cerrarSinNota")}
                        </Button>
                      ) : null}
                    </div>

                    {appt.status === "IN_PROGRESS" && completingId === appt.id ? (
                      <div className="mt-3 flex flex-col gap-2 border-t border-gray-300 pt-3">
                        <label htmlFor={`justification-${appt.id}`} className="text-sm font-medium text-gray-700">
                          {t("agenda.justificacionCierre")}
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
                            {t("agenda.acciones.confirmarCierre")}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setCompletingId(null);
                              setJustification("");
                            }}
                          >
                            {t("common.acciones.cancelar")}
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
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("agenda.resumen.titulo")}</h2>
              <div className="grid grid-cols-2 gap-3">
                {summaryCounts.map((tile) => (
                  <Card key={tile.labelKey} className="p-4">
                    <p className="font-heading text-2xl text-gray-900">{tile.count}</p>
                    <p className="text-sm text-gray-500">{t(tile.labelKey)}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("agenda.leyenda")}</h2>
              <Card className="flex flex-col gap-2 p-4">
                {LEGEND.map((status) => (
                  <EstadoCita key={status} status={status} />
                ))}
              </Card>
            </div>

            {next ? (
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("agenda.siguiente")}</h2>
                <Card className="flex flex-col gap-2 p-4">
                  <p className="text-base font-medium text-gray-900">
                    {next.patient.firstName} {next.patient.lastNamePaternal} {next.patient.lastNameMaternal ?? ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatTime(locale, next.startsAt)} · {next.service.name}
                  </p>
                  <Button type="button" className="mt-1" onClick={() => startAppointment(next.id)}>
                    {t("agenda.acciones.abrirConsulta")}
                  </Button>
                </Card>
              </div>
            ) : null}
          </aside>
        ) : null}
      </main>
    </>
  );
}
