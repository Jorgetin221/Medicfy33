"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { FileFormatNotice, useAcceptedFile } from "@/components/ui/accepted-file";
import { useT } from "@/lib/i18n/context";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  centeredCrop,
  displayScale,
  moveBy,
  renderCroppedPhoto,
  zoomAroundCenter,
  type CropState,
} from "./photo-crop";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
// Antes de recortar: la foto final sale a 512×512 en JPEG (decenas de
// KB), así que se acepta la foto tal cual sale de un celular.
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const VIEWPORT = 288;
const KEY_STEP_PX = 10;
const KEY_ZOOM_STEP = 0.1;

interface Source {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}

// Foto de perfil en la cabecera de /perfil: el avatar con un lápiz que
// abre un modal para elegir, encuadrar (arrastrar + zoom) y guardar, o
// quitar la foto. La foto es pública (perfil público y directorio).
export function DoctorPhotoEditor({
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
  const [open, setOpen] = useState(false);

  return (
    <div className="relative h-24 w-24 shrink-0">
      {photoUrl ? (
        <img src={photoUrl} alt={t("perfil.foto.alt")} className="h-24 w-24 rounded-full object-cover" />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-400" role="img" aria-label={t("perfil.foto.sinFoto")}>
          {initial}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("perfil.foto.editar")}
        title={t("perfil.foto.editar")}
        className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 bg-white text-brand-700 shadow-card hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <IconPencil className="h-5 w-5" />
      </button>
      {open ? (
        <PhotoEditorModal
          photoUrl={photoUrl}
          initial={initial}
          accessToken={accessToken}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function PhotoEditorModal({
  photoUrl,
  initial,
  accessToken,
  onClose,
  onSaved,
}: {
  photoUrl: string | null;
  initial: string;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const { notice, check } = useAcceptedFile(PHOTO_ACCEPT);

  // El object URL de la foto elegida se libera al cambiarla o al cerrar.
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const geometry = source ? { viewport: VIEWPORT, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight } : null;

  function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file || !check(file)) return;
    setTooLarge(file.size > MAX_SOURCE_BYTES);
    if (file.size > MAX_SOURCE_BYTES) return;
    setError(null);
    setConfirmingRemove(false);
    setSource(null);
    setCrop(null);
    setFileUrl(URL.createObjectURL(file));
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!fileUrl || !naturalWidth || !naturalHeight) return;
    const loaded = { url: fileUrl, naturalWidth, naturalHeight };
    setSource(loaded);
    setCrop(centeredCrop({ viewport: VIEWPORT, naturalWidth, naturalHeight }));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !geometry || !crop) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setCrop(moveBy(geometry, crop, dx, dy));
  }

  // Encuadre sin ratón: flechas mueven, + / − acercan y alejan.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!geometry || !crop) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP_PX, 0],
      ArrowRight: [-KEY_STEP_PX, 0],
      ArrowUp: [0, KEY_STEP_PX],
      ArrowDown: [0, -KEY_STEP_PX],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setCrop(moveBy(geometry, crop, move[0], move[1]));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setCrop(zoomAroundCenter(geometry, crop, crop.zoom + KEY_ZOOM_STEP));
    } else if (e.key === "-") {
      e.preventDefault();
      setCrop(zoomAroundCenter(geometry, crop, crop.zoom - KEY_ZOOM_STEP));
    }
  }

  async function run(kind: "save" | "remove", action: () => Promise<unknown>) {
    setError(null);
    setPending(kind);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err);
      setPending(null);
    }
  }

  async function save() {
    if (!imageRef.current || !geometry || !crop) return;
    const image = imageRef.current;
    await run("save", async () => apiUpload("/doctors/me/photo", await renderCroppedPhoto(image, geometry, crop), { accessToken }));
  }

  const scale = geometry && crop ? displayScale(geometry, crop.zoom) : 1;
  const editing = fileUrl !== null;

  return (
    <Modal open onClose={onClose} title={t("perfil.foto.tituloModal")} size="dialog">
      <input ref={inputRef} type="file" onChange={chooseFile} className="hidden" aria-hidden="true" tabIndex={-1} />

      {editing ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-base text-gray-700">{t("perfil.foto.instrucciones")}</p>
          <div
            role="group"
            aria-label={t("perfil.foto.encuadre")}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragRef.current = null)}
            onPointerCancel={() => (dragRef.current = null)}
            onKeyDown={onKeyDown}
            className="relative cursor-move touch-none select-none overflow-hidden rounded-md bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            style={{ width: VIEWPORT, height: VIEWPORT }}
          >
            <img
              ref={imageRef}
              src={fileUrl}
              alt=""
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute max-w-none"
              style={
                source && crop
                  ? { width: source.naturalWidth * scale, height: source.naturalHeight * scale, left: crop.x, top: crop.y }
                  : { visibility: "hidden" }
              }
            />
            {/* Máscara circular: así se verá en el perfil. */}
            <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" aria-hidden="true" />
            {!source ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <LoadingState />
              </div>
            ) : null}
          </div>

          <label className="flex w-full max-w-[288px] items-center gap-3 text-base text-gray-700">
            <span>{t("perfil.foto.zoom")}</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={crop?.zoom ?? MIN_ZOOM}
              disabled={!crop}
              onChange={(e) => geometry && crop && setCrop(zoomAroundCenter(geometry, crop, Number(e.target.value)))}
              className="min-h-[44px] flex-1 accent-brand-700"
            />
          </label>

          <div className="flex w-full flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => setFileUrl(null)}>
              {t("perfil.foto.cancelar")}
            </Button>
            <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => inputRef.current?.click()}>
              {t("perfil.foto.elegirOtra")}
            </Button>
            <Button type="button" isLoading={pending === "save"} disabled={!crop || pending !== null} onClick={() => void save()}>
              {t("perfil.foto.guardar")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt={t("perfil.foto.alt")} className="h-40 w-40 rounded-full object-cover" />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-gray-100 text-5xl text-gray-400" role="img" aria-label={t("perfil.foto.sinFoto")}>
              {initial}
            </div>
          )}
          <p className="text-center text-sm text-gray-500">{t("perfil.foto.ayuda")}</p>

          {confirmingRemove ? (
            <div className="flex w-full flex-col gap-3 rounded-md border border-gray-300 bg-gray-50 p-3">
              <p className="text-base text-gray-900">{t("perfil.foto.confirmarQuitar")}</p>
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" disabled={pending !== null} onClick={() => setConfirmingRemove(false)}>
                  {t("perfil.foto.cancelar")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  isLoading={pending === "remove"}
                  disabled={pending !== null}
                  onClick={() => void run("remove", () => apiFetch("/doctors/me/photo", { method: "DELETE", accessToken }))}
                >
                  {t("perfil.foto.confirmarSi")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              {photoUrl ? (
                <Button type="button" variant="secondary" onClick={() => setConfirmingRemove(true)}>
                  {t("perfil.foto.quitar")}
                </Button>
              ) : null}
              <Button type="button" onClick={() => inputRef.current?.click()}>
                {photoUrl ? t("perfil.foto.cambiar") : t("perfil.foto.subir")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <FileFormatNotice notice={notice ?? (tooLarge ? t("perfil.foto.muyGrande") : null)} />
        {error ? <ErrorState error={error} /> : null}
      </div>
    </Modal>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
