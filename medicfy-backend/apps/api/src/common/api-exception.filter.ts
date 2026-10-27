import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiException } from "./api-exception";
import { currentRequestContext } from "./request-context";
import { parseAcceptLanguage } from "./i18n/locale";
import { translateMessage } from "./i18n/translate";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // M-14: el mismo id que quedó en audit_log para esta petición.
    const requestId = currentRequestContext()?.requestId ?? randomUUID();

    // El idioma de la RESPUESTA sale del Accept-Language de esta
    // petición. Solo afecta el `message` que ve el cliente: nada de lo
    // que se persiste o se imprime cambia de idioma (R6, ver
    // i18n/locale.ts).
    const locale = parseAcceptLanguage(request.headers["accept-language"]);

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json({
        error: {
          code: exception.code,
          message: translateMessage(exception.message, locale),
          details: exception.details,
          request_id: requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json({
        error: {
          code: httpStatusToGenericCode(status),
          message: translateMessage(
            typeof body === "string" ? body : ((body as { message?: string }).message ?? exception.message),
            locale
          ),
          details: typeof body === "object" ? body : undefined,
          request_id: requestId,
        },
      });
      return;
    }

    // M-15: errores de Prisma que tienen un significado claro para el
    // cliente dejan de ser 500.
    const mapped = mapPrismaError(exception);
    if (mapped) {
      this.logger.warn(`[${requestId}] ${describeSafely(exception)}`);
      response.status(mapped.status).json({
        error: { code: mapped.code, message: translateMessage(mapped.message, locale), request_id: requestId },
      });
      return;
    }

    // R2: never log clinical data. The client only ever sees the
    // generic message + request_id; the log gets a sanitized
    // description (M-15: un mensaje de Prisma puede traer los VALORES
    // de la consulta — texto de una nota, un diagnóstico).
    this.logger.error(`[${requestId}] ${describeSafely(exception)}`);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_ERROR",
        message: translateMessage("Ocurrió un error inesperado.", locale),
        request_id: requestId,
      },
    });
  }
}

function mapPrismaError(exception: unknown): { status: number; code: string; message: string } | null {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (exception.code) {
    case "P2002":
      return { status: HttpStatus.CONFLICT, code: "CONFLICT", message: "El registro ya existe." };
    case "P2025":
      return { status: HttpStatus.NOT_FOUND, code: "NOT_FOUND", message: "Registro no encontrado." };
    case "P2034":
      return {
        status: HttpStatus.CONFLICT,
        code: "CONCURRENT_UPDATE",
        message: "Otra operación modificó estos datos al mismo tiempo. Intenta de nuevo.",
      };
    default:
      return null;
  }
}

// Solo nombre, código y ubicación — nunca el mensaje de Prisma (puede
// incluir los argumentos de la consulta) ni valores de la petición.
function describeSafely(exception: unknown): string {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const target = exception.meta?.target ?? exception.meta?.modelName ?? "";
    return `PrismaClientKnownRequestError ${exception.code} ${String(target)}`;
  }
  if (
    exception instanceof Prisma.PrismaClientValidationError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError ||
    exception instanceof Prisma.PrismaClientRustPanicError ||
    exception instanceof Prisma.PrismaClientInitializationError
  ) {
    return `${exception.name} (mensaje omitido por R2)`;
  }
  const error = exception instanceof Error ? exception : new Error(String(exception));
  return error.stack ?? error.message;
}

function httpStatusToGenericCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_ERROR";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    default:
      return "ERROR";
  }
}
