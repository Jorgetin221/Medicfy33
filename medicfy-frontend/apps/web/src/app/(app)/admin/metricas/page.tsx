"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, ErrorState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { translateKeyed } from "@/lib/i18n/keyed";

interface AdminMetrics {
  doctorsByVerificationStatus: Record<string, number>;
  activeDoctors30d: number;
  appointmentsByStatus: Record<string, number>;
  noShowRate: number | null;
  signedNotesCount: number;
  prescriptionsIssuedCount: number;
  verificationQueue: { pending: number; overdue: number };
  mrr: number | null;
  churn: number | null;
}

const VERIFICATION_LABEL_KEYS: Record<string, MessageKey> = {
  DRAFT: "admin.verificacionEstado.DRAFT",
  SUBMITTED: "admin.verificacionEstado.SUBMITTED",
  IN_REVIEW: "admin.verificacionEstado.IN_REVIEW",
  VERIFIED: "admin.verificacionEstado.VERIFIED",
  VERIFIED_SPECIALTY_UNCONFIRMED: "admin.verificacionEstado.VERIFIED_SPECIALTY_UNCONFIRMED",
  REJECTED: "admin.verificacionEstado.REJECTED",
  SUSPENDED: "admin.verificacionEstado.SUSPENDED",
};

const APPOINTMENT_LABEL_KEYS: Record<string, MessageKey> = {
  PENDING_PAYMENT: "admin.citaEstado.PENDING_PAYMENT",
  SCHEDULED: "admin.citaEstado.SCHEDULED",
  CONFIRMED: "admin.citaEstado.CONFIRMED",
  IN_PROGRESS: "admin.citaEstado.IN_PROGRESS",
  COMPLETED: "admin.citaEstado.COMPLETED",
  CANCELLED_BY_PATIENT: "admin.citaEstado.CANCELLED_BY_PATIENT",
  CANCELLED_BY_DOCTOR: "admin.citaEstado.CANCELLED_BY_DOCTOR",
  NO_SHOW: "admin.citaEstado.NO_SHOW",
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-gray-300 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

// M13-RN-005. MRR y churn se muestran como "No disponible" — vienen
// null del backend porque M6 (facturación) no existe todavía. No se
// simula un valor para que la pantalla "se vea completa".
export default function AdminMetricasPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <MetricsView accessToken={accessToken} />;
}

function MetricsView({ accessToken }: { accessToken: string }) {
  const t = useT();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setMetrics(null);
    apiFetch<AdminMetrics>("/admin/metrics", { accessToken })
      .then(setMetrics)
      .catch((err: unknown) => setError(err));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("admin.metricas.titulo")}</h1>
        <p className="text-base text-gray-500">{t("admin.metricas.subtitulo")}</p>
      </div>

      {metrics === null && !error ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={load} /> : null}

      {metrics ? (
        <>
          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">{t("admin.metricas.colaTitulo")}</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label={t("admin.metricas.medicosEnCola")} value={String(metrics.verificationQueue.pending)} />
              <StatCard
                label={t("admin.metricas.masDe24h")}
                value={String(metrics.verificationQueue.overdue)}
                hint="M13-CA-003"
              />
            </div>
            {Object.keys(metrics.doctorsByVerificationStatus).length > 0 ? (
              <ul className="mt-4 flex flex-col gap-1 text-sm text-gray-600">
                {Object.entries(metrics.doctorsByVerificationStatus).map(([status, count]) => (
                  <li key={status}>
                    {translateKeyed(t, VERIFICATION_LABEL_KEYS, status)}: <span className="font-medium text-gray-900">{count}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">{t("admin.metricas.actividadClinica")}</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label={t("admin.metricas.medicosActivos")} value={String(metrics.activeDoctors30d)} hint={t("admin.metricas.pistaMedicosActivos")} />
              <StatCard label={t("admin.metricas.notasFirmadas")} value={String(metrics.signedNotesCount)} />
              <StatCard label={t("admin.metricas.recetasEmitidas")} value={String(metrics.prescriptionsIssuedCount)} />
              <StatCard
                label={t("admin.metricas.tasaNoShow")}
                value={metrics.noShowRate === null ? t("admin.metricas.sinDatos") : `${Math.round(metrics.noShowRate * 100)}%`}
                hint={t("admin.metricas.pistaNoShow")}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">{t("admin.metricas.citasPorEstado")}</h2>
            {Object.keys(metrics.appointmentsByStatus).length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-gray-600">
                {Object.entries(metrics.appointmentsByStatus).map(([status, count]) => (
                  <li key={status}>
                    {translateKeyed(t, APPOINTMENT_LABEL_KEYS, status)}: <span className="font-medium text-gray-900">{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">{t("admin.metricas.sinCitas")}</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">{t("admin.metricas.negocio")}</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="MRR" value={t("admin.metricas.noDisponible")} hint={t("admin.metricas.requiereM6")} />
              <StatCard label="Churn" value={t("admin.metricas.noDisponible")} hint={t("admin.metricas.requiereM6")} />
            </div>
          </Card>
        </>
      ) : null}
    </main>
  );
}
