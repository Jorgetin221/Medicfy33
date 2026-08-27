"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResultadosCharts } from "@/components/clinical/resultados-charts";

// Prompt 14 — Zona 3, esqueleto: pestañas Hoja frontal / Historia /
// Notas / Estudios / Resultados, VACÍAS por ahora (el contenido llega
// con las fases 2-5). Lo que sí queda garantizado desde el esqueleto:
// - Carga diferida: el contenedor de una pestaña ni se monta hasta que
//   se abre (ver render condicional openedTabs) — la carga inicial de
//   la consulta no descarga nada de aquí.
// - No interrumpe la captura: la Zona 3 es estado propio; abrir,
//   cambiar o cerrar no toca el formulario de la nota.
// - Panel fijo a la derecha en escritorio; CAJÓN deslizable sobre la
//   nota por debajo de 1024px (regla R8), con objetivos de 44px.
// - Recuerda por médico cuál pestaña quedó abierta (localStorage con
//   el id del médico — preferencia de UI, no dato clínico).

const TABS = ["Hoja frontal", "Historia", "Notas", "Estudios", "Resultados"] as const;
export type Zona3Tab = (typeof TABS)[number];

const PLACEHOLDER: Record<Zona3Tab, string> = {
  "Hoja frontal": "La hoja frontal del expediente llega con la Fase 2.",
  Historia: "La historia clínica estructurada llega con la Fase 2.",
  Notas: "Las notas previas llegan con la Fase 3.",
  Estudios: "Las órdenes de estudio llegan con la Fase 4.",
  Resultados: "Los resultados llegan con la Fase 5.",
};

function storageKey(doctorKey: string): string {
  return `medicfy:zona3:${doctorKey}`;
}

export function ConsultaZona3({
  doctorKey,
  patientId,
  accessToken,
  birthDate,
}: {
  doctorKey: string;
  // Fase 3 (prompt 30): Resultados grafica las series estructuradas.
  patientId?: string;
  accessToken?: string | null;
  birthDate?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Zona3Tab>("Hoja frontal");
  // Carga diferida real: solo las pestañas que el médico ABRIÓ en esta
  // sesión existen en el DOM.
  const [openedTabs, setOpenedTabs] = useState<Set<Zona3Tab>>(new Set());

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(storageKey(doctorKey));
      if (remembered && (TABS as readonly string[]).includes(remembered)) {
        setActiveTab(remembered as Zona3Tab);
      }
    } catch {
      // sin localStorage, la pestaña por omisión basta
    }
  }, [doctorKey]);

  function openTab(tab: Zona3Tab) {
    setActiveTab(tab);
    setOpenedTabs((prev) => new Set(prev).add(tab));
    try {
      localStorage.setItem(storageKey(doctorKey), tab);
    } catch {
      // preferencia no persistida — no es fatal
    }
  }

  const panel = (
    <div className="flex h-full flex-col" data-testid="zona3-panel">
      <div role="tablist" aria-label="Panel de consulta" className="flex flex-wrap gap-1 border-b border-gray-300 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            type="button"
            onClick={() => openTab(tab)}
            className={cn(
              "min-h-11 rounded-md px-3 text-sm font-medium",
              activeTab === tab ? "bg-brand-100 text-brand-900" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto pt-3">
        {TABS.map((tab) =>
          openedTabs.has(tab) && activeTab === tab ? (
            <div key={tab} role="tabpanel" aria-label={tab}>
              {tab === "Resultados" && patientId && accessToken && birthDate ? (
                <ResultadosCharts
                  patientId={patientId}
                  accessToken={accessToken}
                  birthDate={birthDate}
                  ageYears={(Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)}
                />
              ) : (
                <p className="text-sm text-gray-500">{PLACEHOLDER[tab]}</p>
              )}
            </div>
          ) : null
        )}
        {openedTabs.size === 0 ? <p className="text-sm text-gray-500">Abre una pestaña para consultar el expediente.</p> : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Escritorio (≥1024px): panel fijo a la derecha. */}
      <aside className="hidden w-72 shrink-0 lg:block" aria-label="Zona 3 — consulta del expediente">
        {panel}
      </aside>

      {/* Tableta/angosto (<1024px): botón + cajón deslizable SOBRE la
          nota — la captura sigue intacta debajo. */}
      <div className="lg:hidden">
        <Button
          type="button"
          variant="secondary"
          data-testid="zona3-drawer-toggle"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-20 min-h-11 shadow-card"
        >
          Expediente
        </Button>
        {isOpen ? (
          <div className="fixed inset-0 z-30" role="dialog" aria-label="Panel de consulta (cajón)">
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-gray-900/40"
            />
            <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-white p-4 shadow-card">
              <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} className="mb-3 min-h-11 self-end">
                Cerrar ✕
              </Button>
              {panel}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
