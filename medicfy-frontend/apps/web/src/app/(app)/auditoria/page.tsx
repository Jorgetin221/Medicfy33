"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useI18n } from "@/lib/i18n/context";
import { formatDateTimeMedium } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { translateKeyed } from "@/lib/i18n/keyed";
import { describeAuditAction } from "@/lib/audit-action-label";

interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  patientId: string | null;
  ipAddress: string | null;
  // B-18: nombre legal del médico que accedió (null si no es médico).
  actorName?: string | null;
  result: "SUCCESS" | "DENIED";
  occurredAt: string;
}

const ACTOR_ROLE_LABEL_KEYS: Record<string, MessageKey> = {
  DOCTOR: "auditoria.rol.DOCTOR",
  ASSISTANT: "auditoria.rol.ASSISTANT",
  ADMIN: "auditoria.rol.ADMIN",
  PATIENT: "auditoria.rol.PATIENT",
};

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
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<unknown>("/doctors/me/patient-access-log", { accessToken })
      .then((data) => setEntries(expectArray<AuditLogEntry>(data)))
      .catch(setError);
  }, [accessToken]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("auditoria.titulo")}</h1>
        <p className="text-base text-gray-500">{t("auditoria.subtitulo")}</p>
      </div>

      <Card>
        {error ? <ErrorState error={error} /> : null}
        {!entries && !error ? <LoadingState label={t("auditoria.cargando")} /> : null}
        {entries && entries.length === 0 ? (
          <EmptyState title={t("auditoria.vacio")} description={t("auditoria.vacioAyuda")} />
        ) : null}
        {entries && entries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-300 text-gray-500">
                  <th className="py-2 pr-3 font-medium">{t("auditoria.cuando")}</th>
                  <th className="py-2 pr-3 font-medium">{t("auditoria.quien")}</th>
                  <th className="py-2 pr-3 font-medium">{t("auditoria.accion")}</th>
                  <th className="py-2 pr-3 font-medium">{t("auditoria.paciente")}</th>
                  <th className="py-2 pr-3 font-medium">{t("auditoria.desde")}</th>
                  <th className="py-2 font-medium">{t("auditoria.resultado")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 text-gray-900">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTimeMedium(locale, entry.occurredAt)}</td>
                    <td className="py-2 pr-3">
                      {entry.actorName ? <span className="block font-medium">{entry.actorName}</span> : null}
                      <span className={entry.actorName ? "text-sm text-gray-500" : undefined}>
                        {entry.actorRole ? translateKeyed(t, ACTOR_ROLE_LABEL_KEYS, entry.actorRole) : "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-700" title={entry.action}>
                      {describeAuditAction(t, entry.action)}
                    </td>
                    <td className="py-2 pr-3">
                      {entry.patientId ? (
                        <Link href={`/pacientes/${entry.patientId}`} className="text-brand-700 underline">
                          {t("auditoria.verExpediente")}
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
                        {entry.result === "SUCCESS" ? t("auditoria.concedido") : t("auditoria.denegado")}
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
