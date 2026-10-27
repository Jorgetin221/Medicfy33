"use client";

import { useEffect, useState, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResultadosCharts } from "@/components/clinical/resultados-charts";
import { HojaFrontal } from "@/components/clinical/hoja-frontal";
import { HistoriaReadonly } from "@/components/clinical/historia-readonly";
import { NotasTimeline } from "@/components/clinical/notas-timeline";
import { DocumentosTab } from "@/components/clinical/documentos-tab";
import { LabAnalytesPanel } from "@/components/clinical/lab-analytes-panel";
import { LabSheetUpload } from "@/components/clinical/lab-sheet-upload";
import { AsistenteTab } from "@/components/clinical/asistente-tab";
import { useT } from "@/lib/i18n/context";
import { trapTabKey } from "@/lib/focus-trap";

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

// Fase 8 · Prompt 53: quinta pestaña, "Asistente" (El Segundo Lector).
// v1 — disparo manual únicamente (los 4 botones de pase viven dentro
// de AsistenteTab): el disparo automático por sección estable
// (Prompt 51) y el punto de "lectura nueva"/interrupción por bandera
// roja inmediata (Prompt 53) requieren que algo dispare un pase SIN
// que el médico haya abierto esta pestaña primero — no aplica todavía
// porque hoy el único disparador ES el botón de adentro. Se agregan
// cuando exista ese disparo en segundo plano, no se están olvidando.
const TABS = ["Hoja frontal", "Historia", "Notas", "Estudios", "Resultados", "Asistente"] as const;
export type Zona3Tab = (typeof TABS)[number];

function storageKey(doctorKey: string): string {
  return `medicfy:zona3:${doctorKey}`;
}

export function ConsultaZona3({
  doctorKey,
  patientId,
  accessToken,
  birthDate,
  encounterId,
}: {
  doctorKey: string;
  // Fase 3 (prompt 30): Resultados grafica las series estructuradas.
  patientId?: string;
  accessToken?: string | null;
  birthDate?: string;
  // Fase 8 · Prompt 53: la pestaña Asistente dispara/lee pases contra
  // este encuentro.
  encounterId?: string;
}) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Zona3Tab>("Hoja frontal");
  // Carga diferida real: solo las pestañas que el médico ABRIÓ en esta
  // sesión existen en el DOM.
  // M-28: la pestaña por omisión también cuenta como abierta — antes la
  // pestaña recordada quedaba seleccionada pero sin panel montado.
  const [openedTabs, setOpenedTabs] = useState<Set<Zona3Tab>>(new Set(["Hoja frontal"]));
  const tabsBaseId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  // Capa 1 (v2.5): forzar que LabAnalytesPanel vuelva a cargar tras
  // aceptar una hoja — sube su `key` en vez de levantarle una prop de
  // recarga, más simple que refactorizar su estado interno.
  const [labRefreshKey, setLabRefreshKey] = useState(0);

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(storageKey(doctorKey));
      if (remembered && (TABS as readonly string[]).includes(remembered)) {
        setActiveTab(remembered as Zona3Tab);
        setOpenedTabs((prev) => new Set(prev).add(remembered as Zona3Tab));
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

  // M-28: patrón APG de pestañas — flechas, Inicio/Fin, foco itinerante.
  function handleTabKeyDown(e: React.KeyboardEvent, index: number) {
    const keyToIndex: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const target = keyToIndex[e.key];
    const tab = target === undefined ? undefined : TABS[target];
    if (tab === undefined) return;
    e.preventDefault();
    openTab(tab);
    document.getElementById(`${tabsBaseId}-tab-${target}`)?.focus();
  }

  // M-28: el cajón (tableta) es un diálogo modal de verdad: Esc lo
  // cierra y el foco no se escapa a la nota de atrás.
  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
      trapTabKey(e, drawerRef.current);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const panel = (
    <div className="flex h-full flex-col" data-testid="zona3-panel">
      <div role="tablist" aria-label={t("consulta.zona3.panelConsulta")} className="flex flex-wrap gap-1 border-b border-gray-300 pb-2">
        {TABS.map((tab, index) => (
          <button
            key={tab}
            id={`${tabsBaseId}-tab-${index}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${tabsBaseId}-panel-${index}`}
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
            onClick={() => openTab(tab)}
            onKeyDown={(e) => handleTabKeyDown(e, index)}
            className={cn(
              "min-h-11 rounded-md px-3 text-sm font-medium",
              activeTab === tab ? "bg-brand-100 text-brand-900" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            {t(`consulta.zona3.tabs.${tab}`)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto pt-3">
        {TABS.map((tab, index) =>
          openedTabs.has(tab) && activeTab === tab ? (
            <div key={tab} id={`${tabsBaseId}-panel-${index}`} role="tabpanel" aria-labelledby={`${tabsBaseId}-tab-${index}`}>
              {tab === "Hoja frontal" && patientId && accessToken ? (
                <HojaFrontal patientId={patientId} accessToken={accessToken} />
              ) : tab === "Historia" && patientId && accessToken ? (
                <HistoriaReadonly patientId={patientId} accessToken={accessToken} />
              ) : tab === "Notas" && patientId && accessToken ? (
                <NotasTimeline patientId={patientId} accessToken={accessToken} />
              ) : tab === "Estudios" && patientId && accessToken ? (
                <DocumentosTab patientId={patientId} accessToken={accessToken} />
              ) : tab === "Resultados" && patientId && accessToken && birthDate ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("consulta.zona3.signosVitales")}</h3>
                    <ResultadosCharts
                      patientId={patientId}
                      accessToken={accessToken}
                      birthDate={birthDate}
                      ageYears={(Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("consulta.zona3.laboratorio")}</h3>
                    <LabSheetUpload
                      patientId={patientId}
                      accessToken={accessToken}
                      onAccepted={() => setLabRefreshKey((k) => k + 1)}
                    />
                    <LabAnalytesPanel
                      key={labRefreshKey}
                      patientId={patientId}
                      accessToken={accessToken}
                      onOpenAsistente={() => openTab("Asistente")}
                      {...(encounterId ? { encounterId } : {})}
                    />
                  </div>
                </div>
              ) : tab === "Asistente" && encounterId && accessToken ? (
                <AsistenteTab encounterId={encounterId} accessToken={accessToken} />
              ) : (
                <p className="text-sm text-gray-500">{t("consulta.zona3.sinDatos")}</p>
              )}
            </div>
          ) : null
        )}
        {openedTabs.size === 0 ? <p className="text-sm text-gray-500">{t("consulta.zona3.abreUnaPestana")}</p> : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Escritorio (≥1024px): panel fijo a la derecha.

          Ancho por tramos: entre 1024 y 1535 px el rail de navegación ya se
          lleva 224 px, y con Zona 3 en 384 la nota clínica quedaba en 338 —
          más angosta que este panel de referencia. A partir de 1536 sobra
          espacio y recupera los 384.

          `sticky` con scroll propio, igual que Zona 1: la nota mide varios
          miles de píxeles y sin esto el expediente se iba con el scroll
          justo cuando sirve para contrastar lo que se está escribiendo.
          La altura descuenta la barra fija de firma (ConsultaForm publica
          --consulta-footer-height): sin eso, el final de la lectura del
          asistente quedaba detrás de "Firmar y cerrar consulta". */}
      <aside
        className="sticky top-4 hidden h-[calc(100vh_-_2rem_-_var(--consulta-footer-height,0px))] shrink-0 overflow-y-auto lg:block lg:w-80 2xl:w-96"
        aria-label={t("consulta.zona3.titulo")}
      >
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
          {t("consulta.zona3.expediente")}
        </Button>
        {isOpen ? (
          <div ref={drawerRef} className="fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label={t("consulta.zona3.cajon")}>
            <button
              type="button"
              aria-label={t("consulta.zona3.cerrarPanel")}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-overlay"
            />
            <div className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-white p-4 shadow-card">
              <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} className="mb-3 min-h-11 self-end">
                {t("consulta.zona3.cerrar")}
              </Button>
              {panel}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
