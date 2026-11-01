"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ShareRequestSummary } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n, useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDateTimeMedium } from "@/lib/i18n/format";

// PR-EXP-02 — "Mis solicitudes": bandeja del médico SOLICITANTE.
// RE5 aplicada aquí también: DENIED y EXPIRED_UNANSWERED se traducen
// al MISMO texto ("No autorizada", ver i18n) — este médico ya sabe
// que la solicitud es suya, pero no se le dice si el paciente la
// rechazó o si nadie respondió a tiempo.
export default function MisSolicitudesExpedienteCompartidoPage() {
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const { accessToken, isLoading: authLoading } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [requests, setRequests] = useState<ShareRequestSummary[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = expectArray<ShareRequestSummary>(await apiFetch<unknown>("/record-share/requests/mine", { accessToken }));
      setRequests(list);
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

  async function cancelRequest(id: string) {
    const ok = await confirm({ title: t("expedienteCompartido.misSolicitudes.cancelarConfirmar"), destructive: true });
    if (!ok) return;
    setCancellingId(id);
    try {
      await apiFetch(`/record-share/requests/${id}/cancel`, { method: "POST", accessToken });
      await load();
    } catch {
      setLoadError(new Error(t("expedienteCompartido.misSolicitudes.errorCancelar")));
    } finally {
      setCancellingId(null);
    }
  }

  if (authLoading || !accessToken || requests === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {loadError ? <ErrorState error={loadError} onRetry={load} /> : <LoadingState />}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.misSolicitudes.titulo")}</h1>
          <p className="text-base text-gray-500">{t("expedienteCompartido.misSolicitudes.subtitulo")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/expediente-compartido/compartidos-conmigo" className="flex min-h-11 items-center text-base font-medium text-brand-700 underline">
            {t("expedienteCompartido.compartidosConmigo.titulo")}
          </Link>
          <Link href="/expediente-compartido/solicitar">
            <Button>{t("expedienteCompartido.misSolicitudes.nueva")}</Button>
          </Link>
        </div>
      </div>

      {loadError ? <ErrorState error={loadError} onRetry={load} /> : null}

      {requests.length === 0 ? (
        <EmptyState
          title={t("expedienteCompartido.misSolicitudes.vacio")}
          action={
            <Link href="/expediente-compartido/solicitar">
              <Button>{t("expedienteCompartido.misSolicitudes.nueva")}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-base text-gray-900">{r.reason}</p>
                  <span className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                    {t(`expedienteCompartido.misSolicitudes.estado.${r.status}` as MessageKey)}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  {r.requestedScope.map((scope) => t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)).join(" · ")}
                </p>
                <p className="text-sm text-gray-500">
                  {t("expedienteCompartido.misSolicitudes.columnas.enviada")}: {formatDateTimeMedium(locale, r.createdAt)} ·{" "}
                  {t("expedienteCompartido.misSolicitudes.columnas.vence")}: {formatDateTimeMedium(locale, r.expiresAt)}
                </p>
                {r.status === "PENDING_PATIENT" && (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={cancellingId === r.id}
                      disabled={cancellingId === r.id}
                      onClick={() => void cancelRequest(r.id)}
                    >
                      {t("expedienteCompartido.misSolicitudes.cancelar")}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
