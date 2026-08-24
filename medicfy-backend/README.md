# Medicfy — Backend

API NestJS de la herramienta clínica del médico privado mexicano. Separado de [medicfy-frontend](../medicfy-frontend) el 2026-08-15 — antes vivían juntos en un monorepo (`~/medicfy`). Ver [CLAUDE.md](./CLAUDE.md) para las reglas del proyecto y [docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md](./docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md) como única fuente de requisitos.

## Estructura

```
/apps
  /api          NestJS, monolito modular
/packages
  /contracts    tipos y esquemas Zod — copia propia de este repo, ya no compartida por workspace con el frontend
/infra          Terraform
/docs           especificación y módulos
/prisma         esquema y migraciones
```

**`packages/contracts` está duplicado entre este repo y `medicfy-frontend`.** No hay nada que los mantenga sincronizados automáticamente — si cambias un esquema aquí que el frontend también usa, cámbialo ahí también a mano.

## Desarrollo

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Requiere Node ≥22 y PostgreSQL 16 corriendo localmente (ver `DATABASE_URL` en `.env`). `WEB_ORIGIN` en `.env` debe apuntar a donde corra `medicfy-frontend` (CORS).
