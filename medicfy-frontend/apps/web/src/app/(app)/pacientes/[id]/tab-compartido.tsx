"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecordShareCustodianGrant } from "@medicfy/contracts";
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

// PR-EXP-06 — pestaña "Compartido" del médico tratante (custodio):
// quién tiene/tuvo acceso autorizado por el paciente, cuándo lo
// consultó, y reporte de uso indebido. El custodio NO revoca — esa
// decisión es del paciente (06-notificaciones-revocacion-caducidad.md
// decisión 7).
export function TabCompartido({ patientId, accessToken }: { patientId: string; accessToken: string | null }) {
  const t = useT();
  const { locale } = useI18n();
  const [grants, setGrants] = useState<RecordShareCustodianGrant[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [reportError, setReportError] = useState<unknown>(null);
  const [reportSent, setReportSent] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setGrants(expectArray<RecordShareCustodianGrant>(await apiFetch<unknown>(`/record-share/patients/${patientId}/shares`, { accessToken })));
    } catch (error) {
      setLoadError(error);
    }
  }, [patientId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReport(grantId: string) {
    setReportError(null);
    setPending(true);
    try {
      await apiFetch(`/record-share/patients/${patientId}/grants/${grantId}/report-abuse`, {
        method: "POST",
        accessToken,
        body: { reason: reason.trim() },
      });
      setReportingId(null);
      setReason("");
      setReportSent(true);
      await load();
    } catch (error) {
      setReportError(error);
    } finally {
      setPending(false);
    }
  }

  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;
  if (grants === null) return <LoadingState label={t("expedienteCompartido.custodio.cargando")} />;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-lg text-brand-900">{t("expedienteCompartido.custodio.titulo")}</h2>
          <p className="text-sm text-gray-500">{t("expedienteCompartido.custodio.ayuda")}</p>
        </div>

        {reportSent && <Aviso variant="exito" title={t("expedienteCompartido.custodio.reporteEnviado")} />}

        {grants.length === 0 ? (
          <EmptyState title={t("expedienteCompartido.custodio.vacio")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {grants.map((grant) => {
              const lastView = grant.views[0];
              const trimmed = reason.trim();
              return (
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
                    <strong>{t("expedienteCompartido.custodio.columnas.alcance")}:</strong>{" "}
                    {grant.scope.map((s) => t(`expedienteCompartido.solicitar.alcanceOpciones.${s}` as MessageKey)).join(" · ")}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>{t("expedienteCompartido.custodio.columnas.vigencia")}:</strong>{" "}
                    {t("expedienteCompartido.custodio.vigencia", {
                      inicio: formatDateMedium(locale, grant.startsAt),
                      fin: formatDateMedium(locale, grant.revokedAt ?? grant.expiresAt),
                    })}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>{t("expedienteCompartido.custodio.columnas.consultas")}:</strong>{" "}
                    {lastView
                      ? t("expedienteCompartido.custodio.consultasN", { n: grant.views.length, fecha: formatDateTimeMedium(locale, lastView.viewedAt) })
                      : t("expedienteCompartido.custodio.sinConsultas")}
                  </p>

                  {grant.abuseReported ? (
                    <p className="text-sm font-medium text-gray-700">{t("expedienteCompartido.custodio.reportado")}</p>
                  ) : reportingId === grant.id ? (
                    <div className="flex flex-col gap-2">
                      <FieldWrapper label={t("expedienteCompartido.custodio.reporteMotivo")} htmlFor={`abuse-reason-${grant.id}`}>
                        <Textarea
                          id={`abuse-reason-${grant.id}`}
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
                          disabled={pending || trimmed.length < MIN_REASON_LENGTH}
                          onClick={() => void submitReport(grant.id)}
                        >
                          {t("expedienteCompartido.custodio.reporteEnviar")}
                        </Button>
                        <Button type="button" variant="secondary" disabled={pending} onClick={() => setReportingId(null)}>
                          {t("expedienteCompartido.custodio.reporteCancelar")}
                        </Button>
                      </div>
                      {reportError ? <ErrorState error={reportError} /> : null}
                    </div>
                  ) : (
                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setReportingId(grant.id);
                          setReason("");
                          setReportSent(false);
                        }}
                      >
                        {t("expedienteCompartido.custodio.reportar")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
