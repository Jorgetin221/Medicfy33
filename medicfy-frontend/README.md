# Medicfy — Frontend

App Next.js de la herramienta clínica del médico privado mexicano. Separado de [medicfy-backend](../medicfy-backend) el 2026-08-15 — antes vivían juntos en un monorepo (`~/medicfy`). Ver [CLAUDE.md](./CLAUDE.md) para las reglas del proyecto (§5 en particular — reglas de frontend) y [docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md](./docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md) como única fuente de requisitos.

## Estructura

```
/apps
  /web          Next.js 15 (App Router), React 19, Tailwind
/packages
  /contracts    tipos y esquemas Zod — copia propia de este repo, ya no compartida por workspace con el backend
  /ui           componentes del design system (scaffold, aún no usado por apps/web)
/docs           especificación y módulos
```

**`packages/contracts` está duplicado entre este repo y `medicfy-backend`.** No hay nada que los mantenga sincronizados automáticamente — si cambias un esquema aquí que el backend también valida, cámbialo ahí también a mano.

## Desarrollo

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Requiere Node ≥22 y el backend (`medicfy-backend`) corriendo en `NEXT_PUBLIC_API_BASE_URL` (por defecto `http://localhost:3001`).
