"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { formatTime, formatWeekdayLong, toIsoDateKey } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

interface AppointmentDetail {
  id: string;
  doctorId: string;
  serviceId: string;
  startsAt: string;
  status: string;
  patient: { firstName: string; lastNamePaternal: string };
  service: { name: string; durationMinutes: number };
}

interface Slot {
  startAt: string;
  endAt: string;
  locationId: string | null;
}

type RequestedBy = "PATIENT" | "DOCTOR";

const RESCHEDULABLE_STATUSES = ["PENDING_PAYMENT", "SCHEDULED", "CONFIRMED"];

function dateLabel(locale: Locale, iso: string): string {
  const label = formatWeekdayLong(locale, new Date(`${toIsoDateKey(iso)}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// M-33 / M5-RN-004: el backend ya reagendaba (POST
// /appointments/:id/reschedule) pero ninguna pantalla lo usaba. Los
// espacios vienen ya resueltos por el servidor (CLAUDE.md §4); esta
// pantalla solo devuelve el startAt exacto que se le ofreció.
export default function ReprogramarCitaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) router.replace("/login");
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }
  return <ReprogramarForm appointmentId={id} accessToken={accessToken} />;
}

function ReprogramarForm({ appointmentId, accessToken }: { appointmentId: string; accessToken: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<unknown>(null);
  const [requestedBy, setRequestedBy] = useState<RequestedBy>("PATIENT");
  const [submittingSlot, setSubmittingSlot] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [rescheduledTo, setRescheduledTo] = useState<string | null>(null);

  const loadAppointment = useCallback(async () => {
    setLoadError(null);
    try {
      setAppointment(await apiFetch<AppointmentDetail>(`/appointments/${appointmentId}`, { accessToken }));
    } catch (error) {
      setLoadError(error);
    }
  }, [appointmentId, accessToken]);

  const loadSlots = useCallback(async () => {
    if (!appointment) return;
    setSlotsError(null);
    setSlots(null);
    try {
      const raw = await apiFetch<unknown>(`/doctors/${appointment.doctorId}/availability?service_id=${appointment.serviceId}`);
      setSlots(expectArray<Slot>(raw));
    } catch (error) {
      setSlotsError(error);
    }
  }, [appointment]);

  useEffect(() => {
    void loadAppointment();
  }, [loadAppointment]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function reschedule(slot: Slot) {
    setSubmitError(null);
    setSubmittingSlot(slot.startAt);
    try {
      await apiFetch(`/appointments/${appointmentId}/reschedule`, {
        method: "POST",
        accessToken,
        body: { newStartsAt: slot.startAt, rescheduledAsRole: requestedBy },
      });
      setRescheduledTo(slot.startAt);
    } catch (error) {
      setSubmitError(error);
      if (error instanceof ApiError && error.code === "SLOT_TAKEN") await loadSlots();
    } finally {
      setSubmittingSlot(null);
    }
  }

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slots ?? []) {
      const key = toIsoDateKey(slot.startAt);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots]);

  if (rescheduledTo) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-2xl text-brand-900">{t("citaReprogramar.reprogramada")}</h1>
        <p className="text-base text-gray-700">
          {t("citaReprogramar.reprogramadaCuerpo", { fecha: dateLabel(locale, rescheduledTo), hora: formatTime(locale, rescheduledTo) })}
        </p>
        <Button type="button" onClick={() => router.push("/agenda")}>
          {t("citaReprogramar.volverAgenda")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("citaReprogramar.titulo")}</h1>
        <p className="text-base text-gray-500">{t("citaReprogramar.subtitulo")}</p>
      </div>

      {!appointment && !loadError ? <LoadingState /> : null}
      {loadError ? <ErrorState error={loadError} onRetry={loadAppointment} /> : null}

      {appointment && !RESCHEDULABLE_STATUSES.includes(appointment.status) ? (
        <EmptyState title={t("citaReprogramar.noReprogramable")} />
      ) : null}

      {appointment && RESCHEDULABLE_STATUSES.includes(appointment.status) ? (
        <>
          <Card>
            <p className="text-base font-medium text-gray-900">
              {appointment.patient.firstName} {appointment.patient.lastNamePaternal} · {appointment.service.name}
            </p>
            <p className="text-base text-gray-700">
              {t("citaReprogramar.horarioActual", {
                fecha: dateLabel(locale, appointment.startsAt),
                hora: formatTime(locale, appointment.startsAt),
              })}
            </p>
            <fieldset className="mt-4">
              <legend className="text-base font-medium text-gray-900">{t("citaReprogramar.quienSolicita")}</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {(["PATIENT", "DOCTOR"] as const).map((role) => (
                  <label key={role} className="flex min-h-11 items-center gap-2 text-base text-gray-900">
                    <input
                      type="radio"
                      name="requestedBy"
                      value={role}
                      checked={requestedBy === role}
                      onChange={() => setRequestedBy(role)}
                      className="h-5 w-5"
                    />
                    {role === "PATIENT" ? t("citaReprogramar.solicitaPaciente") : t("citaReprogramar.solicitaMedico")}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          {submitError ? <ErrorState error={submitError} /> : null}

          <Card>
            <h2 className="font-heading text-xl text-brand-900">{t("citaReprogramar.nuevoHorario")}</h2>
            <div className="mt-4">
              {slots === null && !slotsError ? <LoadingState /> : null}
              {slotsError ? <ErrorState error={slotsError} onRetry={loadSlots} /> : null}
              {slots && slots.length === 0 ? (
                <EmptyState title={t("citaNueva.sinEspacios")} description={t("citaNueva.sinEspaciosAyuda")} />
              ) : null}
              <div className="flex flex-col gap-4">
                {groupedSlots.map(([dateKey, daySlots]) => (
                  <div key={dateKey}>
                    <p className="mb-2 text-base font-medium text-gray-700">{dateLabel(locale, `${dateKey}T12:00:00Z`)}</p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((slot) => (
                        <button
                          key={slot.startAt}
                          type="button"
                          disabled={submittingSlot !== null}
                          onClick={() => void reschedule(slot)}
                          className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-base text-gray-900 hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:pointer-events-none disabled:opacity-50"
                        >
                          {submittingSlot === slot.startAt ? t("citaReprogramar.reprogramando") : formatTime(locale, slot.startAt)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </main>
  );
}
