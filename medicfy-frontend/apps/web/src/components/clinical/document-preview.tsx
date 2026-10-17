"use client";

import { useEffect, useState } from "react";
import { medicalFilePreview } from "@medicfy/contracts";
import { apiFetchBlob, ApiError } from "@/lib/api-client";
import { blobToDataUrl } from "@/lib/blob-to-data-url";
import { PdfViewer } from "@/components/clinical/pdf-viewer";
import { useT } from "@/lib/i18n/context";

const NOT_FOUND = "NOT_FOUND";
// Un CSV o reporte HL7 enorme no se pinta completo: se muestra el
// inicio y el resto se descarga.
const MAX_TEXT_PREVIEW_CHARS = 200_000;

type LoadedDocument =
  | { kind: "pdf"; data: ArrayBuffer; downloadUrl: string }
  | { kind: "image"; dataUrl: string; downloadUrl: string }
  | { kind: "video"; downloadUrl: string }
  | { kind: "text"; text: string; truncated: boolean; downloadUrl: string }
  | { kind: "none"; downloadUrl: string };

async function loadDocument(blob: Blob, downloadUrl: string): Promise<LoadedDocument> {
  switch (medicalFilePreview(blob.type)) {
    case "pdf":
      return { kind: "pdf", data: await blob.arrayBuffer(), downloadUrl };
    case "image":
      return { kind: "image", dataUrl: await blobToDataUrl(blob), downloadUrl };
    case "video":
      return { kind: "video", downloadUrl };
    case "text": {
      const text = await blob.text();
      return { kind: "text", text: text.slice(0, MAX_TEXT_PREVIEW_CHARS), truncated: text.length > MAX_TEXT_PREVIEW_CHARS, downloadUrl };
    }
    default:
      return { kind: "none", downloadUrl };
  }
}

// Documento clínico (receta, orden de estudios, resultado) mostrado
// DENTRO del sistema: PDF con PdfViewer (pdf.js, no depende del visor
// del navegador), imágenes, video y texto (CSV, HL7, XML). DICOM, Word,
// Excel o HEIC no se pueden dibujar en el navegador: se avisa y se
// ofrecen para descargar. Sustituye a window.open(blob), que algunos
// navegadores bloquean o mandan a descargas. El endpoint exige el
// token, por eso se trae con apiFetchBlob y no con <a href>.
export function DocumentPreview({
  path,
  accessToken,
  downloadName,
  onDownload,
}: {
  path: string;
  accessToken: string;
  downloadName: string;
  // Bitácora de impresión (Prompt 38A): el llamador decide si
  // descargar cuenta como "impreso".
  onDownload?: () => void;
}) {
  const t = useT();
  const [loadedDocument, setLoadedDocument] = useState<LoadedDocument | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoadedDocument(null);
    setError(null);
    (async () => {
      try {
        const blob = await apiFetchBlob(path, { accessToken });
        if (cancelled) return;
        if (!blob) {
          setError(NOT_FOUND);
          return;
        }
        createdUrl = URL.createObjectURL(blob);
        const loaded = await loadDocument(blob, createdUrl);
        if (!cancelled) setLoadedDocument(loaded);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [path, accessToken]);

  if (error) {
    return (
      <p role="alert" className="text-base text-warn-600">
        {error === NOT_FOUND
          ? t("clinico.documento.noEncontrado")
          : error instanceof ApiError
            ? error.message
            : t("clinico.documento.noSePudoCargar")}
      </p>
    );
  }

  if (!loadedDocument) return <p className="text-sm text-gray-500">{t("clinico.pdf.cargando")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <a
        href={loadedDocument.downloadUrl}
        download={downloadName}
        onClick={onDownload}
        className="inline-flex min-h-11 w-fit items-center rounded-md border border-gray-300 px-4 text-sm font-medium text-brand-700 hover:bg-gray-100"
      >
        {t("clinico.documento.descargar")}
      </a>
      {loadedDocument.kind === "pdf" ? (
        <PdfViewer data={loadedDocument.data} />
      ) : loadedDocument.kind === "image" ? (
        <img src={loadedDocument.dataUrl} alt={downloadName} className="max-w-full rounded-md border border-gray-300" />
      ) : loadedDocument.kind === "video" ? (
        <video src={loadedDocument.downloadUrl} controls className="max-h-[70vh] max-w-full rounded-md border border-gray-300" />
      ) : loadedDocument.kind === "text" ? (
        <>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border border-gray-300 bg-gray-100 p-4 font-mono text-sm text-gray-900">
            {loadedDocument.text}
          </pre>
          {loadedDocument.truncated ? <p className="text-sm text-gray-500">{t("clinico.documento.textoRecortado")}</p> : null}
        </>
      ) : (
        <p className="rounded-md border border-gray-300 bg-gray-100 p-4 text-base text-gray-700">{t("clinico.documento.sinVistaPrevia", { nombre: downloadName })}</p>
      )}
    </div>
  );
}
