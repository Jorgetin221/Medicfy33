import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { IDENTITY_ERROR_CODES } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { TokenService, type AccessTokenPayload } from "../services/token.service";

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) {
      throw new ApiException("AUTH_INVALID_CREDENTIALS", "No autenticado.", HttpStatus.UNAUTHORIZED);
    }

    try {
      request.user = this.tokenService.verifyAccessToken(token);
      return true;
    } catch {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Token inválido o expirado.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }
  }
}
