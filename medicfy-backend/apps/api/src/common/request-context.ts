import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Auditoría 2026-10-21 (M-14). R3 exige request_id en cada fila de
// audit_log y el formato de error lo devuelve al cliente — pero el id
// se inventaba en el filtro de errores y nunca llegaba a la bitácora.
// Ahora cada petición recibe uno al entrar (o conserva el X-Request-Id
// del proxy, si es un UUID), viaja en AsyncLocalStorage, y AuditService
// y el filtro de errores lo leen de aquí. IP y user-agent viajan igual,
// para las llamadas a auditoría que no los pasaban.
export interface RequestContext {
  requestId: string;
  ip: string | undefined;
  userAgent: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && UUID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", requestId);
  storage.run({ requestId, ip: req.ip, userAgent: req.headers["user-agent"] }, () => next());
}
