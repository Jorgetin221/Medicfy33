"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecordShareRevocationGrant, RecordShareRevocationInfo } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper } from "@/components/ui/field";
import { useI18n, useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDateLong } from "@/lib/i18n/format";

type OtpStep = "none" | "sent" | "verified";

// PR-EXP-06 — el paciente ve quién tiene acceso y lo quita. Pide OTP
// UNA vez antes de poder revocar (el backend exige OTP de propósito
// REVOKE, válido 30 min). Sin dato clínico en pantalla (RE9).
export function RevocarExpedienteCompartidoView({ token }: { token: string }) {
  const t = useT();
  const { locale } = useI18n();
  const [grants, setGrants] = useState<RecordShareRevocationGrant[] | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [otpStep, setOtpStep] = useState<OtpStep>("none");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState<RecordShareRevocationGrant | null>(null);
  const [revokedName, setRevokedName] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const info = await apiFetch<RecordShareRevocationInfo>(`/record-share/revoke/${token}`);
      setGrants(info.activeGrants);
    } catch {
      setInvalid(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setActionError(null);
    setPending(true);
    try {
      await action();
    } catch (error) {
      setActionError(error);
    } finally {
      setPending(false);
    }
  }

  const sendOtp = () =>
    run(async () => {
      await apiFetch(`/record-share/revoke/${token}/otp`, { method: "POST" });
      setOtpStep("sent");
    });

  const verifyOtp = () =>
    run(async () => {
      await apiFetch(`/record-share/revoke/${token}/otp/verify`, { method: "POST", body: { code } });
      setOtpStep("verified");
    });

  const revoke = (grant: RecordShareRevocationGrant) =>
    run(async () => {
      await apiFetch(`/record-share/revoke/${token}/revoke`, { method: "POST", body: { grantId: grant.grantId } });
      setConfirming(null);
      setRevokedName(grant.requesterDisplayName);
      await load();
    });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <p className="font-brand text-lg text-brand-900">Medicfy BETA</p>
        <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.revocar.titulo")}</h1>
      </div>

      <Card>
        {invalid ? (
          <Aviso variant="advertencia" title={t("expedienteCompartido.revocar.enlaceInvalido.titulo")}>
            {t("expedienteCompartido.revocar.enlaceInvalido.cuerpo")}
          </Aviso>
        ) : grants === null ? (
          <LoadingState label={t("expedienteCompartido.revocar.cargando")} />
        ) : (
          <div className="flex flex-col gap-4">
            {revokedName && <Aviso variant="exito" title={t("expedienteCompartido.revocar.revocado", { medico: revokedName })} />}

            {grants.length === 0 ? (
              <p className="text-base text-gray-700">{t("expedienteCompartido.revocar.sinAccesos")}</p>
            ) : (
              <>
                <p className="text-base text-gray-700">{t("expedienteCompartido.revocar.intro")}</p>
                <ul className="flex flex-col gap-3">
                  {grants.map((grant) => (
                    <li key={grant.grantId} className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
                      <p className="text-base text-gray-900">
                        <strong>{grant.requesterDisplayName}</strong> ({t("expedienteCompartido.revocar.cedula")} {grant.requesterLicense}
                        {grant.requesterSpecialtyName ? `, ${grant.requesterSpecialtyName}` : ""})
                        {grant.isLinkGrant && (
                          <span className="ml-2 rounded-full border border-brand-700 px-2 py-0.5 text-xs font-medium text-brand-700">
                            {t("expedienteCompartido.revocar.esteEnlace")}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-700">
                        {grant.scope.map((s) => t(`expedienteCompartido.solicitar.alcanceOpciones.${s}` as MessageKey)).join(" · ")}
                      </p>
                      <p className="text-sm text-gray-700">{t("expedienteCompartido.revocar.vence", { fecha: formatDateLong(locale, grant.expiresAt) })}</p>

                      {otpStep === "verified" &&
                        (confirming?.grantId === grant.grantId ? (
                          <div className="flex flex-col gap-2 rounded-md bg-gray-50 p-3">
                            <p className="text-base text-gray-900">{t("expedienteCompartido.revocar.confirmar", { medico: grant.requesterDisplayName })}</p>
                            <div className="flex flex-wrap gap-3">
                              <Button type="button" isLoading={pending} disabled={pending} onClick={() => void revoke(grant)}>
                                {t("expedienteCompartido.revocar.confirmarSi")}
                              </Button>
                              <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(null)}>
                                {t("expedienteCompartido.revocar.cancelar")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(grant)}>
                              {t("expedienteCompartido.revocar.revocar")}
                            </Button>
                          </div>
                        ))}
                    </li>
                  ))}
                </ul>

                {otpStep === "none" && (
                  <Button type="button" isLoading={pending} disabled={pending} onClick={() => void sendOtp()}>
                    {t("expedienteCompartido.revocar.pedirCodigo")}
                  </Button>
                )}

                {otpStep === "sent" && (
                  <div className="flex flex-col gap-3">
                    <FieldWrapper label={t("expedienteCompartido.revocar.codigo.etiqueta")} htmlFor="revoke-otp-code" hint={t("expedienteCompartido.revocar.codigo.ayuda")}>
                      <input
                        id="revoke-otp-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-center text-2xl tracking-[0.5em] text-gray-900"
                      />
                    </FieldWrapper>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" isLoading={pending} disabled={pending || code.length !== 6} onClick={() => void verifyOtp()}>
                        {t("expedienteCompartido.revocar.codigo.validar")}
                      </Button>
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => void sendOtp()}>
                        {t("expedienteCompartido.revocar.codigo.reenviar")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {actionError ? <ErrorState error={actionError} /> : null}
          </div>
        )}
      </Card>
    </main>
  );
}
