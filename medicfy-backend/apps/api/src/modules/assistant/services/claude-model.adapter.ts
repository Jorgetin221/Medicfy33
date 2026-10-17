import { Injectable, Logger } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  AssistantModelCallInput,
  AssistantModelOutcome,
  AssistantModelPort,
  AssistantSummaryCallInput,
  AssistantSummaryOutcome,
} from "./assistant-model.port";
import { createClaudeClient, generateReadingWithClaude, generateSummaryWithClaude } from "./claude-model-calls";

export { buildSummarySystemPrompt, buildSystemPrompt } from "./claude-model-calls";

// Fase 8 · Prompt 51 — envoltura Nest del adaptador real contra la API
// de Claude. Puerto/adaptador (mismo patrón que NOTIFICATION_PORT/
// FILE_STORAGE_PORT): nada del orquestador conoce el SDK de Anthropic,
// así que las pruebas de disparo/cancelación/tope de gasto usan un
// doble de prueba y nunca llaman a la red. La lógica de la llamada vive
// en claude-model-calls.ts (compartida con el mock local).
@Injectable()
export class ClaudeModelAdapter implements AssistantModelPort {
  private readonly logger = new Logger(ClaudeModelAdapter.name);
  private client: Anthropic | null = null;

  // "DEGRADACIÓN HONESTA" (Prompt 51): sin clave, NOT_CONFIGURED.
  private getClient(): Anthropic | null {
    if (!this.client) this.client = createClaudeClient();
    return this.client;
  }

  async generateReading(input: AssistantModelCallInput): Promise<AssistantModelOutcome> {
    const client = this.getClient();
    if (!client) return { kind: "unavailable", reason: "NOT_CONFIGURED" };
    return generateReadingWithClaude(client, input, this.logger);
  }

  async generateSummary(input: AssistantSummaryCallInput): Promise<AssistantSummaryOutcome> {
    const client = this.getClient();
    if (!client) return { kind: "unavailable", reason: "NOT_CONFIGURED" };
    return generateSummaryWithClaude(client, input, this.logger);
  }
}
