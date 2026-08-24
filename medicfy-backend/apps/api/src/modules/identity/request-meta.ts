import type { Request } from "express";
import type { RequestMeta } from "./services/auth.service";

export function getRequestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? "unknown",
    userAgent: req.headers["user-agent"] ?? "unknown",
  };
}
