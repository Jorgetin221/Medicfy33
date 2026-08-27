import { z } from "zod";

// Prompt 7 (medicfy-50-prompts.md), R2: "todo catálogo declara su
// sistema de codificación externo o queda documentado explícitamente
// como propietario" — codingSystem nunca es opcional aquí; si no hay
// sistema externo, el valor explícito es "PROPIETARIO", no un campo
// vacío u omitido.
export const clinicalCatalogTermCreateSchema = z
  .object({
    domain: z.string().min(1).max(100),
    key: z.string().min(1).max(100),
    preferredTerm: z.string().min(1).max(200),
    synonyms: z.array(z.string().min(1).max(200)).optional(),
    externalCode: z.string().min(1).max(60).optional(),
    codingSystem: z.string().min(1, "Declara el sistema de codificación externo, o \"PROPIETARIO\" si no tiene uno.").max(60),
    curatedBy: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ClinicalCatalogTermCreateInput = z.infer<typeof clinicalCatalogTermCreateSchema>;
