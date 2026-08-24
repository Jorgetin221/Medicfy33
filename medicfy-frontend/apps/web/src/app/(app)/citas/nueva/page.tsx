"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { FieldWrapper, SelectInput } from "@/components/ui/field";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

const MX_TIME_ZONE = "America/Mexico_City";

function mxDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MX_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
// Recibe la clave YYYY-MM-DD (no un instante) y ancla a mediodía UTC
// para evitar indexar el primer slot del grupo solo para tomar su
// fecha.
function mxDateLabel(dateKey: string): string {
  const label = new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${dateKey}T12:00:00Z`)
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function mxTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
}

interface PatientOption {
  id: string;
  firstName: string;
  lastNamePaternal: string;
  medicfyId: string;
}
interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
}
interface Slot {
  startAt: string;
  endAt: string;
  locationId: string | null;
}

// DOC-appointment. Los espacios vienen ya resueltos por
// GET /doctors/{id}/availability (M4) — esta pantalla nunca calcula un
// horario, solo pasa de vuelta el startAt exacto que el servidor
// ofreció (CLAUDE.md §4).
export default function NuevaCitaPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl p-6">
          <LoadingState />
        </main>
      }
    >
      <NuevaCitaForm />
    </Suspense>
  );
}

function NuevaCitaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientOption[] | null>(null);
  const [services, setServices] = useState<ServiceOption[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [patientId, setPatientId] = useState(searchParams.get("patientId") ?? "");
  const [serviceId, setServiceId] = useState("");

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<unknown>(null);
  const [bookingError, setBookingError] = useState<unknown>(null);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    if (!accessToken) return;
    setLoadError(null);
    try {
      const [doctor, patientList, serviceList] = await Promise.all([
        apiFetch<{ id: string }>("/doctors/me", { accessToken }),
        apiFetch<PatientOption[]>("/patients", { accessToken }),
        apiFetch<ServiceOption[]>("/doctors/me/services", { accessToken }),
      ]);
      setDoctorId(doctor.id);
      setPatients(patientList);
      setServices(serviceList);
    } catch (error) {
      setLoadError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadSlots = useCallback(async () => {
    if (!doctorId || !serviceId) return;
    setSlotsError(null);
    setSlots(null);
    try {
      setSlots(await apiFetch<Slot[]>(`/doctors/${doctorId}/availability?service_id=${serviceId}`));
    } catch (error) {
      setSlotsError(error);
    }
  }, [doctorId, serviceId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  async function book(slot: Slot) {
    if (!patientId || !serviceId || !accessToken) return;
    setBookingError(null);
    setBookingSlot(slot.startAt);
    try {
      await apiFetch("/appointments", {
        method: "POST",
        accessToken,
        body: { patientId, serviceId, startsAt: slot.startAt },
      });
      router.push("/agenda");
    } catch (error) {
      setBookingError(error);
      if (error instanceof ApiError && error.code === "SLOT_TAKEN") {
        await loadSlots();
      }
    } finally {
      setBookingSlot(null);
    }
  }

  const groupedSlots = useMemo(() => {
    if (!slots) return [];
    const groups = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = mxDateKey(slot.startAt);
      const existing = groups.get(key);
      if (existing) {
        existing.push(slot);
      } else {
        groups.set(key, [slot]);
      }
    }
    return [...groups.entries()];
  }, [slots]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Nueva cita</h1>
        <p className="text-base text-gray-500">Elige paciente, servicio y un espacio disponible.</p>
      </div>

      {patients === null && services === null && !loadError ? <LoadingState /> : null}
      {loadError ? <ErrorState error={loadError} onRetry={loadBase} /> : null}

      {patients && services ? (
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="Paciente" htmlFor="patientId">
              {patients.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Sin pacientes registrados.{" "}
                  <a href="/pacientes/nuevo" className="font-medium text-brand-700 underline">
                    Registra uno primero.
                  </a>
                </p>
              ) : (
                <SelectInput id="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastNamePaternal} · {p.medicfyId}
                    </option>
                  ))}
                </SelectInput>
              )}
            </FieldWrapper>
            <FieldWrapper label="Servicio" htmlFor="serviceId">
              {services.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Sin servicios configurados.{" "}
                  <a href="/disponibilidad" className="font-medium text-brand-700 underline">
                    Configura tu agenda primero.
                  </a>
                </p>
              ) : (
                <SelectInput id="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes} min
                    </option>
                  ))}
                </SelectInput>
              )}
            </FieldWrapper>
          </div>
        </Card>
      ) : null}

      {patientId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-700 bg-brand-100 p-6">
          <p className="text-base text-brand-900">¿No necesitas agendar? Puedes atenderlo ahora mismo, sin reservar un horario.</p>
          <Link href={`/consulta/paciente/${patientId}`}>
            <Button type="button" variant="secondary" className="whitespace-nowrap">
              Atender ahora sin cita
            </Button>
          </Link>
        </div>
      ) : null}

      {bookingError ? <ErrorState error={bookingError} /> : null}

      {serviceId ? (
        <Card>
          <h2 className="font-heading text-xl text-brand-900">Espacios disponibles</h2>
          <div className="mt-4">
            {slots === null && !slotsError ? <LoadingState /> : null}
            {slotsError ? <ErrorState error={slotsError} onRetry={loadSlots} /> : null}
            {slots && slots.length === 0 ? (
              <EmptyState title="Sin espacios disponibles" description="Prueba con otro servicio o configura más horario." />
            ) : null}
            {groupedSlots.length > 0 ? (
              <div className="flex flex-col gap-4">
                {groupedSlots.map(([dateKey, daySlots]) => (
                  <div key={dateKey}>
                    <p className="mb-2 text-sm font-medium text-gray-700">{mxDateLabel(dateKey)}</p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((slot) => (
                        <button
                          key={slot.startAt}
                          type="button"
                          disabled={!patientId || bookingSlot !== null}
                          onClick={() => book(slot)}
                          className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-base text-gray-900 hover:bg-brand-100 disabled:pointer-events-none disabled:opacity-50"
                        >
                          {bookingSlot === slot.startAt ? "Agendando…" : mxTime(slot.startAt)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!patientId && slots && slots.length > 0 ? (
              <p className="mt-3 text-sm text-warn-600">Selecciona un paciente para poder agendar.</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
