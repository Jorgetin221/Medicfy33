import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { DoctorPostService } from "./services/doctor-post.service";

// M2B-RN-002: la única forma de alcanzar visibility=PATIENTS_ONLY.
// Autenticado (cualquier rol), autorizado en backend contra
// care_relationship — nunca por lo que el cliente diga ser. Sin
// consumidor real todavía: no existe portal de pacientes en el
// frontend (ver spec §7 M2B).
@ApiTags("doctor-posts")
@ApiBearerAuth()
@Controller("doctors/:id/posts")
@UseGuards(JwtAuthGuard)
export class DoctorPostPatientsController {
  constructor(private readonly postService: DoctorPostService) {}

  @Get("patients-only")
  @ApiOperation({ summary: "M2B-CA-002: publicaciones PATIENTS_ONLY del médico :id, 403 sin care_relationship activo" })
  async getPatientsOnlyPosts(@Param("id") doctorId: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.postService.listPatientsOnly(doctorId, user.sub, getRequestMeta(req));
  }
}
