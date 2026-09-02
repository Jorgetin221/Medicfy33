"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { IconPulse, IconLogout } from "@/components/ui/nav-icons";
import { EstadoCita, type AppointmentStatus } from "@/components/ui/status-badge";

interface OwnPatientProfile {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  email: string;
  phoneE164: string;
}

interface OwnAppointment {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  doctor: { displayName: string | null; legalFirstName: string; legalLastName: string; slug: string };
  service: { name: string; durationMinutes: number };
}

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}

// M5-RN-009 (spec §7, v2.3): portal mínimo real de paciente — fuera
// del grupo (app) a propósito, mismo criterio que /dr/[slug]: AppNav
// es enteramente de médico (Agenda/Pacientes/Disponibilidad), no
// tiene sentido para una sesión PATIENT.
export default function MiCuentaPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading, logout } = useAuth();

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

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="flex items-center justify-between border-b border-gray-300 bg-white px-6 py-4">
        <span className="flex items-center gap-2 font-heading text-lg text-brand-900">
          <IconPulse className="h-6 w-6 text-brand-700" />
          Medicfy
        </span>
        <button type="button" onClick={() => void handleLogout()} className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <IconLogout className="h-5 w-5" />
          Cerrar sesión
        </button>
      </header>
      <MiCuentaContent accessToken={accessToken} />
    </div>
  );
}

function MiCuentaContent({ accessToken }: { accessToken: string }) {
  const [profile, setProfile] = useState<OwnPatientProfile | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<OwnPatientProfile>("/patients/me", { accessToken })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Mi cuenta</h1>
        <p className="text-base text-gray-500">Tus datos y tus citas con tus médicos.</p>
      </div>

      {profile === null && !error ? <LoadingState /> : null}
      {notFound ? (
        <Card>
          <p className="text-base text-gray-700">
            Tu cuenta todavía no tiene un expediente de paciente asociado. Contacta a tu médico para vincularlo.
          </p>
        </Card>
      ) : null}
      {error && !notFound ? <ErrorState error={error} /> : null}

      {profile ? (
        <Card>
          <h2 className="font-heading text-lg text-brand-900">Datos personales</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-base text-gray-900">
            <div>
              <dt className="text-sm text-gray-500">Nombre</dt>
              <dd>
                {profile.firstName} {profile.lastNamePaternal} {profile.lastNameMaternal ?? ""}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Medicfy ID</dt>
              <dd>{profile.medicfyId}</dd>
            </div>
            <div className="col-span-2 break-all">
              <dt className="text-sm text-gray-500">Correo</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Teléfono</dt>
              <dd>{profile.phoneE164}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {profile ? <AppointmentsSection accessToken={accessToken} /> : null}
    </main>
  );
}

function AppointmentsSection({ accessToken }: { accessToken: string }) {
  const [appointments, setAppointments] = useState<OwnAppointment[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<OwnAppointment[]>("/patients/me/appointments", { accessToken })
      .then((data) => {
        if (!cancelled) setAppointments(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <Card>
      <h2 className="font-heading text-lg text-brand-900">Mis citas</h2>
      <div className="mt-4">
        {appointments === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} /> : null}
        {appointments && appointments.length === 0 ? (
          <EmptyState title="Sin citas todavía" description="Agenda desde el perfil público de tu médico." />
        ) : null}
        {appointments && appointments.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <div>
                  <p className="text-base font-medium text-gray-900">
                    {a.doctor.displayName ?? `${a.doctor.legalFirstName} ${a.doctor.legalLastName}`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {a.service.name} · {formatMxDateTime(a.startsAt)}
                  </p>
                </div>
                <EstadoCita status={a.status} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
