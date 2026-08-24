import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { noteTemplateCreateSchema, type NoteTemplateCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ApiException } from "../../common/api-exception";
import { omitUndefined } from "../../common/omit-undefined";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorProfileService } from "../doctors/services/doctor-profile.service";
import { PrismaService } from "../../prisma/prisma.service";

// DOC-06/CLAUDE.md §6: "plantillas insertables por atajo de teclado".
// Sin CareRelationshipGuard: son del médico, no de un paciente — cada
// médico solo ve/gestiona las suyas (filtrado por doctorId siempre).
@ApiTags("records")
@ApiBearerAuth()
@Controller("note-templates")
@UseGuards(JwtAuthGuard)
export class NoteTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctorProfileService: DoctorProfileService
  ) {}

  @Get()
  @ApiOperation({ summary: "Plantillas de nota del médico autenticado" })
  async list(@Req() req: Request) {
    const doctor = await this.resolveDoctor(req);
    return this.prisma.noteTemplate.findMany({ where: { doctorId: doctor.id }, orderBy: { createdAt: "asc" } });
  }

  @Post()
  @ApiOperation({ summary: "Guarda una plantilla — el contenido siempre lo escribe el médico" })
  async create(@Body(new ZodValidationPipe(noteTemplateCreateSchema)) body: NoteTemplateCreateInput, @Req() req: Request) {
    const doctor = await this.resolveDoctor(req);
    if (body.shortcutKey) {
      const existing = await this.prisma.noteTemplate.findUnique({
        where: { doctorId_shortcutKey: { doctorId: doctor.id, shortcutKey: body.shortcutKey } },
      });
      if (existing) {
        throw new ApiException(
          "NOTE_TEMPLATE_SHORTCUT_TAKEN",
          `El atajo Alt+${body.shortcutKey} ya está asignado a "${existing.label}".`,
          HttpStatus.CONFLICT
        );
      }
    }
    const { shortcutKey, ...required } = body;
    return this.prisma.noteTemplate.create({ data: { doctorId: doctor.id, ...required, ...omitUndefined({ shortcutKey }) } });
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Elimina una plantilla propia" })
  async remove(@Param("id") id: string, @Req() req: Request): Promise<void> {
    const doctor = await this.resolveDoctor(req);
    const template = await this.prisma.noteTemplate.findUnique({ where: { id } });
    if (!template || template.doctorId !== doctor.id) {
      throw new ApiException("NOTE_TEMPLATE_NOT_FOUND", "Plantilla no encontrada.", HttpStatus.NOT_FOUND);
    }
    await this.prisma.noteTemplate.delete({ where: { id } });
  }

  private async resolveDoctor(req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.findByUserId(user.sub);
    if (!doctor) {
      throw new ApiException("DOCTOR_PROFILE_REQUIRED", "Solo un médico tiene plantillas de nota.", HttpStatus.FORBIDDEN);
    }
    return doctor;
  }
}
