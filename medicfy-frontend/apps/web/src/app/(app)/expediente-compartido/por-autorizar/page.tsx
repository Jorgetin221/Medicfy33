"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustodianShareRequestItem } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/ui/alert";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDateMedium } from "@/lib/i18n/format";
import { notifyCustodianRequestsChanged } from "@/lib/custodian-requests-events";

type Outcome = "aprobadaActiva" | "aprobadaFaltaPaciente" | "rechazada";

// Bandeja del médico TRATANTE: otros médicos piden ver el expediente de
// sus pacientes. Doble autorización — el acceso solo se crea cuando
// este médico y el paciente aprueban, en cualquier orden.
export default function PorAutorizarPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { accessToken, isLoading: authLoading } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [requests, setRequests] = useState<CustodianShareRequestItem[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRequests(expectArray<CustodianShareRequestItem>(await apiFetch<unknown>("/record-share/custodian/requests", { accessToken })));
    } catch (error) {
      setLoadError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
      return;
    }
    if (accessToken) void load();
  }, [authLoading, accessToken, router, load]);

  async function decide(request: CustodianShareRequestItem, decision: "APPROVED" | "DENIED") {
    const accepted = await confirm(
      decision === "APPROVED"
        ? {
            title: t("expedienteCompartido.porAutorizar.confirmarAprobarTitulo"),
            body: t("expedienteCompartido.porAutorizar.confirmarAprobarCuerpo", { medico: request.requesterDisplayName, paciente: request.patientName }),
            confirmLabel: t("expedienteCompartido.porAutorizar.aprobar"),
          }
        : {
            title: t("expedienteCompartido.porAutorizar.confirmarRechazarTitulo"),
            body: t("expedienteCompartido.porAutorizar.confirmarRechazarCuerpo", { medico: request.requesterDisplayName }),
            confirmLabel: t("expedienteCompartido.porAutorizar.rechazar"),
            destructive: true,
          }
    );
    if (!accepted) return;
    setActionError(null);
    setPendingId(request.id);
    try {
      const res = await apiFetch<{ status: "APPROVED" | "PENDING_PATIENT" | "DENIED" }>(`/record-share/custodian/requests/${request.id}/decide`, {
        method: "POST",
        body: { decision },
        accessToken,
      });
      setOutcome(res.status === "APPROVED" ? "aprobadaActiva" : res.status === "PENDING_PATIENT" ? "aprobadaFaltaPaciente" : "rechazada");
      await load();
      notifyCustodianRequestsChanged();
    } catch (error) {
      setActionError(error);
    } finally {
      setPendingId(null);
    }
  }

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <LoadingState />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.porAutorizar.titulo")}</h1>
        <p className="text-base text-gray-500">{t("expedienteCompartido.porAutorizar.subtitulo")}</p>
      </div>

      {outcome ? <Aviso variant="exito" title={t(`expedienteCompartido.porAutorizar.${outcome}` as MessageKey)} /> : null}
      {actionError ? <ErrorState error={actionError} /> : null}
      {loadError ? <ErrorState error={loadError} onRetry={() => void load()} /> : null}
      {!loadError && requests === null ? <LoadingState label={t("expedienteCompartido.porAutorizar.cargando")} /> : null}

      {requests && requests.length === 0 ? <EmptyState title={t("expedienteCompartido.porAutorizar.vacio")} /> : null}

      {requests && requests.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-900">
                    <strong>{request.requesterDisplayName}</strong> ({t("expedienteCompartido.autorizar.solicitud.cedula")} {request.requesterLicense}
                    {request.requesterSpecialtyName ? `, ${request.requesterSpecialtyName}` : ""}) {t("expedienteCompartido.porAutorizar.pideVer")}
                  </p>
                  <p className="text-base text-gray-900">
                    <strong>{t("expedienteCompartido.porAutorizar.paciente")}:</strong>{" "}
                    <Link href={`/pacientes/${request.patientId}`} className="font-medium text-brand-700 underline">
                      {request.patientName}
                    </Link>{" "}
                    · {request.patientMedicfyId}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>{t("expedienteCompartido.autorizar.solicitud.motivo")}:</strong> {request.reason}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>{t("expedienteCompartido.autorizar.solicitud.pideVer")}:</strong>{" "}
                    {request.requestedScope.map((scope) => t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)).join(" · ")}
                  </p>
                  <p className="text-sm text-gray-700">{t("expedienteCompartido.autorizar.solicitud.porHastaDias", { dias: request.requestedDurationDays })}</p>
                  <p className="text-sm text-gray-500">
                    {t("expedienteCompartido.porAutorizar.recibida", {
                      fecha: formatDateMedium(locale, request.createdAt),
                      vence: formatDateMedium(locale, request.expiresAt),
                    })}
                  </p>
                  <Aviso
                    variant={request.patientApproved ? "exito" : "info"}
                    title={t(request.patientApproved ? "expedienteCompartido.porAutorizar.pacienteYaAutorizo" : "expedienteCompartido.porAutorizar.pacientePendiente")}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" isLoading={pendingId === request.id} disabled={pendingId !== null} onClick={() => void decide(request, "APPROVED")}>
                      {t("expedienteCompartido.porAutorizar.aprobar")}
                    </Button>
                    <Button type="button" variant="destructive" disabled={pendingId !== null} onClick={() => void decide(request, "DENIED")}>
                      {t("expedienteCompartido.porAutorizar.rechazar")}
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {dialog}
    </main>
  );
}
