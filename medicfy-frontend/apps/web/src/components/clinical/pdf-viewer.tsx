"use client";

import { useEffect, useRef, useState } from "react";

// El visor de PDF integrado del navegador depende de que el navegador
// (y hasta la configuración del usuario) lo traiga habilitado — dos
// intentos con URL blob:/data: en el <iframe> se quedaron en pantalla
// en blanco o forzaron la descarga según el navegador. pdf.js
// (biblioteca de Mozilla, la misma que usa Firefox) dibuja el PDF con
// Canvas 2D — no depende de ningún visor externo, funciona igual en
// cualquier navegador con Canvas, que es universal.
//
// Import DINÁMICO a propósito: pdfjs-dist referencia DOMMatrix (solo
// existe en el navegador) al evaluar el módulo. Un import estático se
// ejecuta también durante el renderizado en servidor de Next.js
// (SSR corre el módulo de un componente "use client" igual, para
// generar el HTML inicial) y tronaba TODA la página de expediente con
// "ReferenceError: DOMMatrix is not defined". Dentro de useEffect
// nunca corre en el servidor — React no ejecuta efectos durante SSR.
export function PdfViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setError(null);
    setIsLoading(true);

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        // getDocument() transfiere el ArrayBuffer al worker (queda
        // "detached" del lado principal) — una copia evita mutar el
        // buffer del llamador, que puede volver a usarlo (p. ej. si el
        // médico reabre el mismo resultado).
        const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
        const containerWidth = container.clientWidth || 700;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = Math.min(Math.max(containerWidth / unscaled.width, 0.5), 2.5);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mb-3 max-w-full border border-gray-300 shadow-card";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

  return (
    <div>
      {isLoading && !error ? <p className="text-sm text-gray-500">Cargando documento…</p> : null}
      {error ? (
        <p className="text-sm text-danger-600">No se pudo mostrar el PDF en pantalla. Usa &quot;Descargar archivo original&quot;.</p>
      ) : null}
      <div ref={containerRef} className="flex flex-col items-center" />
    </div>
  );
}
