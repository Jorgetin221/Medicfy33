"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AtlasSessionOutcome, AtlasViewerSession } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { mountAtlasViewer } from "@/lib/atlas/viewer-sdk";
import { useT } from "@/lib/i18n/context";
import { useOnlineStatus } from "@/lib/use-online-status";
import { Modal } from "@/components/ui/modal";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";

// Atlas Anatómico 3D en ventana emergente (pedido explícito: no panel
// lateral). Flujo de INTEGRATION_GUIDE §2: el backend comprueba el
// vínculo médico-paciente y pide la sesión (pasos 0–3); aquí solo se
// monta el visor con el launchCode (paso 4). Cerrar la ventana
// desmonta AtlasBody, que revoca la sesión (§6).
export function AtlasModal({ open, onClose, patientId, accessToken }: { open: boolean; onClose: () => void; patientId: string; accessToken: string }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t("pacientes.atlas.titulo")}>
      {open && <AtlasBody patientId={patientId} accessToken={accessToken} />}
    </Modal>
  );
}

type SessionState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "unavailable"; reason: "NOT_CONFIGURED" | "ATLAS_ERROR" }
  | { status: "ready"; session: AtlasViewerSession };

function AtlasBody({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const t = useT();
  const isOnline = useOnlineStatus();
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const base = `/records/patients/${encodeURIComponent(patientId)}/atlas-sessions`;
    let openedSessionId: string | null = null;
    let cancelled = false;
    const revoke = (id: string) => void apiFetch(`${base}/${encodeURIComponent(id)}/revoke`, { method: "POST", accessToken }).catch(() => undefined);

    setState({ status: "loading" });
    apiFetch<AtlasSessionOutcome>(base, { method: "POST", accessToken })
      .then((outcome) => {
        if (outcome.kind !== "ok") {
          if (!cancelled) setState({ status: "unavailable", reason: outcome.reason });
          return;
        }
        // Desmontado mientras llegaba la respuesta (ventana cerrada, o
        // el doble montaje de StrictMode): esta sesión no se usará.
        if (cancelled) return revoke(outcome.session.id);
        openedSessionId = outcome.session.id;
        setState({ status: "ready", session: outcome.session });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      if (openedSessionId) revoke(openedSessionId);
    };
  }, [patientId, accessToken, attempt]);

  if (!isOnline) {
    return (
      <Centered>
        <Aviso variant="advertencia" title={t("pacientes.atlas.sinConexion")}>
          {t("pacientes.atlas.sinConexionAyuda")}
        </Aviso>
      </Centered>
    );
  }
  if (state.status === "loading") return <Centered><LoadingState label={t("pacientes.atlas.cargando")} /></Centered>;
  if (state.status === "error") return <Centered><ErrorState error={state.error} onRetry={retry} /></Centered>;
  if (state.status === "unavailable") {
    const notConfigured = state.reason === "NOT_CONFIGURED";
    return (
      <Centered>
        <Aviso variant="info" title={t(notConfigured ? "pacientes.atlas.noConfigurado" : "pacientes.atlas.errorAtlas")}>
          <p>{t(notConfigured ? "pacientes.atlas.noConfiguradoAyuda" : "pacientes.atlas.errorAtlasAyuda")}</p>
          {!notConfigured && (
            <Button type="button" variant="secondary" onClick={retry} className="mt-3">
              {t("pacientes.atlas.reintentar")}
            </Button>
          )}
        </Aviso>
      </Centered>
    );
  }
  return <AtlasViewer key={state.session.id} session={state.session} onRetry={retry} />;
}

function AtlasViewer({ session, onRetry }: { session: AtlasViewerSession; onRetry: () => void }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewerStatus, setViewerStatus] = useState<"booting" | "ready" | "error">("booting");

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = mountAtlasViewer(containerRef.current, {
      viewerUrl: session.viewerUrl,
      launchCode: session.launchCode,
      title: t("pacientes.atlas.titulo"),
      onEvent: (e) => {
        if (e.type === "atlas:ready") setViewerStatus("ready");
        // El mensaje del visor no se muestra tal cual: puede venir en
        // otro idioma o citar detalles internos.
        if (e.type === "atlas:error") setViewerStatus("error");
      },
    });
    return () => handle.destroy();
    // t no va en las dependencias: solo se usa para el título del
    // iframe al montarlo, y cambiarlo no debe recrear la sesión.
  }, [session.viewerUrl, session.launchCode]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 bg-gray-100">
        <div ref={containerRef} data-testid="atlas-viewer" className="h-full w-full" />
        {viewerStatus !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6">
            {viewerStatus === "booting" ? (
              <LoadingState label={t("pacientes.atlas.cargandoVisor")} />
            ) : (
              <Aviso variant="advertencia" title={t("pacientes.atlas.errorVisor")}>
                <Button type="button" variant="secondary" onClick={onRetry} className="mt-3">
                  {t("pacientes.atlas.reintentar")}
                </Button>
              </Aviso>
            )}
          </div>
        )}
      </div>
      <p className="border-t border-gray-300 px-4 py-2 text-sm text-gray-500 sm:px-6">{t("pacientes.atlas.avisoEducativo")}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6"><div className="w-full max-w-lg">{children}</div></div>;
}
