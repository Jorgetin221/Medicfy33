"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { IconGlobe, IconCheckNav } from "@/components/ui/nav-icons";

// Selector de idioma de la plataforma. Vive en el header público y en
// el rail de las pantallas autenticadas, así que necesita dos tonos:
// sobre blanco y sobre el azul oscuro del rail.
//
// §5: 44x44 mínimo de área táctil, y el idioma activo nunca se marca
// solo con color — lleva palomita y aria-checked, legibles por un
// lector de pantalla y por alguien que no distingue el contraste.
type Tone = "light" | "rail";

// "side": la lista se abre a la DERECHA del botón, con posición fija.
// Es la del rail: el rail tiene scroll propio (overflow-y-auto), así
// que una lista absoluta dentro de él quedaba recortada. Además se
// monta en <body> con un portal: el rail es `sticky` y eso crea su
// propio contexto de apilamiento, así que su z-50 no salía de él. Con
// el rail plegado la lista cae sobre el contenido, y en la consulta el
// <aside> sticky del expediente (transparente) se quedaba con los
// clics y la barra de firma (z-20) tapaba la parte de abajo.
type Align = "left" | "right" | "side";
const SIDE_GAP_PX = 8;

const TONE_TRIGGER: Record<Tone, string> = {
  light: "text-gray-700 hover:bg-gray-100",
  rail: "text-rail-icon hover:bg-white/10",
};

export function LanguageSwitcher({
  tone = "light",
  showLabel = true,
  align = "right",
}: {
  tone?: Tone;
  showLabel?: boolean;
  align?: Align;
}) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [sidePosition, setSidePosition] = useState<{ left: number; bottom: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && align === "side" && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setSidePosition({ left: rect.right + SIDE_GAP_PX, bottom: window.innerHeight - rect.bottom });
    }
    setOpen((v) => !v);
  }

  // Mismo patrón de cierre que RegisterMenu en site-header.tsx: clic
  // fuera y Escape.
  useEffect(() => {
    if (!open) return;
    // La lista "side" vive en un portal fuera del contenedor: también
    // cuenta como "dentro".
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(next: Locale) {
    setLocale(next);
    setOpen(false);
  }

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("common.idioma.etiqueta")}
      style={align === "side" && sidePosition ? { left: sidePosition.left, bottom: sidePosition.bottom } : undefined}
      className={`${align === "side" ? "fixed" : `absolute ${align === "right" ? "right-0" : "left-0"} top-[calc(100%+8px)]`} z-50 w-48 rounded-md border border-gray-300 bg-white p-2 shadow-card`}
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => choose(option)}
            className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-base hover:bg-gray-100 ${
              active ? "font-semibold text-brand-700" : "text-gray-900"
            }`}
          >
            {/* El nombre del idioma siempre en su propio idioma:
                "English" se lee igual para quien no sabe español. */}
            <span>{LOCALE_LABELS[option]}</span>
            {active ? <IconCheckNav className="h-5 w-5 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("common.idioma.cambiar")}
        className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${TONE_TRIGGER[tone]}`}
      >
        <IconGlobe className="h-5 w-5 shrink-0" />
        {showLabel ? <span className="truncate">{LOCALE_LABELS[locale]}</span> : null}
      </button>

      {/* `open` solo se vuelve true tras un clic, así que `document`
          siempre existe aquí (nunca en el render del servidor). */}
      {menu && align === "side" ? createPortal(menu, document.body) : menu}
    </div>
  );
}
