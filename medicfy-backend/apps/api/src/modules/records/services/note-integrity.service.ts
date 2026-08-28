import { Injectable } from "@nestjs/common";
import { buildSignedNoteHashInput, sha256Hex } from "../../../common/content-hash.util";
import { PrismaService } from "../../../prisma/prisma.service";

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
      const diagnoses = await this.prisma.encounterDiagnosis.findMany({
        where: { encounterId: encounter.id, createdAt: { lte: encounter.signedAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { icd10CodeId: true, codeAbsentReason: true, description: true, diagnosisType: true, certainty: true },
      });

      const recomputedHash = sha256Hex(
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
          diagnoses,
          specialtyData: encounter.specialtyData?.data ?? null,
          previousHashSha256: encounter.previousHashSha256,
          encounterId: encounter.id,
        })
      );

      const reasons: string[] = [];
      if (recomputedHash !== encounter.contentHashSha256) {
        reasons.push("El contenido guardado no coincide con su propio sello — la nota fue alterada.");
      }
      const next = encounters[i + 1];
      if (next && next.previousHashSha256 !== encounter.contentHashSha256) {
        reasons.push("El eslabón con la siguiente nota firmada de este paciente está roto.");
      }

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
}
