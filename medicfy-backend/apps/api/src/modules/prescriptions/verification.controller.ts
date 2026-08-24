import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrescriptionService } from "./services/prescription.service";
import { LabOrderService } from "../labs/services/lab-order.service";
import { ApiException } from "../../common/api-exception";

// M9-RN-010/§6.7: página pública de verificación — sin autenticación,
// sin contenido clínico. El token es un UUID aleatorio por documento
// (receta u orden de laboratorio, tablas distintas); se prueba
// primero como receta y luego como orden, nunca ambigüedad real por
// construcción (espacio de UUIDs, no un índice compartido).
@ApiTags("verification")
@Controller("verificar")
export class VerificationController {
  constructor(
    private readonly prescriptions: PrescriptionService,
    private readonly labOrders: LabOrderService
  ) {}

  @Get(":token")
  @ApiOperation({ summary: "M9-CA-004: confirma folio/fecha/médico/paciente enmascarado, nunca el contenido clínico" })
  async verify(@Param("token") token: string) {
    try {
      return await this.prescriptions.getByVerificationToken(token);
    } catch {
      // no era una receta, se intenta como orden de laboratorio antes
      // de responder 404 real.
    }
    try {
      return await this.labOrders.getByVerificationToken(token);
    } catch {
      throw new ApiException("VERIFICATION_NOT_FOUND", "Documento no encontrado.", 404);
    }
  }
}
