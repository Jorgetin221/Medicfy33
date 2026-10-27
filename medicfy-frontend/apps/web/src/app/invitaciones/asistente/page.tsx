"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth-layout";
import { Button, ButtonLink } from "@/components/ui/button";
import { Aviso } from "@/components/ui/alert";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";

// M-33 (auditoría 2026-10-21): POST /doctors/me/assistants/accept
// existía sin pantalla, y el enlace del correo llevaba a una ruta que no
// existía. El servidor solo acepta si la cuenta en sesión tiene el mismo
// correo al que se envió la invitación (B-01).
export default function InvitacionAsistentePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <InvitacionContent />
    </Suspense>
  );
}

function InvitacionContent() {
  const t = useT();
  const token = useSearchParams().get("token") ?? "";
  const { accessToken, isLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const returnTo = `/invitaciones/asistente?token=${encodeURIComponent(token)}`;

  async function accept() {
    setError(null);
    setIsAccepting(true);
    try {
      await apiFetch("/doctors/me/assistants/accept", { method: "POST", accessToken, body: { token } });
      setAccepted(true);
    } catch (err) {
      setError(err);
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <AuthLayout panelTitle={t("auth.invitacion.titulo")} panelBody={t("auth.invitacion.subtitulo")}>
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl text-brand-900">{t("auth.invitacion.titulo")}</h1>
        {isLoading ? <LoadingState /> : null}
        {!isLoading && !token ? <Aviso variant="advertencia" title={t("auth.invitacion.sinToken")} /> : null}
        {!isLoading && token && accepted ? (
          <>
            <Aviso variant="exito" title={t("auth.invitacion.aceptadaTitulo")}>
              {t("auth.invitacion.aceptadaCuerpo")}
            </Aviso>
            <ButtonLink href="/agenda">{t("auth.invitacion.irAgenda")}</ButtonLink>
          </>
        ) : null}
        {!isLoading && token && !accepted && !accessToken ? (
          <>
            <p className="text-base text-gray-700">{t("auth.invitacion.necesitaSesion")}</p>
            <ButtonLink href={`/login?redirect=${encodeURIComponent(returnTo)}`}>{t("auth.invitacion.iniciarSesion")}</ButtonLink>
          </>
        ) : null}
        {!isLoading && token && !accepted && accessToken ? (
          <>
            <p className="text-base text-gray-700">{t("auth.invitacion.subtitulo")}</p>
            {error ? <ErrorState error={error} /> : null}
            <Button type="button" isLoading={isAccepting} onClick={() => void accept()}>
              {t("auth.invitacion.aceptar")}
            </Button>
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
