import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./services/admin-users.service";
import { AdminMetricsController } from "./admin-metrics.controller";
import { AdminMetricsService } from "./services/admin-metrics.service";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditService } from "./services/admin-audit.service";

// M13 (panel de administración). La verificación de médicos y la
// moderación de publicaciones se construyeron antes que este módulo
// (ver comentario en doctor-verification.service.ts) y siguen viviendo
// en DoctorsModule — no se movieron aquí para no tocar código que ya
// funciona y tiene pruebas de integración sin necesidad real.
@Module({
  imports: [IdentityModule],
  controllers: [AdminUsersController, AdminMetricsController, AdminAuditController],
  providers: [AdminUsersService, AdminMetricsService, AdminAuditService],
})
export class AdminModule {}
