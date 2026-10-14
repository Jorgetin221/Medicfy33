import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiException } from "./api-exception";
import { parseAcceptLanguage } from "./i18n/locale";
import { translateMessage } from "./i18n/translate";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = randomUUID();

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

    // R2: never log clinical data. Logging the exception itself (not
    // the request body) is safe — unexpected 500s must be diagnosable,
    // and the client only ever sees the generic message + request_id.
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`[${requestId}] ${error.message}`, error.stack);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_ERROR",
        message: translateMessage("Ocurrió un error inesperado.", locale),
        request_id: requestId,
      },
    });
  }
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
