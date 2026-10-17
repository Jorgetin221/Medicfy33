import type { Request } from "express";

// Señal que se aborta cuando el CLIENTE se va antes de recibir la
// respuesta (canceló el fetch, cerró la pestaña, disparó un pase nuevo).
//
// No se usa req.on("close"): desde Node 16 la PETICIÓN emite "close" en
// cuanto se termina de leer su cuerpo — medido en ~2 ms, mucho antes de
// responder. Escucharla abortaba la llamada al modelo apenas empezaba, o
// nunca (si el evento ya había pasado al registrar el listener). La
// RESPUESTA sí emite "close" al cerrarse la conexión; si para entonces
// no se terminó de escribir, el cliente se fue.
export function clientDisconnectSignal(req: Request): AbortSignal {
  const controller = new AbortController();
  const res = req.res;
  res?.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}
