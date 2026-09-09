"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, ErrorState } from "@/components/ui/states";

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

const VERIFICATION_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Por revisar",
  IN_REVIEW: "En revisión",
  VERIFIED: "Verificado",
  VERIFIED_SPECIALTY_UNCONFIRMED: "Verificado (especialidad sin confirmar)",
  REJECTED: "Rechazado",
  SUSPENDED: "Suspendido",
};

const APPOINTMENT_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En consulta",
  COMPLETED: "Completada",
  CANCELLED_BY_PATIENT: "Cancelada por paciente",
  CANCELLED_BY_DOCTOR: "Cancelada por médico",
  NO_SHOW: "No se presentó",
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
        <h1 className="font-heading text-2xl text-brand-900">Métricas</h1>
        <p className="text-base text-gray-500">Salud operativa de la plataforma — sin contenido clínico.</p>
      </div>

      {metrics === null && !error ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={load} /> : null}

      {metrics ? (
        <>
          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">Cola de verificación</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Médicos en cola" value={String(metrics.verificationQueue.pending)} />
              <StatCard
                label="Más de 24h hábiles esperando"
                value={String(metrics.verificationQueue.overdue)}
                hint="M13-CA-003"
              />
            </div>
            {Object.keys(metrics.doctorsByVerificationStatus).length > 0 ? (
              <ul className="mt-4 flex flex-col gap-1 text-sm text-gray-600">
                {Object.entries(metrics.doctorsByVerificationStatus).map(([status, count]) => (
                  <li key={status}>
                    {VERIFICATION_LABELS[status] ?? status}: <span className="font-medium text-gray-900">{count}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">Actividad clínica</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Médicos activos (30 días)" value={String(metrics.activeDoctors30d)} hint="≥1 nota firmada" />
              <StatCard label="Notas firmadas" value={String(metrics.signedNotesCount)} />
              <StatCard label="Recetas emitidas" value={String(metrics.prescriptionsIssuedCount)} />
              <StatCard
                label="Tasa de no-show"
                value={metrics.noShowRate === null ? "Sin datos" : `${Math.round(metrics.noShowRate * 100)}%`}
                hint="De citas completadas o no presentadas"
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">Citas por estado</h2>
            {Object.keys(metrics.appointmentsByStatus).length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-gray-600">
                {Object.entries(metrics.appointmentsByStatus).map(([status, count]) => (
                  <li key={status}>
                    {APPOINTMENT_LABELS[status] ?? status}: <span className="font-medium text-gray-900">{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Sin citas registradas todavía.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-medium text-gray-900">Negocio</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="MRR" value="No disponible" hint="Requiere M6 (facturación) — no construido todavía" />
              <StatCard label="Churn" value="No disponible" hint="Requiere M6 (facturación) — no construido todavía" />
            </div>
          </Card>
        </>
      ) : null}
    </main>
  );
}
