"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

// Barra delgada que abre la videollamada en un modal (pedido explícito
// del usuario, 2026-10-27, tras que el panel inline anterior empujara
// la nota clínica fuera de vista). Sin estado propio: ConsultaScreen
// decide cuándo mostrarla y qué pasa al hacer clic.
export function TeleconsultaButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <section aria-label={t("teleconsulta.titulo")} className="mx-auto w-full max-w-[2200px] border-b border-gray-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <p className="text-base font-medium text-brand-900">{t("teleconsulta.titulo")}</p>
        <Button type="button" variant="secondary" onClick={onClick}>
          {t("consulta.iniciarTeleconsulta")}
        </Button>
      </div>
    </section>
  );
}
