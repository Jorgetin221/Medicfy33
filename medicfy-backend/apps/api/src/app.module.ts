import { Module } from "@nestjs/common";
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

@Module({
  imports: [
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
})
export class AppModule {}
