import { Controller, Get, INestApplication, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Throttle, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// M15-RN-010 ("Rate limiting por IP y por usuario en autenticación,
// búsqueda y descarga de archivos"). A diferencia de casi toda otra
// prueba de integración de este backend, ÉSTA sí corre de verdad en
// este entorno sin necesitar Postgres: ThrottlerGuard es un guard de
// Nest puro (su storage en memoria por defecto), así que se prueba
// con un módulo mínimo propio en vez de levantar AppModule completo
// (que sí necesita Prisma/Postgres reales para arrancar).
//
// Esto verifica el MECANISMO — el mismo patrón exacto que
// app.module.ts usa (ThrottlerModule.forRoot + ThrottlerGuard como
// APP_GUARD + @Throttle() por ruta) — con un límite bajo (2) elegido
// solo para que la prueba sea rápida. Las cifras reales de producción
// (10/30/20 por minuto) viven en rate-limit.ts y se verifican ahí por
// lectura directa, no repitiendo la espera de 60s aquí.
@Controller("probe")
class ProbeController {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] })],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ProbeModule {}

describe("M15-RN-010 — ThrottlerGuard bloquea tras el límite configurado", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("permite las primeras `limit` peticiones y responde 429 a la siguiente", async () => {
    const first = await request(app.getHttpServer()).get("/probe");
    const second = await request(app.getHttpServer()).get("/probe");
    const third = await request(app.getHttpServer()).get("/probe");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });
});
