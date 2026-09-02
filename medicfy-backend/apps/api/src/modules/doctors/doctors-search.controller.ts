import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { doctorPublicSearchQuerySchema, type DoctorPublicSearchQuery } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { DoctorProfileService } from "./services/doctor-profile.service";

// M3 (spec §7, v2.3/v2.4): directorio y búsqueda. Público, sin guard —
// mismo nivel que /doctors/:slug/public. "doctors/public" es un
// segundo segmento literal, distinto de "doctors/me" y de
// "doctors/:slug/public" (que tiene 3 segmentos) — sin ambigüedad de
// ruteo con ninguno de los controllers existentes del módulo.
@ApiTags("doctors-public")
@Controller("doctors/public")
export class DoctorsSearchController {
  constructor(private readonly doctorProfileService: DoctorProfileService) {}

  @Get()
  @ApiOperation({ summary: "M3: búsqueda/listado público de médicos — nunca precio, nunca campos inventados" })
  async search(@Query(new ZodValidationPipe(doctorPublicSearchQuerySchema)) query: DoctorPublicSearchQuery) {
    return this.doctorProfileService.searchPublic(query);
  }
}
