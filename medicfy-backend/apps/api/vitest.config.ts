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
  },
});
