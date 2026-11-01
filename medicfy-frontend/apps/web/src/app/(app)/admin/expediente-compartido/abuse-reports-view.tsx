"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecordShareAbuseReport } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper, Textarea } from "@/components/ui/field";
import { useI18n, useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDateMedium, formatDateTimeMedium } from "@/lib/i18n/format";

const MIN_REASON_LENGTH = 15;
const MAX_REASON_LENGTH = 500;

export function AbuseReportsView({ accessToken }: { accessToken: string }) {
  const t = useT();
  const { locale } = useI18n();
  const [reports, setReports] = useState<RecordShareAbuseReport[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [suspendingAuditId, setSuspendingAuditId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [suspended, setSuspended] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setReports(expectArray<RecordShareAbuseReport>(await apiFetch<unknown>("/admin/record-share/abuse-reports", { accessToken })));
    } catch (error) {
      setLoadError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function suspend(grantId: string) {
    setActionError(null);
    setPending(true);
    try {
      await apiFetch(`/admin/record-share/grants/${grantId}/suspend`, { method: "POST", accessToken, body: { reason: reason.trim() } });
      setSuspendingAuditId(null);
      setReason("");
      setSuspended(true);
      await load();
    } catch (error) {
      setActionError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.admin.titulo")}</h1>
        <p className="text-base text-gray-500">{t("expedienteCompartido.admin.subtitulo")}</p>
      </div>

      {suspended && <Aviso variant="exito" title={t("expedienteCompartido.admin.suspendido")} />}

      {loadError ? (
        <ErrorState error={loadError} onRetry={() => void load()} />
      ) : reports === null ? (
        <LoadingState />
      ) : reports.length === 0 ? (
        <EmptyState title={t("expedienteCompartido.admin.vacio")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.auditId}>
              <Card>
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-gray-500">{t("expedienteCompartido.admin.reportadoEl", { fecha: formatDateTimeMedium(locale, report.reportedAt) })}</p>
                  <p className="text-base text-gray-900">
                    <strong>{t("expedienteCompartido.admin.solicitante")}:</strong> {report.requesterDisplayName} · {report.requesterLicense}
                  </p>
                  <p className="text-base text-gray-900">
                    <strong>{t("expedienteCompartido.admin.custodio")}:</strong> {report.custodianDisplayName}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>{t("expedienteCompartido.admin.estado")}:</strong>{" "}
                    {t(`expedienteCompartido.custodio.estados.${report.grantStatus}` as MessageKey)} · {t("expedienteCompartido.admin.vence")}{" "}
                    {formatDateMedium(locale, report.grantExpiresAt)}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>{t("expedienteCompartido.admin.motivo")}:</strong> {report.reason}
                  </p>

                  {report.grantStatus === "ACTIVE" &&
                    (suspendingAuditId === report.auditId ? (
                      <div className="flex flex-col gap-2">
                        <FieldWrapper label={t("expedienteCompartido.admin.suspenderMotivo")} htmlFor={`suspend-reason-${report.auditId}`}>
                          <Textarea
                            id={`suspend-reason-${report.auditId}`}
                            rows={3}
                            maxLength={MAX_REASON_LENGTH}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </FieldWrapper>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            isLoading={pending}
                            disabled={pending || reason.trim().length < MIN_REASON_LENGTH}
                            onClick={() => void suspend(report.grantId)}
                          >
                            {t("expedienteCompartido.admin.suspenderConfirmar")}
                          </Button>
                          <Button type="button" variant="secondary" disabled={pending} onClick={() => setSuspendingAuditId(null)}>
                            {t("expedienteCompartido.admin.cancelar")}
                          </Button>
                        </div>
                        {actionError ? <ErrorState error={actionError} /> : null}
                      </div>
                    ) : (
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setSuspendingAuditId(report.auditId);
                            setReason("");
                            setSuspended(false);
                          }}
                        >
                          {t("expedienteCompartido.admin.suspender")}
                        </Button>
                      </div>
                    ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
