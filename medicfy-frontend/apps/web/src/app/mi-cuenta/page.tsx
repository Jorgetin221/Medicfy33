"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { IconPulse, IconLogout } from "@/components/ui/nav-icons";
import { EstadoCita, type AppointmentStatus } from "@/components/ui/status-badge";
import { useI18n, useT } from "@/lib/i18n/context";
import { formatDateTimeLong } from "@/lib/i18n/format";

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

// M5-RN-009 (spec §7, v2.3): portal mínimo real de paciente — fuera
// del grupo (app) a propósito, mismo criterio que /dr/[slug]: AppNav
// es enteramente de médico (Agenda/Pacientes/Disponibilidad), no
// tiene sentido para una sesión PATIENT.
export default function MiCuentaPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading, logout } = useAuth();
  const t = useT();

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
          {t("nav.rail.cerrarSesion")}
        </button>
      </header>
      <MiCuentaContent accessToken={accessToken} />
    </div>
  );
}

function MiCuentaContent({ accessToken }: { accessToken: string }) {
  const t = useT();
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
        <h1 className="font-heading text-2xl text-brand-900">{t("cuenta.titulo")}</h1>
        <p className="text-base text-gray-500">{t("cuenta.subtitulo")}</p>
      </div>

      {profile === null && !error ? <LoadingState /> : null}
      {notFound ? (
        <Card>
          <p className="text-base text-gray-700">
            {t("cuenta.sinExpediente")}
          </p>
        </Card>
      ) : null}
      {error && !notFound ? <ErrorState error={error} /> : null}

      {profile ? (
        <Card>
          <h2 className="font-heading text-lg text-brand-900">{t("cuenta.datosPersonales")}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-base text-gray-900">
            <div>
              <dt className="text-sm text-gray-500">{t("cuenta.nombre")}</dt>
              <dd>
                {profile.firstName} {profile.lastNamePaternal} {profile.lastNameMaternal ?? ""}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">{t("cuenta.medicfyId")}</dt>
              <dd>{profile.medicfyId}</dd>
            </div>
            <div className="col-span-2 break-all">
              <dt className="text-sm text-gray-500">{t("cuenta.correo")}</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">{t("cuenta.telefono")}</dt>
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
  const { t, locale } = useI18n();
  const [appointments, setAppointments] = useState<OwnAppointment[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/patients/me/appointments", { accessToken })
      .then((data) => {
        if (!cancelled) setAppointments(expectArray<OwnAppointment>(data));
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
      <h2 className="font-heading text-lg text-brand-900">{t("cuenta.misCitas")}</h2>
      <div className="mt-4">
        {appointments === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} /> : null}
        {appointments && appointments.length === 0 ? (
          <EmptyState
            title={t("cuenta.sinCitas")}
            description={t("cuenta.sinCitasAyuda")}
            action={
              <Link href="/doctores" className="text-sm font-medium text-brand-700 underline">
                {t("cuenta.buscarMedico")}
              </Link>
            }
          />
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
                    {a.service.name} · {formatDateTimeLong(locale, a.startsAt)}
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
