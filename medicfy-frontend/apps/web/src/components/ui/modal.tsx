"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n/context";

// Ventana emergente centrada. Hermano de Panel (mismo manejo de Esc,
// foco y fondo), pero centrada y amplia — pensada para VISORES que
// necesitan toda la pantalla (p. ej. el atlas anatómico 3D), nunca para
// formularios clínicos: §3.5 del doc de UX los manda a Panel.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Ref de "última versión", mismo motivo que en Panel: un onClose con
  // identidad nueva en cada render no debe repetir el efecto.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
      <button type="button" aria-label={t("common.acciones.cerrar")} tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-overlay" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full max-h-[920px] w-full max-w-[1400px] flex-col overflow-hidden rounded-lg bg-white shadow-card"
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-300 px-4 py-3 sm:px-6">
          <h2 id={titleId} className="font-heading text-lg text-brand-900">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("common.acciones.cerrar")}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-xl text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            ✕
          </button>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </section>
    </div>
  );
}
