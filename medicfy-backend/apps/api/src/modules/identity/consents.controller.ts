import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { consentUpsertSchema, type ConsentUpsertInput } from "@medicfy/contracts";
import type { ConsentType } from "@prisma/client";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ConsentService } from "./services/consent.service";
import { getRequestMeta } from "./request-meta";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "./guards/jwt-auth.guard";
import { CURRENT_PRIVACY_NOTICE_VERSION, CURRENT_TERMS_VERSION } from "./legal-document-versions";

const ALL_CONSENT_TYPES: ConsentType[] = [
  "PRIVACY_NOTICE",
  "SENSITIVE_DATA",
  "TELEMEDICINE",
  "DIGITAL_PRESCRIPTION_CHANNEL",
  "MARKETING",
];

function versionFor(consentType: ConsentType): string {
  return consentType === "TELEMEDICINE" || consentType === "MARKETING"
    ? CURRENT_TERMS_VERSION
    : CURRENT_PRIVACY_NOTICE_VERSION;
}

@ApiTags("consents")
@ApiBearerAuth()
@Controller("consents")
@UseGuards(JwtAuthGuard)
export class ConsentsController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  @ApiOperation({ summary: "Estado vigente de cada tipo de consentimiento (M1-RN-004)" })
  async list(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const statuses = await Promise.all(
      ALL_CONSENT_TYPES.map(async (consentType) => ({
        consentType,
        status: await this.consentService.currentStatus(user.sub, consentType),
      }))
    );
    return statuses;
  }

  // M1-RN-004: re-acceptance or opting into a previously-declined
  // consent both go through this same append-only write.
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Registra una decisión de consentimiento (fila append-only nueva)" })
  async record(@Body(new ZodValidationPipe(consentUpsertSchema)) body: ConsentUpsertInput, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const meta = getRequestMeta(req);
    await this.consentService.record({
      userId: user.sub,
      consentType: body.consentType,
      documentVersion: versionFor(body.consentType),
      granted: body.granted,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { recorded: true };
  }
}
