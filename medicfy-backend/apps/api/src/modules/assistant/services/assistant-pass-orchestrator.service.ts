import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AssistantPass, AssistantReading } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ContextAssemblerService } from "./context-assembler.service";
import { ASSISTANT_MODEL_PORT, type AssistantModelPort } from "./assistant-model.port";

// Fase 8 · Prompt 51 — "Los cuatro pases". Cuándo disparar cada pase
// (blur + 3s estable, botón "Volver a leer") es del frontend (Zona 3,
// Prompt 53); esto es lo que pasa del lado del servidor UNA VEZ que
// ya se decidió disparar uno.
//
// Cancelación: "si el médico dispara un pase mientras otro corre, el
// anterior se CANCELA" se resuelve del lado del CLIENTE — el mismo
// patrón que cualquier fetch() cancelable con AbortController: el
// frontend aborta su propia petición anterior antes de lanzar la
// nueva. Este servicio no necesita guardar "cuál es el pase vigente
// de este encuentro" en memoria del servidor para lograrlo — solo
// necesita propagar el `signal` que ya trae la petición HTTP hasta la
// llamada real al modelo, para no seguir pagando/esperando una
// respuesta que ya nadie quiere. El controller arma ese signal desde
// `req.on("close", ...)`.
// Medido con llamadas reales durante Prompt 51: un caso clínico con
// contenido real (varios diferenciales, banderas rojas, hallazgos
// clave, cada uno con su razonamiento, más plan_sugerido/fuentes)
// tardó hasta ~160s en un solo intento con max_tokens=8192 — mucho
// más que un "hola" de prueba, porque la salida estructurada completa
// es grande, y el pipeline completo (guard, ensamblador de contexto,
// escritura en BD) suma encima de eso. Como generateReading() puede
// reintentar una vez si la primera salida no pasa la validación
// (Prompt 52: "un prompt bien escrito reduce el riesgo, no lo
// elimina"), el peor caso real es ~2x un intento. 180s da margen
// sobre eso — sigue siendo una espera larga, pero es del tamaño real
// del trabajo, no un número arbitrario. La Pestaña Asistente (Prompt
// 53) necesita diseñarse asíncrona (no un spinner bloqueante) sabiendo
// esto, no como una petición corta.
const DEFAULT_TIMEOUT_MS = 180_000;
// PENDIENTE(jorge): "Tope de gasto por consulta, con comportamiento
// definido al alcanzarlo" (Prompt 51) pide un número real de negocio/
// costos, no algo que se pueda inventar aquí. El MECANISMO de abajo
// (sumar tokens ya gastados en este encuentro, bloquear un pase nuevo
// al superar el tope) está completo; este valor es un default
// conservador de arranque, configurable por ASSISTANT_MAX_TOKENS_PER_ENCOUNTER
// hasta que confirmes el número real.
const DEFAULT_MAX_TOKENS_PER_ENCOUNTER = 60_000;

export type AssistantPassOutcome =
  | { kind: "ok"; reading: AssistantReading; readingId: string; createdAt: Date }
  | {
      kind: "unavailable";
      reason: "TIMEOUT" | "NOT_CONFIGURED" | "PROVIDER_ERROR" | "INVALID_OUTPUT" | "SPEND_CAP_REACHED";
    }
  | { kind: "cancelled" };

export interface AssistantReadingSummary {
  id: string;
  pase: AssistantPass;
  reading: AssistantReading;
  createdAt: Date;
}

@Injectable()
export class AssistantPassOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextAssembler: ContextAssemblerService,
    @Inject(ASSISTANT_MODEL_PORT) private readonly modelPort: AssistantModelPort
  ) {}

  async requestPass(encounterId: string, pase: AssistantPass, callerSignal: AbortSignal): Promise<AssistantPassOutcome> {
    if (callerSignal.aborted) return { kind: "cancelled" };

    const spend = await this.spentTokens(encounterId);
    const cap = Number(process.env.ASSISTANT_MAX_TOKENS_PER_ENCOUNTER ?? DEFAULT_MAX_TOKENS_PER_ENCOUNTER);
    if (spend >= cap) return { kind: "unavailable", reason: "SPEND_CAP_REACHED" };

    const { context, hashContexto } = await this.contextAssembler.assemble(encounterId);

    const timeoutMs = Number(process.env.ASSISTANT_MODEL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = AbortSignal.any([callerSignal, timeoutSignal]);

    const outcome = await this.modelPort.generateReading({ context, hashContexto, pase, signal: combinedSignal });

    if (outcome.kind === "cancelled") {
      // El puerto no distingue POR QUÉ se abortó — solo este
      // orquestador sabe cuál de las dos señales combinadas disparó.
      return timeoutSignal.aborted && !callerSignal.aborted ? { kind: "unavailable", reason: "TIMEOUT" } : { kind: "cancelled" };
    }
    if (outcome.kind === "unavailable") return outcome;

    const saved = await this.prisma.assistantReading.create({
      data: {
        encounterId,
        pase,
        contextHashSha256: hashContexto,
        readingJson: outcome.result.reading as unknown as Prisma.InputJsonValue,
        modelVersion: outcome.result.modelVersion,
        promptVersion: outcome.result.promptVersion,
        inputTokens: outcome.result.inputTokens,
        outputTokens: outcome.result.outputTokens,
      },
    });

    return { kind: "ok", reading: outcome.result.reading, readingId: saved.id, createdAt: saved.createdAt };
  }

  // "Cada pase reemplaza al anterior en pantalla, pero los anteriores
  // se conservan" — esta es la lista completa, más reciente primero;
  // el frontend decide qué mostrar arriba y qué guardar como
  // histórico.
  async listReadings(encounterId: string): Promise<AssistantReadingSummary[]> {
    const rows = await this.prisma.assistantReading.findMany({
      where: { encounterId },
      orderBy: { createdAt: "desc" },
      select: { id: true, pase: true, readingJson: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      pase: row.pase,
      reading: row.readingJson as unknown as AssistantReading,
      createdAt: row.createdAt,
    }));
  }

  private async spentTokens(encounterId: string): Promise<number> {
    const agg = await this.prisma.assistantReading.aggregate({
      where: { encounterId },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
  }
}
