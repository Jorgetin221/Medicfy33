import type { NextFunction, Request, Response } from "express";

// Auditoría 2026-10-21 (A-19). El API solo responde JSON y archivos
// (PDF, imágenes de documentos clínicos): no necesita cargar scripts,
// estilos ni marcos de nadie. Una CSP "default-src 'none'" + sandbox
// hace que un archivo servido inline (un .svg o .html subido como
// documento) no pueda ejecutar nada aunque el navegador lo renderice
// (M-07). Se evita agregar `helmet` como dependencia: son seis
// cabeceras fijas.
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";

// Swagger UI (solo fuera de producción) sí necesita sus scripts y
// estilos propios.
const DOCS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";

const HSTS_MAX_AGE_SECONDS = 63_072_000;

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Strict-Transport-Security", `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", req.path.startsWith("/api/docs") ? DOCS_CSP : API_CSP);
  next();
}
