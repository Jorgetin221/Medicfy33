"use client";

import { useCallback, useState } from "react";
import { acceptLabel, fileMatchesAccept } from "@/lib/file-accept";
import { useT } from "@/lib/i18n/context";

// Validación de formato de archivo en la app (ver lib/file-accept.ts:
// los <input type="file"> no llevan `accept` porque Safari bloqueaba la
// selección). `check` devuelve si el archivo se puede subir y deja listo
// el aviso para <FileFormatNotice>.
export function useAcceptedFile(accept: string) {
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const check = useCallback(
    (file: File): boolean => {
      if (fileMatchesAccept(file, accept)) {
        setNotice(null);
        return true;
      }
      setNotice(t("ui.archivo.formatoNoPermitido", { nombre: file.name, permitidos: acceptLabel(accept) }));
      return false;
    },
    [accept, t]
  );
  return { notice, check };
}

// Advertencia (ámbar), no rojo: el rojo está reservado a alertas de
// seguridad del paciente (CLAUDE.md §5).
export function FileFormatNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-warn-600 bg-warn-50 px-3 py-2 text-base text-warn-600">
      <span aria-hidden="true">⚠</span>
      {notice}
    </p>
  );
}
