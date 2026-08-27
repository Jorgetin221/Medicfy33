import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { CatalogController } from "./catalog.controller";
import { CuratorGuard } from "./guards/curator.guard";
import { ClinicalCatalogService } from "./services/clinical-catalog.service";
import { TermRequestService } from "./services/term-request.service";

// Prompt 7 dio el esquema y el repositorio; Prompt 10-11 agregan la
// API con rol curador ("el alta de términos es un flujo aparte con rol
// curador") y la bitácora de cada mutación. IdentityModule aporta
// JwtAuthGuard/TokenService y AuditService.
@Module({
  imports: [IdentityModule],
  controllers: [CatalogController],
  providers: [ClinicalCatalogService, TermRequestService, CuratorGuard],
  exports: [ClinicalCatalogService, TermRequestService],
})
export class CatalogModule {}
