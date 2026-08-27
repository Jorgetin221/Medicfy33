"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Panel (§3.5 del doc de UX): panel lateral deslizable, para ficha
// resumen y expediente "sin perder contexto". Primitivo puro — sin
// contenido clínico todavía; lo consumirá CSL-01 (receta/orden) en un
// pase posterior. Modal está prohibido para formularios clínicos
// (§3.5), así que este es el contenedor correcto para eso más adelante.
export function Panel({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  // Formularios (receta/orden) están cómodos en max-w-md; un visor de
  // documento (PDF/imagen de un resultado) necesita más ancho para no
  // quedar ilegible — opt-in para no mover el ancho de los paneles
  // existentes.
  wide?: boolean;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Ref de "última versión" — un caller como ConsultaForm re-renderiza
  // cada segundo (el cronómetro) y pasa un onClose con identidad nueva
  // en cada render. Si onClose estuviera en el arreglo de deps de abajo,
  // este efecto se repetiría cada segundo y robaría el foco de vuelta
  // al botón de cerrar mientras el médico está escribiendo — justo el
  // bug reportado ("solo puedo escribir una letra y me saca").
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        className={`relative flex h-full w-full flex-col bg-white shadow-card ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-gray-300 px-6 py-4">
          <h2 id="panel-title" className="font-heading text-lg text-brand-900">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-xl text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  );
}
