"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  patientId: string | null;
  ipAddress: string | null;
  result: "SUCCESS" | "DENIED";
  occurredAt: string;
}

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

const ACTOR_ROLE_LABEL: Record<string, string> = { DOCTOR: "Médico", ASSISTANT: "Asistente", ADMIN: "Administrador", PATIENT: "Paciente" };

// Fase 6 · Prompt 45: "panel de auditoría para el médico titular:
// quién ha visto a sus pacientes." Lee GET /doctors/me/patient-access-log
// (agrega audit_log sobre todos los pacientes con care_relationship
// activo con el médico autenticado). audit_log no guarda relaciones
// hacia User/Patient a propósito (la fila debe sobrevivir aunque el
// paciente referenciado ya no se pueda resolver) — por eso aquí solo
// se muestra el rol del actor y un enlace directo al expediente del
// paciente en vez de intentar resolver nombres.
export default function AuditoriaPage() {
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

  return <AuditoriaContent accessToken={accessToken} />;
}

function AuditoriaContent({ accessToken }: { accessToken: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<AuditLogEntry[]>("/doctors/me/patient-access-log", { accessToken })
      .then(setEntries)
      .catch(setError);
  }, [accessToken]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Auditoría</h1>
        <p className="text-base text-gray-500">Quién ha accedido al expediente de tus pacientes, cuándo y desde dónde — incluidos tus propios accesos.</p>
      </div>

      <Card>
        {error ? <ErrorState error={error} /> : null}
        {!entries && !error ? <LoadingState label="Cargando bitácora…" /> : null}
        {entries && entries.length === 0 ? (
          <EmptyState title="Sin registros todavía" description="Aquí aparecerá cada acceso al expediente de tus pacientes." />
        ) : null}
        {entries && entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-gray-500">
                  <th className="py-2 pr-3 font-medium">Cuándo</th>
                  <th className="py-2 pr-3 font-medium">Quién</th>
                  <th className="py-2 pr-3 font-medium">Acción</th>
                  <th className="py-2 pr-3 font-medium">Paciente</th>
                  <th className="py-2 pr-3 font-medium">Desde</th>
                  <th className="py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 text-gray-900">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatMxDateTime(entry.occurredAt)}</td>
                    <td className="py-2 pr-3">{entry.actorRole ? (ACTOR_ROLE_LABEL[entry.actorRole] ?? entry.actorRole) : "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-700">{entry.action}</td>
                    <td className="py-2 pr-3">
                      {entry.patientId ? (
                        <Link href={`/pacientes/${entry.patientId}`} className="text-brand-700 underline">
                          Ver expediente
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{entry.ipAddress ?? "—"}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          entry.result === "SUCCESS" ? "border-success-600 text-success-600" : "border-danger-600 text-danger-600"
                        }`}
                      >
                        {entry.result === "SUCCESS" ? "Concedido" : "Denegado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
