"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetchBlob } from "@/lib/api-client";

// Vista previa de una imagen privada (logo, firma, foto de una
// publicación): se descarga autenticada y se muestra vía URL de
// objeto. Cada URL creada se libera al reemplazarla o al desmontar —
// sin esto cada visita a la pantalla dejaba el blob retenido en
// memoria hasta cerrar la pestaña.
//
// `path` null = no hay archivo en el servidor (no se pide nada).
// `show` permite mostrar al instante un archivo recién subido sin
// volver a descargarlo.
export function useRemoteBlobUrl(path: string | null, accessToken: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const currentUrl = useRef<string | null>(null);

  const show = useCallback((blob: Blob | null) => {
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = blob ? URL.createObjectURL(blob) : null;
    setUrl(currentUrl.current);
  }, []);

  useEffect(
    () => () => {
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    },
    []
  );

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    apiFetchBlob(path, { accessToken })
      .then((blob) => {
        if (!cancelled) show(blob);
      })
      // Una vista previa que no carga (sin red, archivo borrado) deja
      // el marcador vacío; no es motivo para tumbar la pantalla.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, accessToken, show]);

  return { url, show };
}
