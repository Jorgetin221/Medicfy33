"use client";

import { useEffect, useState } from "react";
import {
  SHARE_DURATION_DAYS_OPTIONS,
  SENSITIVE_CATEGORIES,
  type RecordShareAuthorizationInfo,
  type RecordShareDecisionInput,
  type SensitiveCategory,
  type ShareScope,
} from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper, SelectInput } from "@/components/ui/field";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";

type Step =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "info"; info: RecordShareAuthorizationInfo }
  | { kind: "otp-sent"; info: RecordShareAuthorizationInfo }
  | { kind: "deciding"; info: RecordShareAuthorizationInfo }
  | { kind: "done"; decision: "APPROVED" | "DENIED" };

// D-EXP-05: nunca se negocia a la baja tampoco — se fuerza siempre,
// igual que en la pantalla del médico (solicitar/page.tsx).
function withSummary(scope: ShareScope[]): ShareScope[] {
  return scope.includes("SUMMARY") ? scope : ["SUMMARY", ...scope];
}

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

function RequestSummary({ info, t }: { info: RecordShareAuthorizationInfo; t: (key: MessageKey, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-gray-900">
        <strong>{info.requesterDisplayName}</strong> ({t("expedienteCompartido.autorizar.solicitud.cedula")} {info.requesterLicense}
        {info.requesterSpecialtyName ? `, ${info.requesterSpecialtyName}` : ""}) {t("expedienteCompartido.autorizar.solicitud.intro")}
      </p>
      <p className="text-sm text-gray-700">
        <strong>{t("expedienteCompartido.autorizar.solicitud.motivo")}:</strong> {info.reason}
      </p>
      <p className="text-sm text-gray-700">
        <strong>{t("expedienteCompartido.autorizar.solicitud.pideVer")}:</strong>{" "}
        {info.requestedScope.map((scope) => t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)).join(" · ")}
      </p>
      <p className="text-sm text-gray-700">{t("expedienteCompartido.autorizar.solicitud.porHastaDias", { dias: info.requestedDurationDays })}</p>
    </div>
  );
}

function DecisionForm({
  info,
  pending,
  onDecide,
  t,
}: {
  info: RecordShareAuthorizationInfo;
  pending: boolean;
  onDecide: (body: RecordShareDecisionInput) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const [approvedScope, setApprovedScope] = useState<ShareScope[]>(info.requestedScope);
  const [includedSensitiveCategories, setIncludedSensitiveCategories] = useState<SensitiveCategory[]>([]);
  const [pregnancyIncluded, setPregnancyIncluded] = useState(true);
  const durationOptions = SHARE_DURATION_DAYS_OPTIONS.filter((d) => d <= info.requestedDurationDays);
  const [durationDays, setDurationDays] = useState<number>(info.requestedDurationDays);

  function toggleScope(scope: ShareScope, checked: boolean) {
    setApprovedScope((prev) => withSummary(checked ? [...prev, scope] : prev.filter((s) => s !== scope)));
  }
  function toggleSensitive(category: SensitiveCategory, checked: boolean) {
    setIncludedSensitiveCategories((prev) => (checked ? [...prev, category] : prev.filter((c) => c !== category)));
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-lg text-brand-900">{t("expedienteCompartido.autorizar.decision.titulo")}</h2>
        <p className="text-sm text-gray-500">{t("expedienteCompartido.autorizar.decision.subtitulo")}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <label className="flex min-h-11 items-center gap-3 text-base text-gray-900">
          <input type="checkbox" checked disabled className="h-5 w-5" />
          {t("expedienteCompartido.solicitar.alcanceOpciones.SUMMARY")}
        </label>
        {info.requestedScope
          .filter((s) => s !== "SUMMARY")
          .map((scope) => (
            <label key={scope} className="flex min-h-11 items-center gap-3 text-base text-gray-900">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={approvedScope.includes(scope)}
                onChange={(e) => toggleScope(scope, e.target.checked)}
              />
              {t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)}
            </label>
          ))}
      </fieldset>

      <FieldWrapper label={t("expedienteCompartido.autorizar.decision.duracion")} htmlFor="decide-duration">
        <SelectInput id="decide-duration" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))}>
          {durationOptions.map((days) => (
            <option key={days} value={days}>
              {t(`expedienteCompartido.solicitar.duracionOpciones.${days}` as MessageKey)}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>

      <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
        <legend className="text-sm font-medium text-gray-700">{t("expedienteCompartido.autorizar.decision.sensiblesTitulo")}</legend>
        <p className="text-sm text-gray-500">{t("expedienteCompartido.autorizar.decision.sensiblesAyuda")}</p>
        {SENSITIVE_CATEGORIES.map((category) => (
          <label key={category} className="flex min-h-11 items-center gap-3 text-base text-gray-900">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={includedSensitiveCategories.includes(category)}
              onChange={(e) => toggleSensitive(category, e.target.checked)}
            />
            {t(`expedienteCompartido.autorizar.decision.sensibles.${category}` as MessageKey)}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1 rounded-md border border-gray-300 p-3">
        <label className="flex min-h-11 items-center gap-3 text-base text-gray-900">
          <input type="checkbox" className="h-5 w-5" checked={pregnancyIncluded} onChange={(e) => setPregnancyIncluded(e.target.checked)} />
          {t("expedienteCompartido.autorizar.decision.embarazoTitulo")}
        </label>
        {!pregnancyIncluded && <Aviso variant="advertencia" title={t("expedienteCompartido.autorizar.decision.embarazoAyuda")} />}
      </div>

      <div className="rounded-md border border-gray-300 bg-gray-50 p-3">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">{t("expedienteCompartido.autorizar.decision.consentimientoTitulo")}</h3>
        <p className="whitespace-pre-line text-sm text-gray-700">{info.consentText}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onDecide({ decision: "DENIED" })}>
          {t("expedienteCompartido.autorizar.decision.rechazar")}
        </Button>
        <Button
          type="button"
          isLoading={pending}
          disabled={pending}
          onClick={() =>
            onDecide({
              decision: "APPROVED",
              approvedScope: withSummary(approvedScope),
              includedSensitiveCategories,
              pregnancyExcluded: !pregnancyIncluded,
              durationDays: durationDays as 7 | 30 | 90,
            })
          }
        >
          {t("expedienteCompartido.autorizar.decision.aprobar")}
        </Button>
      </div>
    </div>
  );
}
