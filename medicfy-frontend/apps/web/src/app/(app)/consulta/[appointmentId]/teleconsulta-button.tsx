"use client";

import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";

// M7 (Teleconsulta, MVP): botón de DOC-06 que abre
// /teleconsulta/[appointmentId] en una pestaña nueva — así el médico
// no pierde la nota clínica que ya tiene abierta. Componente propio
// (sin fetch ni estado) para que consulta-screen.tsx no cargue más
// lógica de la que ya tiene, y para que esta pieza se pueda probar
// sola sin montar toda la pantalla.
export function TeleconsultaButton({ visible, appointmentId }: { visible: boolean; appointmentId: string }) {
  const t = useT();
  if (!visible) return null;
  return (
    <div className="mx-auto flex max-w-[2200px] flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-white px-6 py-3">
      <p className="text-base text-gray-700">{t("teleconsulta.titulo")}</p>
      <Button type="button" variant="secondary" onClick={() => window.open(`/teleconsulta/${appointmentId}`, "_blank", "noopener")}>
        {t("consulta.iniciarTeleconsulta")}
      </Button>
    </div>
  );
}
