"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

// Barra delgada que abre la videollamada en un modal (pedido explícito
// del usuario, 2026-10-27, tras que el panel inline anterior empujara
// la nota clínica fuera de vista). Sin estado propio: ConsultaScreen
// decide cuándo mostrarla y qué pasa al hacer clic.
// La etiqueta dice la modalidad REAL de la cita: antes decía
// "Teleconsulta" en toda consulta, incluida una presencial sin cita.
// El botón de videollamada sigue disponible en ambas (ad hoc).
export function TeleconsultaButton({ onClick, modality = "IN_PERSON" }: { onClick: () => void; modality?: "IN_PERSON" | "ONLINE" }) {
  const t = useT();
  const label = modality === "ONLINE" ? t("teleconsulta.titulo") : t("teleconsulta.presencial");
  return (
    <section aria-label={label} className="mx-auto w-full max-w-[2200px] border-b border-gray-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <p className="text-base font-medium text-brand-900">{label}</p>
        <Button type="button" variant="secondary" onClick={onClick}>
          {modality === "ONLINE" ? t("consulta.iniciarTeleconsulta") : t("consulta.iniciarVideollamada")}
        </Button>
      </div>
    </section>
  );
}
