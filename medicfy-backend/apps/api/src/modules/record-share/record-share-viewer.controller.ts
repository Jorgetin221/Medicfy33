import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { mustShareGrant, SharedRecordGuard, type SharedRecordRequest } from "./shared-record.guard";
import { RecordShareViewerService } from "./services/record-share-viewer.service";

// PR-EXP-05. Solo GET — "ningún endpoint de escritura acepta un id de
// un grant compartido" se cumple por construcción: este controller no
// declara ningún otro verbo, y ningún endpoint de escritura de otros
// módulos acepta grantId como parámetro.
@ApiTags("record-share")
@ApiBearerAuth()
@Controller("record-share/grants")
@UseGuards(JwtAuthGuard)
export class RecordShareViewerController {
  constructor(private readonly viewer: RecordShareViewerService) {}

  @Get("mine")
  @ApiOperation({ summary: "Bandeja 'Expedientes compartidos conmigo'" })
  @ApiResponse({ status: 200 })
  async listMine(@Req() req: AuthenticatedRequest) {
    return this.viewer.listMine(req.user.sub);
  }

  @Get(":grantId")
  @UseGuards(SharedRecordGuard)
  @ApiOperation({ summary: "Resumen clínico del grant — Resumen siempre permitido si el grant es válido" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_ACCESS_DENIED" })
  async getDetail(@Param("grantId") grantId: string, @Req() req: SharedRecordRequest) {
    return this.viewer.getDetail(mustShareGrant(req), req.user.sub, getRequestMeta(req));
  }

  @Get(":grantId/notes")
  @UseGuards(SharedRecordGuard)
  @ApiOperation({ summary: "Notas firmadas — exige SIGNED_NOTES en el alcance" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_ACCESS_DENIED | RECORD_SHARE_SCOPE_NOT_GRANTED" })
  async getNotes(@Param("grantId") grantId: string, @Req() req: SharedRecordRequest) {
    return this.viewer.getNotes(mustShareGrant(req), req.user.sub, getRequestMeta(req));
  }

  @Get(":grantId/results")
  @UseGuards(SharedRecordGuard)
  @ApiOperation({ summary: "Resultados — exige RESULTS en el alcance" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_ACCESS_DENIED | RECORD_SHARE_SCOPE_NOT_GRANTED" })
  async getResults(@Param("grantId") grantId: string, @Req() req: SharedRecordRequest) {
    return this.viewer.getResults(mustShareGrant(req), req.user.sub, getRequestMeta(req));
  }

  @Get(":grantId/prescriptions")
  @UseGuards(SharedRecordGuard)
  @ApiOperation({ summary: "Recetas — exige PRESCRIPTIONS en el alcance" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_ACCESS_DENIED | RECORD_SHARE_SCOPE_NOT_GRANTED" })
  async getPrescriptions(@Param("grantId") grantId: string, @Req() req: SharedRecordRequest) {
    return this.viewer.getPrescriptions(mustShareGrant(req), req.user.sub, getRequestMeta(req));
  }

  @Get(":grantId/study-orders")
  @UseGuards(SharedRecordGuard)
  @ApiOperation({ summary: "Órdenes de estudio — exige STUDY_ORDERS en el alcance" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_ACCESS_DENIED | RECORD_SHARE_SCOPE_NOT_GRANTED" })
  async getStudyOrders(@Param("grantId") grantId: string, @Req() req: SharedRecordRequest) {
    return this.viewer.getStudyOrders(mustShareGrant(req), req.user.sub, getRequestMeta(req));
  }
}
