"use client";

import { useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { FileFormatNotice, useAcceptedFile } from "@/components/ui/accepted-file";
import { useT } from "@/lib/i18n/context";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Foto de perfil del médico, SUBIDA desde su equipo (antes solo se
// podía pegar una URL). Es pública: la ven los pacientes en el perfil
// público y en el directorio. El servidor valida formato, tamaño y
// que el contenido sea de verdad una imagen; aquí se avisa antes para
// no esperar la subida de un archivo que se va a rechazar.
export function DoctorPhotoUploader({
  photoUrl,
  initial,
  accessToken,
  onChanged,
}: {
  photoUrl: string | null;
  initial: string;
  accessToken: string;
  onChanged: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const { notice, check } = useAcceptedFile(PHOTO_ACCEPT);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file || !check(file)) return;
    setTooLarge(file.size > MAX_PHOTO_BYTES);
    if (file.size > MAX_PHOTO_BYTES) return;
    await run("upload", () => apiUpload("/doctors/me/photo", file, { accessToken }));
  }

  async function run(kind: "upload" | "remove", action: () => Promise<unknown>) {
    setError(null);
    setPending(kind);
    try {
      await action();
      setConfirmingRemove(false);
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-700">{t("perfil.foto.titulo")}</p>
      <div className="flex flex-wrap items-center gap-4">
        {photoUrl ? (
          <img src={photoUrl} alt={t("perfil.foto.alt")} className="h-24 w-24 shrink-0 rounded-full border border-gray-300 object-cover" />
        ) : (
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-100 text-2xl text-gray-400"
            role="img"
            aria-label={t("perfil.foto.sinFoto")}
          >
            {initial}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" onChange={(e) => void handleFile(e)} className="hidden" aria-hidden="true" tabIndex={-1} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" isLoading={pending === "upload"} disabled={pending !== null} onClick={() => inputRef.current?.click()}>
              {photoUrl ? t("perfil.foto.cambiar") : t("perfil.foto.subir")}
            </Button>
            {photoUrl && !confirmingRemove ? (
              <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => setConfirmingRemove(true)}>
                {t("perfil.foto.quitar")}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-gray-500">{t("perfil.foto.ayuda")}</p>
        </div>
      </div>

      {confirmingRemove ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-300 bg-gray-50 p-3">
          <p className="text-base text-gray-900">{t("perfil.foto.confirmarQuitar")}</p>
          <Button
            type="button"
            variant="destructive"
            isLoading={pending === "remove"}
            disabled={pending !== null}
            onClick={() => void run("remove", () => apiFetch("/doctors/me/photo", { method: "DELETE", accessToken }))}
          >
            {t("perfil.foto.confirmarSi")}
          </Button>
          <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => setConfirmingRemove(false)}>
            {t("perfil.foto.cancelar")}
          </Button>
        </div>
      ) : null}

      <FileFormatNotice notice={notice ?? (tooLarge ? t("perfil.foto.muyGrande") : null)} />
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
