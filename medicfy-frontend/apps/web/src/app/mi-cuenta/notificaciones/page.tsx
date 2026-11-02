"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PatientShareGrantItem, PatientShareRequestItem, RecordShareDecisionInput } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { PatientPortalHeader } from "@/components/patient-portal-header";
import { DecisionForm, RequestSummary } from "@/components/record-share/share-decision-form";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDateMedium, formatDateTimeMedium } from "@/lib/i18n/format";

// Notificaciones del paciente con cuenta: solicitudes de médicos para
// ver su expediente (aprobar o rechazar con la sesión iniciada, mismas
// opciones que la página pública) y los accesos que ya autorizó, para
// revocarlos cuando quiera.
export default function NotificacionesPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <div className="min-h-screen bg-gray-100">
      <PatientPortalHeader accessToken={accessToken} refreshKey={refreshKey} />
      <NotificacionesContent accessToken={accessToken} onChanged={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}

type Outcome = "aprobada" | "aprobadaFaltaMedico" | "rechazada" | "revocado";

function NotificacionesContent({ accessToken, onChanged }: { accessToken: string; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const [requests, setRequests] = useState<PatientShareRequestItem[] | null>(null);
  const [grants, setGrants] = useState<PatientShareGrantItem[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [requestData, grantData] = await Promise.all([
        apiFetch<unknown>("/record-share/me/requests", { accessToken }),
        apiFetch<unknown>("/record-share/me/grants", { accessToken }),
      ]);
      setRequests(expectArray<PatientShareRequestItem>(requestData));
      setGrants(expectArray<PatientShareGrantItem>(grantData));
    } catch (error) {
      setLoadError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(requestId: string, body: RecordShareDecisionInput) {
    setActionError(null);
    setPendingId(requestId);
    try {
      const res = await apiFetch<{ status: "APPROVED" | "DENIED" | "PENDING_CUSTODIAN" }>(`/record-share/me/requests/${requestId}/decide`, {
        method: "POST",
        body,
        accessToken,
      });
      setOutcome(res.status === "APPROVED" ? "aprobada" : res.status === "PENDING_CUSTODIAN" ? "aprobadaFaltaMedico" : "rechazada");
      setOpenId(null);
      await load();
      onChanged();
    } catch (error) {
      setActionError(error);
      // Si el texto cambió (p. ej. pasó la medianoche y la fecha de
      // vencimiento es otra), se recarga para que lo lea de nuevo.
      await load();
    } finally {
      setPendingId(null);
    }
  }

  async function revoke(grant: PatientShareGrantItem) {
    const accepted = await confirm({
      title: t("expedienteCompartido.bandeja.revocarConfirmarTitulo"),
      body: t("expedienteCompartido.bandeja.revocarConfirmarCuerpo", { medico: grant.requesterDisplayName }),
      confirmLabel: t("expedienteCompartido.bandeja.revocar"),
      destructive: true,
    });
    if (!accepted) return;
    setActionError(null);
    setPendingId(grant.id);
    try {
      await apiFetch(`/record-share/me/grants/${grant.id}/revoke`, { method: "POST", accessToken });
      setOutcome("revocado");
      await load();
    } catch (error) {
      setActionError(error);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/mi-cuenta" className="text-sm font-medium text-brand-700 underline">
          {t("expedienteCompartido.bandeja.volver")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl text-brand-900">{t("expedienteCompartido.bandeja.titulo")}</h1>
        <p className="text-base text-gray-500">{t("expedienteCompartido.bandeja.subtitulo")}</p>
      </div>

      {outcome ? <Aviso variant="exito" title={t(`expedienteCompartido.bandeja.${outcome}` as MessageKey)} /> : null}
      {actionError ? <ErrorState error={actionError} /> : null}
      {loadError ? <ErrorState error={loadError} onRetry={() => void load()} /> : null}
      {!loadError && (requests === null || grants === null) ? <LoadingState label={t("expedienteCompartido.bandeja.cargando")} /> : null}

      {requests ? (
        <Card>
          <h2 className="font-heading text-lg text-brand-900">{t("expedienteCompartido.bandeja.pendientesTitulo")}</h2>
          <div className="mt-4">
            {requests.length === 0 ? (
              <EmptyState title={t("expedienteCompartido.bandeja.sinPendientes")} description={t("expedienteCompartido.bandeja.sinPendientesAyuda")} />
            ) : (
              <ul className="flex flex-col gap-4">
                {requests.map((request) => (
                  <li key={request.id} className="flex flex-col gap-3 rounded-md border border-gray-300 p-4">
                    <RequestSummary info={request} t={t} />
                    <p className="text-sm text-gray-700">{t("expedienteCompartido.bandeja.expedienteDe", { medico: request.custodianDisplayName })}</p>
                    <p className="text-sm text-gray-500">
                      {t("expedienteCompartido.bandeja.recibida", {
                        fecha: formatDateMedium(locale, request.createdAt),
                        vence: formatDateMedium(locale, request.expiresAt),
                      })}
                    </p>
                    {request.awaitingCustodian ? (
                      <Aviso variant="info" title={t("expedienteCompartido.bandeja.esperandoMedico", { medico: request.custodianDisplayName })} />
                    ) : openId === request.id ? (
                      <>
                        <DecisionForm info={request} pending={pendingId === request.id} onDecide={(body) => void decide(request.id, body)} t={t} />
                        <div>
                          <Button type="button" variant="secondary" disabled={pendingId === request.id} onClick={() => setOpenId(null)}>
                            {t("expedienteCompartido.bandeja.ocultar")}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div>
                        <Button
                          type="button"
                          onClick={() => {
                            setOpenId(request.id);
                            setOutcome(null);
                            setActionError(null);
                          }}
                        >
                          {t("expedienteCompartido.bandeja.revisar")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {grants ? (
        <Card>
          <h2 className="font-heading text-lg text-brand-900">{t("expedienteCompartido.bandeja.accesosTitulo")}</h2>
          <div className="mt-4">
            {grants.length === 0 ? (
              <p className="text-base text-gray-700">{t("expedienteCompartido.bandeja.sinAccesos")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {grants.map((grant) => (
                  <li key={grant.id} className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base text-gray-900">
                        <strong>{grant.requesterDisplayName}</strong> · {grant.requesterLicense}
                      </p>
                      <span className="rounded-full border border-gray-400 px-2 py-0.5 text-sm text-gray-700">
                        {t(`expedienteCompartido.custodio.estados.${grant.status}` as MessageKey)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      {grant.scope.map((s) => t(`expedienteCompartido.solicitar.alcanceOpciones.${s}` as MessageKey)).join(" · ")}
                    </p>
                    <p className="text-sm text-gray-700">
                      {t("expedienteCompartido.bandeja.vigencia", {
                        inicio: formatDateMedium(locale, grant.startsAt),
                        fin: formatDateMedium(locale, grant.revokedAt ?? grant.expiresAt),
                      })}
                    </p>
                    <p className="text-sm text-gray-700">
                      {grant.views.length > 0
                        ? t("expedienteCompartido.bandeja.consultas", {
                            n: grant.views.length,
                            fecha: formatDateTimeMedium(locale, grant.views[0]?.viewedAt ?? grant.startsAt),
                          })
                        : t("expedienteCompartido.bandeja.sinConsultas")}
                    </p>
                    {grant.status === "ACTIVE" ? (
                      <div>
                        <Button type="button" variant="destructive" isLoading={pendingId === grant.id} disabled={pendingId !== null} onClick={() => void revoke(grant)}>
                          {t("expedienteCompartido.bandeja.revocar")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {dialog}
    </main>
  );
}
