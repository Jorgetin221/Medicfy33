import { Module } from "@nestjs/common";
import { ClinicalCatalogService } from "./services/clinical-catalog.service";

// Prompt 7 (medicfy-50-prompts.md), R2 "los catálogos son cerrados".
// Sin imports de otros módulos: esta tabla no depende de nada
// todavía. Sin controllers: el prompt pide "esquema, migraciones y
// repositorio de acceso" — la API llega en un prompt posterior.
@Module({
  providers: [ClinicalCatalogService],
  exports: [ClinicalCatalogService],
})
export class CatalogModule {}
