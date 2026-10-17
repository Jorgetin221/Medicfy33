"use client";

import { useId, useRef, useState } from "react";
import { Button } from "./button";
import { ErrorState } from "./states";
import { FileFormatNotice, useAcceptedFile } from "./accepted-file";
import { useT } from "@/lib/i18n/context";

// Primer componente de carga de archivos del proyecto (Perfil, Parte B
// §1.2/§5.1: logo y firma visual). Reemplazar siempre reemplaza — no
// es una acción destructiva de datos clínicos, no necesita
// confirmación (Parte A §4.4).
export function FileUpload({
  label,
  accept,
  previewSrc,
  onUpload,
}: {
  label: string;
  accept: string;
  previewSrc: string | null;
  onUpload: (file: File) => Promise<void>;
}) {
  const t = useT();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // `accept` se valida aquí, no en el <input> (Safari, lib/file-accept.ts).
  const { notice, check } = useAcceptedFile(accept);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!check(file)) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-300 bg-gray-100">
          {previewSrc ? (
            <img src={previewSrc} alt={t("ui.archivo.vistaPrevia", { etiqueta: label.toLowerCase() })} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-gray-500">{t("ui.archivo.sinArchivo")}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={inputRef} id={inputId} type="file" onChange={handleChange} className="hidden" />
          <Button type="button" variant="secondary" isLoading={isUploading} onClick={() => inputRef.current?.click()}>
            {previewSrc ? t("ui.archivo.reemplazar") : t("ui.archivo.subirImagen")}
          </Button>
          <p className="text-sm text-gray-500">{t("ui.archivo.restriccion")}</p>
        </div>
      </div>
      <FileFormatNotice notice={notice} />
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
