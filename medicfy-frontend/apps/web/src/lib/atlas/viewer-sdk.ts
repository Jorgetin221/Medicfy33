// Copia de @atlas/viewer-sdk (3d-Anatamics/packages/viewer-sdk/src/index.ts,
// protocolo postMessage v1 — INTEGRATION_GUIDE §4). Ese paquete vive en
// otro repo sin publicar: mismo criterio que packages/contracts, copia
// propia y sincronización a mano. Si el atlas cambia de versión de
// protocolo, actualiza este archivo.
//
// El launchCode viaja por postMessage al origen EXACTO del visor —
// nunca en la URL, nunca a "*" — y solo se aceptan mensajes del propio
// iframe y del origen del visor.

export type AtlasEmbedEvent =
  | { type: "atlas:awaitingLaunch"; version: 1 }
  | { type: "atlas:ready"; version: 1; patientId: string; mode: "clinician" | "education"; findings: number; annotations: number }
  | { type: "atlas:structureSelected"; version: 1; structureId: string | null }
  | { type: "atlas:error"; version: 1; code: string; message: string };

export interface MountAtlasOptions {
  viewerUrl: string;
  launchCode: string;
  onEvent?: (event: AtlasEmbedEvent) => void;
  title?: string;
}

export interface AtlasViewerHandle {
  focusStructure(structureId: string): void;
  setMode(mode: "clinician" | "education"): void;
  destroy(): void;
}

const EVENT_TYPES = new Set(["atlas:awaitingLaunch", "atlas:ready", "atlas:structureSelected", "atlas:error"]);

export function mountAtlasViewer(container: HTMLElement, opts: MountAtlasOptions): AtlasViewerHandle {
  const viewerOrigin = new URL(opts.viewerUrl).origin;
  const iframe = document.createElement("iframe");
  iframe.src = `${viewerOrigin}/?embed=1`;
  iframe.title = opts.title ?? "Atlas anatómico 3D";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
  iframe.referrerPolicy = "no-referrer";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  let launched = false;

  const send = (message: Record<string, unknown>) => iframe.contentWindow?.postMessage({ version: 1, ...message }, viewerOrigin);

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== viewerOrigin) return;
    const data = event.data as AtlasEmbedEvent | null;
    if (!data || typeof data !== "object" || data.version !== 1 || !EVENT_TYPES.has(data.type)) return;
    if (data.type === "atlas:awaitingLaunch" && !launched) {
      // El código es de un solo uso: se envía una sola vez.
      launched = true;
      send({ type: "atlas:launch", launchCode: opts.launchCode });
    }
    opts.onEvent?.(data);
  };
  window.addEventListener("message", onMessage);
  container.replaceChildren(iframe);

  return {
    focusStructure: (structureId) => send({ type: "atlas:focusStructure", structureId }),
    setMode: (mode) => send({ type: "atlas:setMode", mode }),
    destroy: () => {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    },
  };
}
