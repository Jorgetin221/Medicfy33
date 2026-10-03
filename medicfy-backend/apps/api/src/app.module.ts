import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import jwt from "jsonwebtoken";
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

// M15-RN-010: "por IP y por usuario". ThrottlerGuard está registrado
// como guard GLOBAL (APP_GUARD), y en Nest los guards globales corren
// ANTES que los de controlador/método — JwtAuthGuard (que llena
// request.user) todavía no se ejecutó cuando esto corre, así que no
// se puede depender de request.user aquí. En vez de eso se decodifica
// el JWT del header Authorization SIN verificar firma — jwt.decode(),
// no jwt.verify() — porque esto es solo la llave para agrupar
// intentos en el limitador, nunca una decisión de autorización; un
// token corrupto o robado en el header simplemente cae de vuelta a
// "solo IP" (mismo resultado que una ruta pública) sin ningún riesgo
// de seguridad, ya que JwtAuthGuard sigue siendo quien de verdad
// autentica la petición después.
function getTrackerByIpAndUser(req: Record<string, unknown>): string {
  const request = req as unknown as Request;
  const ip = request.ip ?? "unknown-ip";
  const header = request.headers?.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return ip;
  try {
    const decoded = jwt.decode(token) as { sub?: string } | null;
    return decoded?.sub ? `${ip}:${decoded.sub}` : ip;
  } catch {
    return ip;
  }
}

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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
