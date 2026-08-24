import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { validateEnv } from "./config/env.schema";
import { ApiExceptionFilter } from "./common/api-exception.filter";

export async function createApp() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  // Sprint 5c: apps/web calls this API cross-origin. credentials:true
  // + an explicit origin (never "*") because the refresh token travels
  // as an httpOnly cookie (M1-RN-007) — wildcard origins and
  // credentialed requests are mutually exclusive in the CORS spec anyway.
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  // spec §8: "Especificación OpenAPI 3.1 generada desde el código...
  // publicada en /api/docs". @nestjs/swagger targets OpenAPI 3.0 (no
  // stable 3.1 support yet) — closest available, documented here
  // rather than silently claiming 3.1.
  const openApiConfig = new DocumentBuilder()
    .setTitle("Medicfy API")
    .setDescription("Herramienta clínica del médico privado mexicano.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("api/docs", app, document);

  return { app, env };
}

async function bootstrap() {
  const { app, env } = await createApp();
  await app.listen(env.PORT);
}

if (require.main === module) {
  void bootstrap();
}
