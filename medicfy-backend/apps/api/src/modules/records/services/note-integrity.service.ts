import { Injectable } from "@nestjs/common";
import {
  buildCorrectionNoteHashInput,
  buildSignedNoteHashInput,
  sha256Hex,
  type SignedNoteHashInput,
} from "../../../common/content-hash.util";
import { PrismaService } from "../../../prisma/prisma.service";

type HashedDiagnosis = SignedNoteHashInput["diagnoses"][number];

// A-09: las filas firmadas antes de 2026-10-22 no guardan `ordinal`, y
// el orden con el que entraron al hash no se puede reconstruir de la
// base (mismo createdAt, id aleatorio). Para esas se prueba cada orden
// posible — con un tope, porque una nota real rara vez trae más de 6
// diagnósticos (720 órdenes, trivial).
const MAX_LEGACY_DIAGNOSES_TO_PERMUTE = 6;

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i] as T, ...tail];
  }
}

export interface NoteIntegrityResult {
  encounterId: string;
  noteId: string;
  signedAt: Date;
  status: "OK" | "ALTERADA";
  reasons: string[];
}

// Fase 6 · Prompt 45: "sello de integridad por nota firmada,
// verificable de forma independiente, que permita detectar cualquier
// alteración posterior." contentHashSha256/previousHashSha256 ya se
// calculan al firmar (ClinicalEncounterService.sign) — lo que faltaba
// era releerlos y RECALCULAR el hash desde lo que de verdad quedó
// guardado, en vez de solo confiar en la columna.
//
// Dos comparaciones por nota, no una:
// (a) el hash recalculado contra el propio contentHashSha256 — detecta
//     que ESA fila fue alterada.
// (b) el previousHashSha256 de la SIGUIENTE nota firmada contra el
//     contentHashSha256 (ORIGINAL, guardado) de esta — detecta que una
//     nota VIEJA fue alterada aunque alguien le haya recalculado su
//     propio hash para que (a) coincida consigo misma: el eslabón con
//     la nota siguiente, que nadie pudo volver a firmar, se rompe
//     igual. Esta es la parte "sin confiar en el sistema que la
//     guardó" — la prueba no depende de ningún valor que el propio
//     atacante pudiera haber tocado al mismo tiempo.
@Injectable()
export class NoteIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyPatientChain(patientId: string): Promise<NoteIntegrityResult[]> {
    const encounters = await this.prisma.clinicalEncounter.findMany({
      where: { patientId, status: "SIGNED" },
      orderBy: { signedAt: "asc" },
      include: {
        notes: { where: { isCorrectionOfNoteId: null } },
        specialtyData: true,
      },
    });

    const results: NoteIntegrityResult[] = [];

    for (let i = 0; i < encounters.length; i++) {
      const encounter = encounters[i];
      const note = encounter?.notes[0];
      if (!encounter || !note || !encounter.signedAt) continue;

      // Diagnósticos TAL COMO ESTABAN al firmar — una adenda posterior
      // puede sumar más diagnósticos al mismo encuentro (legítimo, no
      // es alteración), así que se acotan a los creados hasta signedAt.
      const diagnosisRows = await this.prisma.encounterDiagnosis.findMany({
        where: { encounterId: encounter.id, createdAt: { lte: encounter.signedAt } },
        orderBy: [{ ordinal: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
        select: { ordinal: true, icd10CodeId: true, codeAbsentReason: true, description: true, diagnosisType: true, certainty: true },
      });
      const diagnoses: HashedDiagnosis[] = diagnosisRows.map(({ ordinal: _ordinal, ...d }) => d);
      const isLegacyOrder = diagnosisRows.some((d) => d.ordinal === null) && diagnosisRows.length > 1;

      const hashWith = (orderedDiagnoses: HashedDiagnosis[]) =>
        sha256Hex(
          buildSignedNoteHashInput({
            note: {
              chiefComplaint: note.chiefComplaint,
              currentIllness: note.currentIllness,
              physicalExam: note.physicalExam,
              assessment: note.assessment,
              plan: note.plan,
              prognosis: note.prognosis,
              vitals: note.vitals,
              specialtyCode: note.specialtyCode,
              noteTypeTermId: note.noteTypeTermId,
              patientInstructions: note.patientInstructions,
              suggestedFollowUpDays: note.suggestedFollowUpDays,
            },
            diagnoses: orderedDiagnoses,
            specialtyData: encounter.specialtyData?.data ?? null,
            previousHashSha256: encounter.previousHashSha256,
            encounterId: encounter.id,
          })
        );

      const reasons: string[] = [];
      if (!this.matchesAnyOrder(diagnoses, isLegacyOrder, hashWith, encounter.contentHashSha256)) {
        reasons.push("El contenido guardado no coincide con su propio sello — la nota fue alterada.");
      }
      const next = encounters[i + 1];
      if (next && next.previousHashSha256 !== encounter.contentHashSha256) {
        reasons.push("El eslabón con la siguiente nota firmada de este paciente está roto.");
      }

      reasons.push(...(await this.verifyCorrections(encounter.id, encounter.contentHashSha256)));

      results.push({
        encounterId: encounter.id,
        noteId: note.id,
        signedAt: encounter.signedAt,
        status: reasons.length === 0 ? "OK" : "ALTERADA",
        reasons,
      });
    }

    return results;
  }

  private matchesAnyOrder(
    diagnoses: HashedDiagnosis[],
    isLegacyOrder: boolean,
    hashWith: (ordered: HashedDiagnosis[]) => string,
    expected: string | null
  ): boolean {
    if (hashWith(diagnoses) === expected) return true;
    if (!isLegacyOrder || diagnoses.length > MAX_LEGACY_DIAGNOSES_TO_PERMUTE) return false;
    for (const ordered of permutations(diagnoses)) {
      if (hashWith(ordered) === expected) return true;
    }
    return false;
  }

  // A-10: cada adenda con sello propio (las posteriores a 2026-10-22)
  // se recalcula igual que la nota original. Las anteriores no tienen
  // sello y no hay contra qué compararlas.
  private async verifyCorrections(encounterId: string, encounterHash: string | null): Promise<string[]> {
    const corrections = await this.prisma.clinicalNote.findMany({
      where: { encounterId, isCorrectionOfNoteId: { not: null }, contentHashSha256: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    const reasons: string[] = [];
    for (const correction of corrections) {
      const diagnoses = await this.prisma.encounterDiagnosis.findMany({
        where: { encounterId, createdAt: correction.createdAt },
        orderBy: [{ ordinal: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        select: { icd10CodeId: true, codeAbsentReason: true, description: true, diagnosisType: true, certainty: true },
      });
      const recomputed = sha256Hex(
        buildCorrectionNoteHashInput({
          note: {
            chiefComplaint: correction.chiefComplaint,
            currentIllness: correction.currentIllness,
            physicalExam: correction.physicalExam,
            assessment: correction.assessment,
            plan: correction.plan,
            prognosis: correction.prognosis,
            vitals: correction.vitals,
            specialtyCode: null,
            noteTypeTermId: null,
            patientInstructions: correction.patientInstructions,
            suggestedFollowUpDays: correction.suggestedFollowUpDays,
          },
          diagnoses,
          specialtyData: null,
          previousHashSha256: encounterHash,
          encounterId,
          isCorrectionOfNoteId: correction.isCorrectionOfNoteId as string,
          authorUserId: correction.authorUserId ?? "",
        })
      );
      if (recomputed !== correction.contentHashSha256) {
        reasons.push("Una adenda de esta nota no coincide con su propio sello — fue alterada.");
      }
    }
    return reasons;
  }
}
