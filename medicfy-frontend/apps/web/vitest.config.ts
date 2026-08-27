import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Fase 1 / hallazgo #20: la pantalla donde el médico pasa el 80% del
// tiempo no tenía ni una prueba. Vitest + Testing Library para
// componentes; el criterio de tableta (1280×800 sin scroll, CLAUDE.md
// §6) vive en Playwright (playwright.config.ts), que sí mide pixeles
// reales.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // globals habilita el afterEach global del auto-cleanup de
    // Testing Library — sin él, cada render se acumula entre pruebas.
    globals: true,
    include: ["src/**/*.spec.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
