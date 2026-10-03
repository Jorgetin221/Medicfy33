import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    // NestJS's DI resolves constructor params via TS decorator
    // metadata (emitDecoratorMetadata). Vite's default esbuild
    // transform doesn't emit that; SWC's decorator support does.
    swc.vite(),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.spec.ts", "src/**/*.integration.spec.ts"],
    // Los 5 s por defecto de vitest se quedan cortos para las pruebas de
    // integración: cada registro de usuario hace un hash argon2, que es
    // lento a propósito, y la suite corre los archivos en paralelo
    // compitiendo por CPU. Aisladas tardan ~4 s; bajo carga cruzaban el
    // límite y caían por timeout (y por el ECONNRESET que deja detrás la
    // conexión de supertest al abortarse). No se desactiva ninguna
    // prueba: se corrige un límite pensado para pruebas unitarias.
    testTimeout: 20_000,
  },
});
