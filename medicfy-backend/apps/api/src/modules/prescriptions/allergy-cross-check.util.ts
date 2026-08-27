import { normalizeTerm } from "../catalog/term-normalizer.util";

// M8-RN-008 / M9-RN-008a — cruce automático de la receta contra las
// alergias activas del paciente.
//
// POR QUÉ ESTE ARCHIVO EXISTE (auditoría del Bloque 0, 26 ago 2026).
// El cruce anterior comparaba subcadenas en las dos direcciones:
//
//   catalog.genericName.includes(a.substance) || a.substance.includes(catalog.genericName)
//
// Eso producía las dos fallas posibles a la vez:
//
//   FALSO NEGATIVO — alergia "Penicilinas", fármaco "Amoxicilina":
//     ninguna cadena contiene a la otra, así que no disparaba. Es el
//     caso de prueba que el prompt 34 declara obligatorio, y pasaba
//     en silencio.
//   FALSO POSITIVO — alergia capturada como "no": "Naproxeno"
//     contiene "no", así que disparaba. Eso es fatiga de alerta, y el
//     médico aprende a saltarse el aviso en dos días.
//
// El cruce de ahora usa tres criterios explícitos, ninguno por
// subcadena: principio activo, nombre comercial y grupo terapéutico
// por prefijo ATC. Es una función pura a propósito — se prueba sin
// base de datos.
//
// LO QUE ESTO NO ES. `PatientAllergy.substance` sigue siendo texto
// libre; estructurarlo contra catálogo es trabajo de la Fase 4 (R3).
// Mientras tanto una alergia que no se resuelve ni a un fármaco del
// catálogo ni a una familia conocida se reporta como NO VERIFICABLE
// en vez de pasar callada: el médico ve que el sistema no pudo
// comprobarla, que es distinto de que no haya conflicto.

/** Familias de fármacos por prefijo ATC (OMS ATC/DDD, clasificación
 * pública). Sólo las que un paciente nombra al declarar una alergia.
 * El prefijo de 4 caracteres es el subgrupo farmacológico; el de 3,
 * el grupo terapéutico. No hay afirmación clínica inventada aquí: es
 * la misma clasificación que ya usa el chequeo de duplicidad. */
type Familia = { prefijoAtc: string; etiqueta: string };

const FAMILIA_A_PREFIJO_ATC: Record<string, Familia> = {
  penicilina: { prefijoAtc: "J01C", etiqueta: "las penicilinas" },
  betalactamico: { prefijoAtc: "J01C", etiqueta: "los betalactámicos" },
  "beta lactamico": { prefijoAtc: "J01C", etiqueta: "los betalactámicos" },
  cefalosporina: { prefijoAtc: "J01D", etiqueta: "las cefalosporinas" },
  carbapenemico: { prefijoAtc: "J01DH", etiqueta: "los carbapenémicos" },
  sulfa: { prefijoAtc: "J01E", etiqueta: "las sulfonamidas" },
  sulfonamida: { prefijoAtc: "J01E", etiqueta: "las sulfonamidas" },
  macrolido: { prefijoAtc: "J01F", etiqueta: "los macrólidos" },
  aminoglucosido: { prefijoAtc: "J01G", etiqueta: "los aminoglucósidos" },
  tetraciclina: { prefijoAtc: "J01A", etiqueta: "las tetraciclinas" },
  quinolona: { prefijoAtc: "J01M", etiqueta: "las quinolonas" },
  fluoroquinolona: { prefijoAtc: "J01M", etiqueta: "las quinolonas" },
  aine: { prefijoAtc: "M01A", etiqueta: "los AINE" },
  aines: { prefijoAtc: "M01A", etiqueta: "los AINE" },
  "antiinflamatorio no esteroideo": { prefijoAtc: "M01A", etiqueta: "los AINE" },
  opioide: { prefijoAtc: "N02A", etiqueta: "los opioides" },
  opiaceo: { prefijoAtc: "N02A", etiqueta: "los opioides" },
};

export type AllergyRecord = {
  id: string;
  substance: string;
  reaction: string | null;
  severity: string;
  source: string;
  createdAt: Date;
};

export type CatalogDrug = {
  id: string;
  genericName: string;
  brandNames: string[];
  atcCode: string | null;
};

export type AllergyMatchBasis = "PRINCIPIO_ACTIVO" | "NOMBRE_COMERCIAL" | "GRUPO_TERAPEUTICO";

export type AllergyMatch = {
  allergyId: string;
  substance: string;
  reaction: string | null;
  severity: string;
  source: string;
  registeredAt: Date;
  medicationCatalogId: string;
  genericName: string;
  basis: AllergyMatchBasis;
  /** Por qué coincide, en la voz del mensaje que ve el médico (prompt 34). */
  explanation: string;
};

export type UnverifiableAllergy = {
  allergyId: string;
  substance: string;
  reason: string;
};

export type AllergyCrossCheckResult = {
  matches: AllergyMatch[];
  unverifiable: UnverifiableAllergy[];
};

/**
 * Cruza los fármacos de una receta contra las alergias activas del
 * paciente. Función pura: no toca la base de datos.
 */
export function crossCheckAllergies(allergies: AllergyRecord[], drugs: CatalogDrug[]): AllergyCrossCheckResult {
  const matches: AllergyMatch[] = [];
  const unverifiable: UnverifiableAllergy[] = [];

  for (const allergy of allergies) {
    const substancia = normalizeTerm(allergy.substance);
    if (substancia.length === 0) {
      unverifiable.push({ allergyId: allergy.id, substance: allergy.substance, reason: "La alergia se registró sin sustancia." });
      continue;
    }

    const familia = FAMILIA_A_PREFIJO_ATC[substancia];
    let resolvio = familia !== undefined;

    for (const drug of drugs) {
      const generico = normalizeTerm(drug.genericName);
      const comerciales = drug.brandNames.map(normalizeTerm);

      if (generico === substancia) {
        resolvio = true;
        matches.push(build(allergy, drug, "PRINCIPIO_ACTIVO", `"${drug.genericName}" es el principio activo al que el paciente declara alergia.`));
        continue;
      }

      const comercialCoincidente = drug.brandNames.find((_, i) => comerciales[i] === substancia);
      if (comercialCoincidente !== undefined) {
        resolvio = true;
        matches.push(
          build(allergy, drug, "NOMBRE_COMERCIAL", `"${comercialCoincidente}" es un nombre comercial de ${drug.genericName}, al que el paciente declara alergia.`)
        );
        continue;
      }

      if (familia !== undefined && drug.atcCode !== null && drug.atcCode.startsWith(familia.prefijoAtc)) {
        matches.push(
          build(
            allergy,
            drug,
            "GRUPO_TERAPEUTICO",
            `${drug.genericName} pertenece a ${familia.etiqueta} (ATC ${familia.prefijoAtc}), grupo al que el paciente declara alergia como "${allergy.substance}".`
          )
        );
      }
    }

    // La alergia no se resolvió ni a un fármaco del catálogo ni a una
    // familia conocida. No es "sin conflicto": es "no lo pude
    // comprobar", y el médico tiene que verlo.
    if (!resolvio) {
      unverifiable.push({
        allergyId: allergy.id,
        substance: allergy.substance,
        reason: `"${allergy.substance}" no corresponde a ningún principio activo del catálogo ni a una familia farmacológica conocida, así que no se pudo verificar automáticamente.`,
      });
    }
  }

  return { matches, unverifiable };
}

function build(allergy: AllergyRecord, drug: CatalogDrug, basis: AllergyMatchBasis, explanation: string): AllergyMatch {
  return {
    allergyId: allergy.id,
    substance: allergy.substance,
    reaction: allergy.reaction,
    severity: allergy.severity,
    source: allergy.source,
    registeredAt: allergy.createdAt,
    medicationCatalogId: drug.id,
    genericName: drug.genericName,
    basis,
    explanation,
  };
}
