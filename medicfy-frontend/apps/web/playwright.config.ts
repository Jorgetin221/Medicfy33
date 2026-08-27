import { defineConfig } from "@playwright/test";

// R8 / CLAUDE.md §6: DOC-06 se mide en 1280×800 — antecedentes,
// alergias y últimas 3 consultas visibles SIN scroll ni clic, y
// objetivos táctiles de 44px. El proyecto "tableta" fija ese viewport;
// las pruebas fallan si la Zona 1 se sale de él.
// Requiere la API en :3001 y el web (next start o dev) en :3000 —
// e2e/global-setup.ts siembra los datos y escribe las credenciales.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // Entornos con Chromium preinstalado (CI/contenedor): apuntar el
    // binario con E2E_CHROMIUM_PATH en vez de descargar navegadores.
    ...(process.env.E2E_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } } : {}),
  },
  projects: [
    {
      name: "tableta",
      use: { viewport: { width: 1280, height: 800 }, hasTouch: true },
    },
  ],
});
