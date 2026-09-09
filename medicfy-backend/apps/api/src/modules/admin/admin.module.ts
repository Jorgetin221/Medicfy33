import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./services/admin-users.service";
import { AdminMetricsController } from "./admin-metrics.controller";
import { AdminMetricsService } from "./services/admin-metrics.service";

// M13 (panel de administración). La verificación de médicos y la
// moderación de publicaciones se construyeron antes que este módulo
// (ver comentario en doctor-verification.service.ts) y siguen viviendo
// en DoctorsModule — no se movieron aquí para no tocar código que ya
// funciona y tiene pruebas de integración sin necesidad real.
@Module({
  imports: [IdentityModule],
  controllers: [AdminUsersController, AdminMetricsController],
  providers: [AdminUsersService, AdminMetricsService],
})
export class AdminModule {}
