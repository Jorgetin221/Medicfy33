"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientAccountStatus, PatientActivationLinkIssued } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/context";
import { formatDateMedium } from "@/lib/i18n/format";

const COPIED_FEEDBACK_MS = 2000;

// wa.me exige el número sin "+" ni separadores. Sin teléfono, WhatsApp
// abre el selector de contacto con el mensaje ya escrito.
function whatsappUrl(phoneE164: string | null, message: string): string {
  const digits = phoneE164?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Cuenta del paciente en la ficha del médico: "Cuenta activa", o el
// botón para generar el enlace de activación que el médico comparte él
// mismo (Medicfy todavía no envía SMS ni correos). El token solo se ve
// en la respuesta que lo genera — el servidor guarda únicamente su hash.
export function PatientAccountPanel({
  patientId,
  accessToken,
  firstName,
  phoneE164,
}: {
  patientId: string;
  accessToken: string;
  firstName: string;
  phoneE164: string | null;
}) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<PatientAccountStatus | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [issued, setIssued] = useState<PatientActivationLinkIssued | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await apiFetch<PatientAccountStatus>(`/patients/${patientId}/account-status`, { accessToken }));
    } catch (error) {
      setLoadError(error);
    }
  }, [patientId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issueLink() {
    setIssueError(null);
    setIssuing(true);
    setCopied(false);
    try {
      setIssued(await apiFetch<PatientActivationLinkIssued>(`/patients/${patientId}/activation-link`, { method: "POST", accessToken }));
      await load();
    } catch (error) {
      setIssueError(error);
    } finally {
      setIssuing(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      // Sin permiso de portapapeles: el enlace sigue visible y
      // seleccionable en el campo de texto.
      setCopied(false);
    }
  }

  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;
  if (status === null) return <LoadingState label={t("vinculacion.ficha.cargando")} />;

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-brand-900">{t("vinculacion.ficha.titulo")}</h2>

        {status.hasAccount ? (
          <Aviso variant="exito" title={t("vinculacion.ficha.cuentaActiva")}>
            {t("vinculacion.ficha.cuentaActivaAyuda")}
          </Aviso>
        ) : status.isMinor ? (
          <Aviso variant="info" title={t("vinculacion.ficha.menorTitulo")}>
            {t("vinculacion.ficha.menorCuerpo")}
          </Aviso>
        ) : (
          <>
            <p className="text-base text-gray-700">{t("vinculacion.ficha.sinCuenta")}</p>

            {status.pendingActivationLink && !issued ? (
              <p className="text-sm text-gray-700">
                {t("vinculacion.ficha.enlaceVigente", {
                  creado: formatDateMedium(locale, status.pendingActivationLink.createdAt),
                  vence: formatDateMedium(locale, status.pendingActivationLink.expiresAt),
                })}
              </p>
            ) : null}

            {issued ? (
              <div className="flex flex-col gap-3 rounded-md border border-gray-300 p-3">
                <Aviso variant="exito" title={t("vinculacion.ficha.enlaceGenerado", { vence: formatDateMedium(locale, issued.expiresAt) })} />
                <FieldWrapper label={t("vinculacion.ficha.etiquetaEnlace")} htmlFor="activation-link-url">
                  <TextInput id="activation-link-url" readOnly value={issued.url} onFocus={(e) => e.currentTarget.select()} />
                </FieldWrapper>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => void copyLink(issued.url)}>
                    {copied ? t("vinculacion.ficha.copiado") : t("vinculacion.ficha.copiar")}
                  </Button>
                  <a
                    href={whatsappUrl(phoneE164, t("vinculacion.ficha.mensajeWhatsapp", { nombre: firstName, url: issued.url }))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-700 px-4 text-base font-medium text-white hover:bg-brand-900"
                  >
                    {t("vinculacion.ficha.whatsapp")}
                  </a>
                </div>
              </div>
            ) : null}

            <div>
              <Button
                type="button"
                variant={issued || status.pendingActivationLink ? "secondary" : "primary"}
                isLoading={issuing}
                onClick={() => void issueLink()}
              >
                {issued || status.pendingActivationLink ? t("vinculacion.ficha.generarOtro") : t("vinculacion.ficha.generar")}
              </Button>
            </div>
            {issueError ? <ErrorState error={issueError} /> : null}
          </>
        )}
      </div>
    </Card>
  );
}
