import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "./guards/jwt-auth.guard";

// PATCH /me is deferred — the spec's endpoint table lists it but M1's
// own rules don't specify which fields are mutable here yet (phone
// re-verification, notification prefs, etc. belong to flows not yet
// built). Adding a PATCH with invented fields would be exactly the
// kind of unrequested business rule CLAUDE.md §7 warns against.
@ApiTags("me")
@ApiBearerAuth()
@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Perfil del usuario autenticado" })
  async me(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
    return {
      id: record.id,
      email: record.email,
      phoneE164: record.phoneE164,
      primaryRole: record.primaryRole,
      status: record.status,
      emailVerifiedAt: record.emailVerifiedAt,
      phoneVerifiedAt: record.phoneVerifiedAt,
      mfaEnabled: record.mfaEnabled,
    };
  }
}
