import { Body, Controller, Get, HttpStatus, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { Request } from "express";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { ApiException } from "../../common/api-exception";
import { NotificationPreferencesService } from "./services/notification-preferences.service";

// CLAUDE.md §4: "Validación de entrada con Zod en el borde (DTO)".
const setPreferenceSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]),
});

@ApiTags("notification-preferences")
@ApiBearerAuth()
@Controller("notification-preferences")
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  constructor(private readonly preferencesService: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: "M12: canal de notificación preferido del usuario autenticado" })
  async get(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.preferencesService.getPreference(user.sub);
  }

  @Patch()
  @ApiOperation({ summary: "M12-RN-003: cambiar el canal (no se puede desactivar el recordatorio transaccional)" })
  async update(@Body() body: unknown, @Req() req: Request) {
    const parsed = setPreferenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiException("VALIDATION_ERROR", "Canal inválido. Usa EMAIL o WHATSAPP.", HttpStatus.BAD_REQUEST);
    }
    const { user } = req as AuthenticatedRequest;
    return this.preferencesService.setPreference(user.sub, parsed.data.channel);
  }
}
