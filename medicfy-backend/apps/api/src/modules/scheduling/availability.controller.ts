import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { availabilityQuerySchema } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { addDaysToDateString, todayInTimeZone } from "./timezone";
import { AvailabilitySlotService } from "./services/availability-slot.service";

const availabilityQueryPipe = new ZodValidationPipe(availabilityQuerySchema);

// Sprint 5c: la pantalla de creación de citas necesita un rango por
// defecto para mostrar espacios sin pedirle al médico que primero
// escoja fechas — 14 días corridos es solo el tamaño de la ventana
// que se muestra, no el límite real de agenda (ese es
// doctor.maxBookingWindowDays, que ya aplica dentro de computeSlots).
const DEFAULT_AVAILABILITY_WINDOW_DAYS = 14;

@ApiTags("scheduling")
@Controller("doctors/:id/availability")
export class AvailabilityController {
  constructor(private readonly slotService: AvailabilitySlotService) {}

  @Get()
  @ApiOperation({ summary: "M4-CA-004: espacios disponibles, respetando antelación mínima y buffers (público); sin from/to, asume hoy + 14 días" })
  @ApiQuery({ name: "from", required: false, description: "YYYY-MM-DD" })
  @ApiQuery({ name: "to", required: false, description: "YYYY-MM-DD" })
  @ApiQuery({ name: "service_id", required: true })
  async availability(
    @Param("id") doctorId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("service_id") serviceId: string
  ) {
    const query = availabilityQueryPipe.transform({ from, to, service_id: serviceId });
    const resolvedFrom = query.from ?? todayInTimeZone();
    const resolvedTo = query.to ?? addDaysToDateString(resolvedFrom, DEFAULT_AVAILABILITY_WINDOW_DAYS);
    return this.slotService.computeSlots(doctorId, { from: resolvedFrom, to: resolvedTo, service_id: query.service_id });
  }
}
