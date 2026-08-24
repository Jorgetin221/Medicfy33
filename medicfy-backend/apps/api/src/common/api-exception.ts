import { HttpException } from "@nestjs/common";

// Uniform error envelope from spec §4/§8:
// { error: { code, message, details, request_id } }
export class ApiException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    httpStatus: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message, httpStatus);
  }
}
