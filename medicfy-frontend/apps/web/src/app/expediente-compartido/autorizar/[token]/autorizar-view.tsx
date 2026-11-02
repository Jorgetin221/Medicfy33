"use client";

import { useEffect, useState } from "react";
import type { RecordShareAuthorizationInfo, RecordShareDecisionInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper } from "@/components/ui/field";
import { useT } from "@/lib/i18n/context";
import { DecisionForm, RequestSummary } from "@/components/record-share/share-decision-form";

type Step =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "info"; info: RecordShareAuthorizationInfo }
  | { kind: "otp-sent"; info: RecordShareAuthorizationInfo }
  | { kind: "deciding"; info: RecordShareAuthorizationInfo }
  | { kind: "done"; decision: "APPROVED" | "DENIED" };

export function AutorizarExpedienteCompartidoView({ token }: { token: string }) {
  const t = useT();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionPending, setActionPending] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    apiFetch<RecordShareAuthorizationInfo>(`/record-share/authorize/${token}`)
      .then((info) => setStep({ kind: "info", info }))
      .catch(() => setStep({ kind: "invalid" }));
  }, [token]);

  async function sendOtp(info: RecordShareAuthorizationInfo) {
    setActionError(null);
    setActionPending(true);
    try {
      await apiFetch(`/record-share/authorize/${token}/otp`, { method: "POST" });
      setStep({ kind: "otp-sent", info });
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(false);
    }
  }

  async function verifyOtp(info: RecordShareAuthorizationInfo) {
    setActionError(null);
    setActionPending(true);
    try {
      await apiFetch(`/record-share/authorize/${token}/otp/verify`, { method: "POST", body: { code } });
      setStep({ kind: "deciding", info });
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(false);
    }
  }

  async function decide(body: RecordShareDecisionInput) {
    setActionError(null);
    setActionPending(true);
    try {
      await apiFetch(`/record-share/authorize/${token}/decide`, { method: "POST", body });
      setStep({ kind: "done", decision: body.decision });
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <p className="font-brand text-lg text-brand-900">Medicfy BETA</p>
        <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.autorizar.titulo")}</h1>
      </div>

      <Card>
        {step.kind === "loading" ? (
          <LoadingState label={t("expedienteCompartido.autorizar.cargando")} />
        ) : step.kind === "invalid" ? (
          <Aviso variant="advertencia" title={t("expedienteCompartido.autorizar.enlaceInvalido.titulo")}>
            {t("expedienteCompartido.autorizar.enlaceInvalido.cuerpo")}
          </Aviso>
        ) : step.kind === "done" ? (
          <Aviso
            variant={step.decision === "APPROVED" ? "exito" : "info"}
            title={t(
              step.decision === "APPROVED"
                ? "expedienteCompartido.autorizar.confirmacion.aprobadaTitulo"
                : "expedienteCompartido.autorizar.confirmacion.rechazadaTitulo"
            )}
          >
            {t(
              step.decision === "APPROVED"
                ? "expedienteCompartido.autorizar.confirmacion.aprobadaCuerpo"
                : "expedienteCompartido.autorizar.confirmacion.rechazadaCuerpo"
            )}
          </Aviso>
        ) : (
          <div className="flex flex-col gap-4">
            <RequestSummary info={step.info} t={t} />

            {step.kind === "info" && (
              <Button type="button" isLoading={actionPending} disabled={actionPending} onClick={() => void sendOtp(step.info)}>
                {t("expedienteCompartido.autorizar.pedirCodigo")}
              </Button>
            )}

            {step.kind === "otp-sent" && (
              <div className="flex flex-col gap-3">
                <FieldWrapper label={t("expedienteCompartido.autorizar.codigo.etiqueta")} htmlFor="otp-code" hint={t("expedienteCompartido.autorizar.codigo.ayuda")}>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-center text-2xl tracking-[0.5em] text-gray-900"
                  />
                </FieldWrapper>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" isLoading={actionPending} disabled={actionPending || code.length !== 6} onClick={() => void verifyOtp(step.info)}>
                    {t("expedienteCompartido.autorizar.codigo.validar")}
                  </Button>
                  <Button type="button" variant="secondary" disabled={actionPending} onClick={() => void sendOtp(step.info)}>
                    {t("expedienteCompartido.autorizar.codigo.reenviar")}
                  </Button>
                </div>
              </div>
            )}

            {step.kind === "deciding" && <DecisionForm info={step.info} pending={actionPending} onDecide={(body) => void decide(body)} t={t} />}

            {actionError ? <ErrorState error={actionError} /> : null}
          </div>
        )}
      </Card>
    </main>
  );
}
