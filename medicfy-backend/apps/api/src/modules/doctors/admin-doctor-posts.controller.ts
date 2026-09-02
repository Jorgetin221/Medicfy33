import { Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { AdminGuard } from "../identity/guards/admin.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { DoctorPostService } from "./services/doctor-post.service";

// M2B-RN-008: moderación mínima — un admin puede archivar cualquier
// publicación de cualquier médico. Sin cola de revisión editorial en
// esta versión.
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/doctor-posts")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminDoctorPostsController {
  constructor(private readonly postService: DoctorPostService) {}

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "M2B-CA-007: archiva la publicación de cualquier médico, auditado" })
  @ApiResponse({ status: 200 })
  async archive(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.postService.archiveByAdmin(id, user.sub, getRequestMeta(req));
  }
}
