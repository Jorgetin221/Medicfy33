import { HttpStatus, Injectable } from "@nestjs/common";
import type { PatientProtocolInstance, ProtocolSession } from "@prisma/client";
import type { PatientProtocolInstanceCloseInput, ProtocolSessionRecordInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

// Las ventanas se piensan en DÍAS de calendario ("sesión 1: días
// 0-3"), pero instance.startedAt lleva hora exacta (ej. 21:19 UTC).
// Sin truncar a medianoche, una sesión registrada la MISMA fecha de
// inicio pero antes de esa hora exacta caía "fuera de ventana" por
// unas horas — bug real encontrado al verificar en vivo (Playwright),
// no al escribir el código.
function startOfUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Fase 7 · Prompt 47B/C — instancia por paciente y sus sesiones.
@Injectable()
export class PatientProtocolInstanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPatient(patientId: string) {
    return this.prisma.patientProtocolInstance.findMany({
      where: { patientId },
      orderBy: { startedAt: "desc" },
      include: {
        protocol: { select: { name: true, sourceCitation: true } },
        sessions: { orderBy: { sequenceNumber: "asc" }, include: { template: { select: { label: true } } } },
      },
    });
  }

  // Criterio de aceptación #1: definir un protocolo nuevo por
  // configuración lo hace agendable sin desplegar código — esto es lo
  // que lo prueba: las ProtocolSession se generan aquí, una por cada
  // TreatmentProtocolSessionTemplate ya sembrado, con su proposedDate
  // ya calculada. proposedDate usa el INICIO de la ventana (más
  // simple y determinista que un punto medio) — ver nota de diseño en
  // el plan de Fase 7 sobre por qué el ancla es startedAt y no FUM.
  async startInstance(patientId: string, doctorUserId: string, protocolId: string): Promise<PatientProtocolInstance & { sessions: ProtocolSession[] }> {
    const protocol = await this.prisma.treatmentProtocol.findUnique({
      where: { id: protocolId },
      include: { sessionTemplates: { orderBy: { sequenceNumber: "asc" } } },
    });
    if (!protocol || !protocol.isActive) {
      throw new ApiException("PROTOCOL_NOT_FOUND", "Protocolo no encontrado o inactivo.", HttpStatus.NOT_FOUND);
    }

    const startedAt = new Date();
    const instance = await this.prisma.patientProtocolInstance.create({
      data: { patientId, protocolId, protocolVersion: protocol.version, startedByUserId: doctorUserId, startedAt },
    });

    if (protocol.sessionTemplates.length > 0) {
      await this.prisma.protocolSession.createMany({
        data: protocol.sessionTemplates.map((t) => ({
          instanceId: instance.id,
          templateId: t.id,
          sequenceNumber: t.sequenceNumber,
          proposedDate: addDays(startOfUtcDate(startedAt), t.windowStartOffsetDays),
        })),
      });
    }

    const sessions = await this.prisma.protocolSession.findMany({
      where: { instanceId: instance.id },
      orderBy: { sequenceNumber: "asc" },
    });
    return { ...instance, sessions };
  }

  // Criterio de aceptación #3: cerrar sin motivo devuelve error de
  // validación — closureReason es obligatorio en el schema Zod
  // (el controller ya lo exige antes de llegar aquí); esto además
  // valida que la instancia sea de ESTE paciente y siga ACTIVE.
  async closeInstance(patientId: string, instanceId: string, input: PatientProtocolInstanceCloseInput): Promise<PatientProtocolInstance> {
    const instance = await this.getOwnedActiveInstance(patientId, instanceId);
    return this.prisma.patientProtocolInstance.update({
      where: { id: instance.id },
      data: { status: "CLOSED", closedAt: new Date(), closureReason: input.closureReason, closureNotes: input.closureNotes ?? null },
    });
  }

  // Criterio de aceptación #2: "una sesión fuera de ventana se
  // REGISTRA como tal, no se rechaza" — withinWindow se CALCULA, nunca
  // bloquea el registro. Criterio #4: encounterId liga la sesión a la
  // nota de esa visita.
  async recordSession(patientId: string, instanceId: string, sessionId: string, input: ProtocolSessionRecordInput): Promise<ProtocolSession> {
    const instance = await this.prisma.patientProtocolInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.patientId !== patientId) {
      throw new ApiException("PROTOCOL_INSTANCE_NOT_FOUND", "Instancia de protocolo no encontrada.", HttpStatus.NOT_FOUND);
    }

    const session = await this.prisma.protocolSession.findUnique({
      where: { id: sessionId },
      include: { template: true },
    });
    if (!session || session.instanceId !== instanceId) {
      throw new ApiException("PROTOCOL_SESSION_NOT_FOUND", "Sesión no encontrada en esta instancia.", HttpStatus.NOT_FOUND);
    }

    // Hallazgo recurrente del Bloque 0: nunca confiar un id ajeno sin
    // comparar su patientId — aquí, que el encuentro a ligar sea de
    // ESTE paciente.
    if (input.encounterId !== undefined) {
      const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter || encounter.patientId !== patientId) {
        throw new ApiException("ENCOUNTER_NOT_FOUND", "El encuentro a ligar no existe o no pertenece a este paciente.", HttpStatus.NOT_FOUND);
      }
    }

    const actualDate = new Date(`${input.actualDate}T00:00:00.000Z`);
    const instanceStartDate = startOfUtcDate(instance.startedAt);
    const windowStart = addDays(instanceStartDate, session.template.windowStartOffsetDays);
    const windowEnd = addDays(instanceStartDate, session.template.windowEndOffsetDays);
    const withinWindow = actualDate >= windowStart && actualDate <= windowEnd;

    return this.prisma.protocolSession.update({
      where: { id: sessionId },
      data: {
        actualDate,
        withinWindow,
        ...(input.encounterId !== undefined ? { encounterId: input.encounterId } : {}),
        ...(input.data !== undefined ? { data: input.data } : {}),
      },
    });
  }

  private async getOwnedActiveInstance(patientId: string, instanceId: string): Promise<PatientProtocolInstance> {
    const instance = await this.prisma.patientProtocolInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.patientId !== patientId) {
      throw new ApiException("PROTOCOL_INSTANCE_NOT_FOUND", "Instancia de protocolo no encontrada.", HttpStatus.NOT_FOUND);
    }
    if (instance.status !== "ACTIVE") {
      throw new ApiException("PROTOCOL_INSTANCE_ALREADY_CLOSED", "Esta instancia ya está cerrada.", HttpStatus.CONFLICT);
    }
    return instance;
  }
}
