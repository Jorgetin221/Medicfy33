import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../.env") });

// Cada archivo de prueba de integración levanta una app Nest completa
// con su propio PrismaClient, y vitest corre los archivos en paralelo
// (un worker por CPU). El pool por defecto de Prisma es CPUs*2+1 —21
// conexiones en una máquina de 10 núcleos— así que ~10 workers piden
// ~210 conexiones contra el max_connections=100 de PostgreSQL. Al
// agotarse, las peticiones en vuelo mueren con ECONNRESET o "socket
// hang up", de forma intermitente y en archivos distintos cada vez.
//
// Acotar el pool a 5 deja ~50 conexiones en el peor caso, muy por
// debajo del límite, sin renunciar al paralelismo. Solo afecta a las
// pruebas: no toca el .env ni la configuración de producción.
const TEST_CONNECTION_LIMIT = 5;

if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("connection_limit")) {
  const separator = process.env.DATABASE_URL.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${separator}connection_limit=${TEST_CONNECTION_LIMIT}`;
}
