"use client";

import { useAuth } from "@/lib/auth-context";

// M1-CA-006: aviso a los 28 min de inactividad, 2 min antes del
// cierre automático a los 30 (M1-RN-007). Cualquier actividad del
// médico (mover el mouse, teclear, hacer scroll) ya limpia el aviso
// sola — este botón es la vía operable por teclado/lector de
// pantalla para lo mismo (WCAG 2.2 SC 2.2.1: todo timeout necesita
// una forma de extenderlo, no solo "esperar a que caduque").
export function InactivityWarningBanner() {
  const { inactivityWarning, extendSession } = useAuth();
  if (!inactivityWarning) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-warn-600 bg-warn-50 px-4 py-2 text-center"
    >
      <p className="text-base font-medium text-warn-600">
        <span aria-hidden="true">⚠</span> Tu sesión se cerrará en unos minutos por inactividad.
      </p>
      <button
        type="button"
        onClick={extendSession}
        className="min-h-[44px] rounded-md border border-warn-600 bg-white px-3 text-sm font-medium text-warn-600 hover:bg-warn-100"
      >
        Seguir conectado
      </button>
    </div>
  );
}
