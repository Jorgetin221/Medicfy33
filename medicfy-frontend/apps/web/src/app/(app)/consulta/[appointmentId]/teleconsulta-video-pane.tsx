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
// WebRTC." El iframe del proveedor (Daily.co) ya pide cámara/
// micrófono (atributo `allow` de abajo) y ya dibuja sus propios
// controles de llamada (mute, cámara, colgar) — ese es el "entorno de
// videollamada" en este modelo; Medicfy no lo duplica.
//
// Vive montado solo mientras el modal de la llamada está abierto
// (ver consulta-screen.tsx): pide el enlace al montar, sin prop
// `open`/toggle propio — ese ciclo de vida ahora lo controla el modal.
type RoomState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "unavailable"; reason: "NOT_CONFIGURED" | "PROVIDER_ERROR" }
  | { status: "ready"; url: string };

export function TeleconsultaVideoPane({ appointmentId, accessToken }: { appointmentId: string; accessToken: string }) {
  const t = useT();
  const isOnline = useOnlineStatus();
  const [state, setState] = useState<RoomState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!isOnline) return;
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
  }, [isOnline, appointmentId, accessToken, attempt]);

  return (
    <div className="flex min-h-[45vh] flex-[3] flex-col bg-gray-100 lg:min-h-0">
      <div className="relative min-h-0 flex-1">
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
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
