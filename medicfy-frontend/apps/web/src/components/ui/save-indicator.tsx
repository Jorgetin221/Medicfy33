import { cn } from "@/lib/utils";

// IndicadorGuardado (§3.5 del doc de UX). Consumidor real:
// use-encounter-autosave.ts (DOC-06/Consulta). "sin-respaldo" es el
// cuarto estado, agregado ahí: además de sin conexión, el respaldo
// local en IndexedDB también falló (Web Crypto o IndexedDB no
// disponibles) — decirle al médico "se está guardando en este
// dispositivo" en ese caso sería una falsa garantía, y CLAUDE.md §5
// es explícito en que perder texto clínico es el peor bug posible.
export type SaveState = "guardado" | "guardando" | "sin-conexion" | "sin-respaldo";

const STATE_CONFIG: Record<SaveState, { label: string; dot: string; text: string }> = {
  guardado: { label: "Guardado", dot: "bg-success-600", text: "text-gray-500" },
  guardando: { label: "Guardando…", dot: "bg-brand-700 animate-pulse", text: "text-gray-500" },
  "sin-conexion": { label: "Sin conexión — tus cambios se guardan en este dispositivo", dot: "bg-warn-600", text: "text-warn-600" },
  "sin-respaldo": { label: "Sin conexión y sin respaldo local — no cierres ni recargues esta pestaña", dot: "bg-danger-600 animate-pulse", text: "text-danger-600" },
};

export function IndicadorGuardado({ state, lastSavedAt, className }: { state: SaveState; lastSavedAt?: Date | null; className?: string }) {
  const config = STATE_CONFIG[state];
  // Prompt 15: el "guardado" trae la hora — el médico sabe hasta
  // cuándo está respaldado su texto.
  const timeSuffix =
    state === "guardado" && lastSavedAt
      ? ` a las ${lastSavedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
      : "";
  return (
    <p role="status" className={cn("flex items-center gap-2 text-sm font-medium", config.text, className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", config.dot)} />
      {config.label}
      {timeSuffix}
    </p>
  );
}
