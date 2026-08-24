import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { ApiException } from "./api-exception";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = randomUUID();

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json({
        error: {
          code: exception.code,
          message: exception.message,
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
          message: typeof body === "string" ? body : (body as { message?: string }).message ?? exception.message,
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
        message: "Ocurrió un error inesperado.",
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
