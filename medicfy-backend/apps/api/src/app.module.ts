import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { getTrackerByIpAndUser } from "./common/rate-limit";
import { requestContextMiddleware } from "./common/request-context";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { DoctorsModule } from "./modules/doctors/doctors.module";
import { SchedulingModule } from "./modules/scheduling/scheduling.module";
import { RecordsModule } from "./modules/records/records.module";
import { PrescriptionsModule } from "./modules/prescriptions/prescriptions.module";
import { LabsModule } from "./modules/labs/labs.module";
import { BillingModule } from "./modules/billing/billing.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuditModule } from "./modules/audit/audit.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { ProtocolsModule } from "./modules/protocols/protocols.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { AtlasModule } from "./modules/atlas/atlas.module";

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
      getTracker: getTrackerByIpAndUser,
      // Las pruebas de integración registran y autentican decenas de
      // usuarios seguidos contra la misma IP: con el limitador activo
      // agotan AuthThrottle (10/min) y reciben 429 donde esperan 201,
      // porque getTracker agrupa por IP mientras la ruta aún no está
      // autenticada — justo el caso de /auth/register y /auth/login,
      // por donde entra casi toda prueba. vitest fija NODE_ENV=test y
      // .env deja "development" fuera de pruebas, así que desarrollo y
      // producción no cambian de comportamiento.
      //
      // Esto NO deja el mecanismo sin cobertura: rate-limit.spec.ts
      // levanta su propio módulo con su propio ThrottlerGuard y sigue
      // exigiendo 429 al superar el límite, sin pasar por este skipIf.
      skipIf: () => process.env.NODE_ENV === "test",
    }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    DoctorsModule,
    SchedulingModule,
    RecordsModule,
    PrescriptionsModule,
    LabsModule,
    BillingModule,
    NotificationsModule,
    AdminModule,
    AuditModule,
    CatalogModule,
    ProtocolsModule,
    AssistantModule,
    AtlasModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  // M-14: registrado aquí (no en main.ts) para que también corra en las
  // pruebas de integración, que levantan AppModule sin pasar por main.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware).forRoutes("*");
  }
}
