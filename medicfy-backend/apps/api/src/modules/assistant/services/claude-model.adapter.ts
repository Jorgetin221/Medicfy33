import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { assistantModelOutputSchema, type AssistantModelOutput, type AssistantPass } from "@medicfy/contracts";
import type {
  AssistantModelCallInput,
  AssistantModelOutcome,
  AssistantModelPort,
} from "./assistant-model.port";

// Fase 8 · Prompt 51 — adaptador real contra la API de Claude. Puerto/
// adaptador (mismo patrón que NOTIFICATION_PORT/FILE_STORAGE_PORT):
// nada del orquestador conoce el SDK de Anthropic, así que las
// pruebas de disparo/cancelación/tope de gasto usan un doble de
// prueba y nunca llaman a la red.
//
// ANTHROPIC_API_KEY se lee de forma PEREZOSA (al llamar, no al
// construir el servicio): el resto de la aplicación debe poder
// arrancar y servir cada otra funcionalidad sin esta clave — solo el
// asistente se degrada ("DEGRADACIÓN HONESTA", Prompt 51) si falta.
const TOOL_NAME = "emitir_lectura_clinica";
const DEFAULT_MODEL_ID = "claude-sonnet-5";
const PROMPT_VERSION = "p51-v1";
// 4096 se quedaba corto en un caso clínico real con varios
// diferenciales detallados: el modelo llenaba diferenciales/
// estudios_sugeridos y se quedaba sin espacio para
// plan_sugerido/no_puedo_saber/fuentes (los últimos campos del
// contrato), y esas claves faltantes fallaban la validación —
// confirmado con una llamada real durante Prompt 51.
const MAX_OUTPUT_TOKENS = 8192;

// Lista cerrada de autoridades clínicas, a petición explícita del
// usuario (2026-09-02): toda cita en `fuentes` debe venir de aquí, no
// de cualquier fuente que el modelo recuerde. Fuera de alcance de
// hoy, por decisión explícita del usuario tras el conflicto
// señalado (dosis exacta como campo primario, formato de documento
// en vez de JSON estructurado): eso queda pendiente hasta que exista
// el filtro de seguridad server-side (Prompt 52).
const AUTHORITY_SOURCES = [
  "NIH", "CDC", "AHA", "ADA", "ACC", "IDSA", // EE.UU.
  "NICE", "SIGN", // Reino Unido
  "OMS", // Global
  "GPC/CENETEC (México)",
  "UpToDate y consensos de sociedades médicas revisados por pares",
].join(", ");

const PASS_INSTRUCTIONS: Record<AssistantPass, string> = {
  SUBJETIVO:
    "Pase 1, disparado justo después de que el médico terminó de capturar el subjetivo (motivo de consulta y padecimiento actual). Concéntrate en qué falta preguntar (falta_por_preguntar) y en banderas rojas del relato (banderas_rojas). Todavía puede no haber información suficiente para diferenciales — 0 diferenciales es una respuesta válida y honesta en este pase.",
  OBJETIVO:
    "Pase 2, disparado tras la exploración física. Ahora sí sugiere diferenciales preliminares (diferenciales), siempre con a_favor y en_contra, nunca uno solo.",
  ANALISIS:
    "Pase 3, disparado tras el análisis del médico. Afina los diferenciales con lo que el médico ya razonó, sugiere estudios (estudios_sugeridos) y una conducta (plan_sugerido).",
  CIERRE:
    "Pase 4, disparado cuando el médico pide cerrar la consulta. Haz una revisión final de todo lo capturado: no introduzcas hallazgos nuevos que no se puedan sostener con el contexto ya dado, señala si algo quedó sin explorar.",
};

// Sin $refStrategy:"none" el esquema sale envuelto en {$ref,
// definitions}; Anthropic espera un JSON Schema autocontenido en
// input_schema. superRefine (el conteo de diferenciales, la
// integridad referencial fuente_id/afirmacion_id) no es representable
// en JSON Schema — se pierde aquí a propósito; sigue aplicándose
// completo del lado del servidor en validateModelOutput() más abajo,
// antes de que la respuesta exista para nadie.
// zod-to-json-schema's generic inference chokes on this schema's
// ZodEffects wrapper ("Type instantiation is excessively deep") — a
// known friction point of that library with .superRefine() on a
// large object. Untyped function reference sidesteps it at the type
// level only; the runtime call (and its output) is unaffected —
// verified against the actual JSON Schema output in this module's
// tests.
const untypedZodToJsonSchema = zodToJsonSchema as (schema: unknown, options: unknown) => Record<string, unknown>;

function buildInputSchema(): Anthropic.Tool.InputSchema {
  const { $schema: _omit, ...schema } = untypedZodToJsonSchema(assistantModelOutputSchema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });
  return schema as Anthropic.Tool.InputSchema;
}

const READING_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Emite la lectura clínica estructurada de este pase. Es la ÚNICA forma de responder: nunca texto libre, nunca markdown, nunca una explicación fuera de esta herramienta.",
  input_schema: buildInputSchema(),
  // strict:true rechaza el schema real (Anthropic no soporta
  // minimum/maximum en propiedades number con validación estricta:
  // "For 'number' type, properties maximum, minimum are not
  // supported", confirmado con una llamada real durante Prompt 51).
  // No hace falta: assistantModelOutputSchema.safeParse() ya vuelve a
  // validar TODO server-side (incluidos los rangos y las reglas de
  // superRefine que JSON Schema no puede expresar de todas formas),
  // con reintento si falla.
};

function buildSystemPrompt(pase: AssistantPass): string {
  return [
    "Eres 'El Segundo Lector' de Medicfy: un asistente clínico de soporte técnico de alto nivel para médicos generales y especialistas, NUNCA quien diagnostica ni prescribe. El médico es siempre quien decide; tú solo señalas qué mirar, por qué, y con qué respaldo. Tu tono es formal, técnico y preciso — escribes para un lector médico, nunca en lenguaje coloquial.",
    "Reglas que no puedes romper:",
    "- Todo lo que digas se basa EXCLUSIVAMENTE en el contexto que recibes en este mensaje. Si algo no está ahí, va en no_puedo_saber — nunca lo inventas ni lo asumes.",
    "- Nunca sugieras un solo diferencial: cero, o al menos dos, cada uno con a_favor y en_contra. Nunca un diagnóstico definitivo — siempre como diferencial, probable o sospecha diagnóstica.",
    "- probabilidad_relativa es siempre cualitativa (alta/media/baja) — nunca un porcentaje, sería precisión que no puedes respaldar.",
    `- Toda fuente que cites en \`fuentes\` debe venir de esta lista cerrada de autoridades clínicas, nunca de otra procedencia: ${AUTHORITY_SOURCES}.`,
    "- Toda afirmación de plan_sugerido que puedas respaldar con una fuente real de esa lista va con su fuente_id correspondiente en `fuentes`; si no tienes fuente de esa lista, fuente_id es null — nunca inventes una referencia ni cites una fuente fuera de la lista.",
    "- Cada entrada de `fuentes` lleva su propio id (\"f1\", \"f2\"...) y un afirmacion_id que DEBE ser el id de un elemento que ya emitiste en esta misma respuesta (un hallazgo_clave, una bandera_roja, un diferencial, una pregunta/maniobra pendiente, un estudio sugerido o una intervención de plan_sugerido) — nunca un id inventado ni el nombre del campo. Si no hay ningún elemento al que asociar una fuente, no emitas esa fuente.",
    "- plan_sugerido describe la intervención a nivel conceptual (qué hacer y por qué), NUNCA con una dosis, vía o duración numérica específica — la verificación de dosis contra catálogo licenciado todavía no existe en este sistema, así que una dosis exacta tuya no se puede verificar antes de llegar al médico.",
    "- Cuando el contexto incluya medicación vigente o alergias del paciente, razona explícitamente sobre interacciones, contraindicaciones o riesgos relevantes de comorbilidades en hallazgos_clave o banderas_rojas — no lo omitas por brevedad.",
    "- confianza_global y por_que_esa_confianza son tu propia autoevaluación honesta, no una formalidad.",
    `- ${PASS_INSTRUCTIONS[pase]}`,
    "Respondes ÚNICAMENTE llamando a la herramienta emitir_lectura_clinica — nunca con texto.",
  ].join("\n");
}

function buildUserMessage(input: AssistantModelCallInput): string {
  return [
    `Contexto de la consulta (paciente ya seudonimizado por el servidor; hash_contexto=${input.hashContexto}):`,
    "```json",
    JSON.stringify(input.context, null, 2),
    "```",
    "Emite tu lectura para este pase llamando a la herramienta.",
  ].join("\n");
}

function validateModelOutput(rawInput: unknown): AssistantModelOutput | null {
  const parsed = assistantModelOutputSchema.safeParse(rawInput);
  return parsed.success ? parsed.data : null;
}

@Injectable()
export class ClaudeModelAdapter implements AssistantModelPort {
  private readonly logger = new Logger(ClaudeModelAdapter.name);
  private client: Anthropic | null = null;

  private getClient(): Anthropic | null {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    if (!this.client) this.client = new Anthropic({ apiKey });
    return this.client;
  }

  async generateReading(input: AssistantModelCallInput): Promise<AssistantModelOutcome> {
    const client = this.getClient();
    if (!client) return { kind: "unavailable", reason: "NOT_CONFIGURED" };

    const modelId = process.env.ASSISTANT_MODEL_ID ?? DEFAULT_MODEL_ID;
    const system = buildSystemPrompt(input.pase);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserMessage(input) }];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Un reintento: si el modelo emite algo que no cumple el
    // contrato (Prompt 49), se lo decimos y le damos una sola
    // oportunidad más — "un prompt bien escrito reduce el riesgo, no
    // lo elimina" (Prompt 52). A la segunda falla, degradación
    // honesta en vez de mostrar algo inválido.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(
          {
            model: modelId,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages,
            tools: [READING_TOOL],
            tool_choice: { type: "tool", name: TOOL_NAME, disable_parallel_tool_use: true },
          },
          { signal: input.signal }
        );
      } catch (error) {
        if (error instanceof Anthropic.APIUserAbortError) return { kind: "cancelled" };
        this.logger.error(`Claude call failed for pase=${input.pase}: ${(error as Error).message}`);
        return { kind: "unavailable", reason: "PROVIDER_ERROR" };
      }

      totalInputTokens += message.usage.input_tokens;
      totalOutputTokens += message.usage.output_tokens;

      const toolUse = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME
      );
      const modelOutput = toolUse ? validateModelOutput(toolUse.input) : null;
      if (!modelOutput) {
        // R2: nunca el contenido, solo la FORMA del fallo — rutas y
        // códigos de Zod, nunca un valor de campo. stop_reason/
        // output_tokens ayudan a distinguir un corte por max_tokens
        // de un problema real del contrato (fue justo así como se
        // encontraron ambos bugs reales de Prompt 51: el primero era
        // truncamiento por max_tokens, el segundo un afirmacion_id
        // mal construido).
        const parsed = toolUse ? assistantModelOutputSchema.safeParse(toolUse.input) : null;
        const issues = parsed && !parsed.success ? parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`) : ["no toolUse"];
        this.logger.warn(
          `Model output failed validation (pase=${input.pase}, attempt=${attempt}, stop_reason=${message.stop_reason}, output_tokens=${message.usage.output_tokens}): ${issues.join(", ")}`
        );
      }

      if (modelOutput) {
        const reading = {
          meta: {
            version_modelo: modelId,
            version_prompt: PROMPT_VERSION,
            pase: input.pase,
            momento: new Date().toISOString(),
            hash_contexto: input.hashContexto,
            confianza_global: modelOutput.confianza_global,
            por_que_esa_confianza: modelOutput.por_que_esa_confianza,
          },
          resumen: modelOutput.resumen,
          hallazgos_clave: modelOutput.hallazgos_clave,
          banderas_rojas: modelOutput.banderas_rojas,
          diferenciales: modelOutput.diferenciales,
          falta_por_preguntar: modelOutput.falta_por_preguntar,
          falta_por_explorar: modelOutput.falta_por_explorar,
          estudios_sugeridos: modelOutput.estudios_sugeridos,
          plan_sugerido: modelOutput.plan_sugerido,
          no_puedo_saber: modelOutput.no_puedo_saber,
          fuentes: modelOutput.fuentes,
        };
        return {
          kind: "ok",
          result: {
            reading,
            modelVersion: modelId,
            promptVersion: PROMPT_VERSION,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
        };
      }

      if (attempt === 0 && toolUse) {
        const parseErrors = assistantModelOutputSchema.safeParse(toolUse.input);
        const errorDetail = !parseErrors.success ? parseErrors.error.message : "salida vacía";
        // La API exige que todo tool_use tenga su tool_result
        // correspondiente en el siguiente mensaje — un user turn de
        // solo texto después de un tool_use es rechazado (400,
        // confirmado con una llamada real). is_error:true es la forma
        // estándar de decirle al modelo "tu llamada falló, intenta de
        // nuevo" dentro del protocolo de tool-use.
        messages.push(
          { role: "assistant", content: message.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                is_error: true,
                content: `Tu respuesta no cumplió el contrato: ${errorDetail}. Vuelve a llamar a emitir_lectura_clinica corrigiendo exactamente eso.`,
              },
            ],
          }
        );
      }
    }

    return { kind: "unavailable", reason: "INVALID_OUTPUT" };
  }
}
