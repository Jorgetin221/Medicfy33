import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { IDENTITY_ERROR_CODES } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { TokenService, type AccessTokenPayload } from "../services/token.service";
import { isBlockedUserStatus } from "../services/auth.service";

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) {
      throw new ApiException("AUTH_INVALID_CREDENTIALS", "No autenticado.", HttpStatus.UNAUTHORIZED);
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Token inválido o expirado.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    // A-05: un token de acceso emitido antes de suspender la cuenta no
    // debe seguir abriendo expedientes durante sus 15 minutos de vida.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } });
    if (!user || isBlockedUserStatus(user.status)) {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Token inválido o expirado.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }
    request.user = payload;
    return true;
  }
}
