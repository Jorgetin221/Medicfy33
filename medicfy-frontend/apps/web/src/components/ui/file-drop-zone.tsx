"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Subir arrastrando el archivo desde Finder/Explorador. En Safari
// (macOS 15, Safari 27) el selector de archivos deja el botón "Cargar"
// deshabilitado aunque el <input> no lleve `accept` — arrastrar no pasa
// por ese selector, así que es la vía que siempre funciona.
export function FileDropZone({
  onFile,
  disabled = false,
  className,
  children,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);
  // Resaltado con `outline`, no `border`: no ocupa espacio y la zona no
  // desalinea lo que envuelve.
  // dragenter/dragleave también se disparan al pasar sobre los hijos:
  // con un contador el resaltado no parpadea.
  const depth = useRef(0);

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  return (
    <div
      className={cn("rounded-lg transition-colors", isOver && "bg-brand-100 outline-dashed outline-2 outline-brand-700", className)}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setIsOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        // Sin preventDefault el navegador abre el PDF en la pestaña.
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setIsOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setIsOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      {children}
    </div>
  );
}
