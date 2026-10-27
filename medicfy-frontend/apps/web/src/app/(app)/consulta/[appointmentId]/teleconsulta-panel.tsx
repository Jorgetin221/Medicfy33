"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeleconsultationRoomOutcome } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useT } from "@/lib/i18n/context";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";

// M7 (Teleconsulta, MVP): "la cita de modalidad en línea genera un
// enlace de videollamada de proveedor externo... No construimos
// WebRTC." Pedido explícito del usuario (2026-10-27): la teleconsulta
// vive DENTRO de DOC-06 — "Iniciar teleconsulta" nunca navega a otra
// pantalla, carga el video en el mismo lugar. El proveedor resuelve
// la videollamada (iframe); Medicfy no.
type RoomState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "unavailable"; reason: "NOT_CONFIGURED" | "PROVIDER_ERROR" }
  | { status: "ready"; url: string };

export function TeleconsultaPanel({
  visible,
  appointmentId,
  accessToken,
}: {
  // Disponible en cualquier cita en curso, sin importar su modalidad
  // (pedido explícito del usuario, 2026-10-27) — videollamada ad hoc.
  // Lo decide consulta-screen.tsx (fase ready/readonly).
  visible: boolean;
  appointmentId: string;
  accessToken: string;
}) {
  const t = useT();
  const isOnline = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RoomState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!open || !isOnline) return;
    let cancelled = false;
    setState({ status: "loading" });
    apiFetch<TeleconsultationRoomOutcome>(`/appointments/${appointmentId}/video-room`, { method: "POST", accessToken })
      .then((outcome) => {
        if (cancelled) return;
        setState(outcome.kind === "ok" ? { status: "ready", url: outcome.room.url } : { status: "unavailable", reason: outcome.reason });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [open, isOnline, appointmentId, accessToken, attempt]);

  if (!visible) return null;

  return (
    <section aria-label={t("teleconsulta.titulo")} className="mx-auto w-full max-w-[2200px] border-b border-gray-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <p className="text-base font-medium text-brand-900">{t("teleconsulta.titulo")}</p>
        <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? t("teleconsulta.ocultar") : t("consulta.iniciarTeleconsulta")}
        </Button>
      </div>

      {open && (
        <>
          <div className="relative h-[70vh] max-h-[640px] border-t border-gray-300 bg-gray-100">
            {!isOnline ? (
              <Centered>
                <Aviso variant="advertencia" title={t("teleconsulta.sinConexion")}>
                  {t("teleconsulta.sinConexionAyuda")}
                </Aviso>
              </Centered>
            ) : state.status === "loading" ? (
              <Centered>
                <LoadingState label={t("teleconsulta.cargando")} />
              </Centered>
            ) : state.status === "error" ? (
              <Centered>
                <ErrorState error={state.error} onRetry={retry} />
              </Centered>
            ) : state.status === "unavailable" ? (
              <Centered>
                <Aviso
                  variant="info"
                  title={t(state.reason === "NOT_CONFIGURED" ? "teleconsulta.noDisponible.noConfigurado" : "teleconsulta.noDisponible.errorProveedor")}
                >
                  <p>{t(state.reason === "NOT_CONFIGURED" ? "teleconsulta.noDisponible.noConfiguradoAyuda" : "teleconsulta.noDisponible.errorProveedorAyuda")}</p>
                  {state.reason === "PROVIDER_ERROR" && (
                    <Button type="button" variant="secondary" onClick={retry} className="mt-3">
                      {t("teleconsulta.noDisponible.reintentar")}
                    </Button>
                  )}
                </Aviso>
              </Centered>
            ) : (
              <iframe
                src={state.url}
                title={t("teleconsulta.titulo")}
                data-testid="teleconsulta-iframe"
                allow="camera; microphone; fullscreen; display-capture"
                className="h-full w-full border-0"
              />
            )}
          </div>
          <p className="border-t border-gray-300 px-4 py-2 text-sm text-gray-500 sm:px-6">
            {t("teleconsulta.avisoGrabacion")} {t("teleconsulta.proveedorExterno")}
          </p>
        </>
      )}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
