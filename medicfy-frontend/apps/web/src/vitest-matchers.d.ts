// Hace visibles los matchers de jest-dom (toBeInTheDocument, etc.)
// para tsc — vitest.setup.ts los registra en runtime, pero ese archivo
// vive fuera de src/ y tsc no lo incluye en el programa.
import "@testing-library/jest-dom/vitest";
