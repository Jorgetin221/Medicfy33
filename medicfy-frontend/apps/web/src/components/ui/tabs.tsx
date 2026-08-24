"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tabs (§3.5 del doc de UX): patrón de pestañas accesible (APG tabs),
// para Expediente (Datos generales · Antecedentes · Notas · Recetas ·
// Órdenes y resultados · Documentos) en un pase posterior. Primitivo
// genérico — sin contenido clínico todavía.
export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ items, defaultTabId }: { items: TabItem[]; defaultTabId?: string }) {
  const [activeId, setActiveId] = useState(defaultTabId ?? items[0]?.id);
  const baseId = useId();

  function focusTabAt(index: number) {
    const el = document.getElementById(`${baseId}-tab-${items[index]?.id}`);
    el?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (index + 1) % items.length;
      const nextItem = items[next];
      if (!nextItem) return;
      setActiveId(nextItem.id);
      focusTabAt(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (index - 1 + items.length) % items.length;
      const prevItem = items[prev];
      if (!prevItem) return;
      setActiveId(prevItem.id);
      focusTabAt(prev);
    }
  }

  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  return (
    <div>
      <div role="tablist" aria-label="Secciones" className="flex gap-1 border-b border-gray-300">
        {items.map((item, index) => {
          const selected = item.id === activeItem?.id;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "min-h-[44px] border-b-2 px-4 text-base font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
                selected ? "border-brand-700 text-brand-900" : "border-transparent text-gray-500 hover:text-gray-900"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeItem?.id}
          className="py-4"
        >
          {item.id === activeItem?.id ? item.content : null}
        </div>
      ))}
    </div>
  );
}
