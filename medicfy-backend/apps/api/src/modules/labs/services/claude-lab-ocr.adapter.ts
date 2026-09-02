import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { LabOcrConfidence, LabOcrExtractInput, LabOcrOutcome, LabOcrPort, LabOcrRawCandidate } from "./lab-ocr.port";

// Capa 1 (v2.5) — adaptador real contra la API de Claude con visión,
// reemplaza AWS Textract (decisión explícita del usuario, 2026-09-02):
// reutiliza ANTHROPIC_API_KEY, ya configurada para "El Segundo
// Lector", en vez de una integración de AWS aparte. Mismo patrón de
// degradación honesta y puerto/adaptador que ClaudeModelAdapter —
// clave leída de forma perezosa, nunca bloquea el arranque.
//
// La "clasificación de campos por contenido, no por posición de
// columnas" (pedido explícito del usuario) ahora la hace el propio
// modelo al leer la imagen — entiende qué texto es el nombre del
// analito, cuál es el resultado, cuál la unidad y cuál el rango,
// exactamente igual que un lector humano, sin asumir un layout fijo.
const OCR_TOOL_NAME = "emitir_extraccion_hoja_laboratorio";
const DEFAULT_MODEL_ID = "claude-sonnet-5";
// Un panel de laboratorio completo (química de 27 elementos + BH +
// EGO) puede traer 40+ analitos — más alto que el resumen objetivo,
// más bajo que la lectura clínica completa (que además narra, no solo
// lista pares nombre-valor).
const MAX_OUTPUT_TOKENS = 4096;

const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const ocrCandidateSchema = z
  .object({
    analyteNameRaw: z.string().min(1),
    valueRaw: z.string().min(1),
    unitRaw: z.string().nullable(),
    referenceMinPrinted: z.number().nullable(),
    referenceMaxPrinted: z.number().nullable(),
    // Pedido explícito del usuario: confianza propia del modelo, 0-1,
    // honesta — nunca inventar un valor ilegible, marcarlo con
    // confianza baja en su lugar. Se traduce a LOW/MEDIUM/HIGH aquí
    // en el adaptador antes de salir por el puerto — el resto de la
    // arquitectura (Capas 2-4, LabSheetExtractionService, el
    // contrato de revisión) sigue viendo únicamente ese enum, sin
    // cambio alguno.
    confidence: z.number().min(0).max(1),
  })
  .strict();

const ocrOutputSchema = z
  .object({
    labNameDetected: z.string().nullable(),
    resultDateDetected: z.string().nullable(),
    candidates: z.array(ocrCandidateSchema),
  })
  .strict();
type OcrOutput = z.infer<typeof ocrOutputSchema>;

const untypedZodToJsonSchema = zodToJsonSchema as (schema: unknown, options: unknown) => Record<string, unknown>;

function buildInputSchema(): Anthropic.Tool.InputSchema {
  const { $schema: _omit, ...schema } = untypedZodToJsonSchema(ocrOutputSchema, { $refStrategy: "none", target: "jsonSchema7" });
  return schema as Anthropic.Tool.InputSchema;
}

const OCR_TOOL: Anthropic.Tool = {
  name: OCR_TOOL_NAME,
  description: "Emite la extracción estructurada de la hoja de laboratorio. Es la ÚNICA forma de responder.",
  input_schema: buildInputSchema(),
  // Sin strict:true — Anthropic no soporta minimum/maximum en
  // propiedades number con validación estricta (mismo hallazgo ya
  // documentado en claude-model.adapter.ts). ocrOutputSchema.safeParse()
  // ya revalida los rangos completos del lado del servidor.
};

const SYSTEM_PROMPT = [
  "Eres un lector de hojas de laboratorio para Medicfy. Tu única tarea es TRANSCRIBIR lo que está impreso en la imagen o PDF que recibes — nunca interpretar, diagnosticar ni sugerir nada clínico.",
  "Identifica cada resultado por su CONTENIDO, no por su posición de columna: cada laboratorio maqueta su hoja distinto (tablas, pares clave-valor, layouts mixtos). Para cada resultado que encuentres, reporta: el nombre del analito tal como aparece impreso, el valor del resultado, la unidad si está impresa, y el rango de referencia impreso (mínimo y máximo) si existe.",
  "Regla más importante: NUNCA inventes ni adivines un valor que no puedas leer con claridad — letra borrosa, mala resolución, corte de imagen, tachadura. En esos casos, transcribe tu mejor lectura de todas formas pero con confidence baja (cercano a 0), en vez de omitir el analito o rellenar con un valor que no viste con certeza.",
  "confidence es un número entre 0 y 1: tu propia certeza honesta de haber leído ese analito completo (nombre, valor, unidad, rango) correctamente. 1 = perfectamente legible y sin ambigüedad. Valores cercanos a 0 para cualquier duda real, no solo para lo totalmente ilegible.",
  "Si la hoja indica el nombre del laboratorio, repórtalo en labNameDetected; si indica una fecha del estudio/toma de muestra, repórtala en resultDateDetected como AAAA-MM-DD. Si no puedes determinar alguno de los dos con certeza, usa null — nunca inventes un nombre de laboratorio o una fecha.",
  "unitRaw, referenceMinPrinted y referenceMaxPrinted van en null cuando la hoja no los imprime para ese analito — no los inventes ni los calcules.",
  "Respondes ÚNICAMENTE llamando a la herramienta emitir_extraccion_hoja_laboratorio — nunca con texto libre.",
].join("\n");

function confidenceBucket(value: number): LabOcrConfidence {
  if (value < 0.7) return "LOW";
  if (value < 0.9) return "MEDIUM";
  return "HIGH";
}

function toRawCandidates(output: OcrOutput): LabOcrRawCandidate[] {
  return output.candidates.map((c) => ({
    analyteNameRaw: c.analyteNameRaw,
    valueRaw: c.valueRaw,
    unitRaw: c.unitRaw,
    referenceMinPrinted: c.referenceMinPrinted,
    referenceMaxPrinted: c.referenceMaxPrinted,
    confidence: confidenceBucket(c.confidence),
  }));
}

function buildDocumentBlock(input: LabOcrExtractInput): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam {
  const base64 = input.buffer.toString("base64");
  if (input.contentType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  if (IMAGE_MEDIA_TYPES.has(input.contentType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: input.contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 },
    };
  }
  // labResultFileFilter (common/upload-validation.util.ts) solo deja
  // pasar application/pdf, image/jpeg e image/png — este caso no
  // debería alcanzarse nunca en producción; si algún día cambia el
  // filtro sin actualizar aquí, degradar honesto es mejor que un
  // 500 opaco.
  throw new Error(`Tipo de archivo no soportado por la visión de Claude: ${input.contentType}`);
}

@Injectable()
export class ClaudeLabOcrAdapter implements LabOcrPort {
  private readonly logger = new Logger(ClaudeLabOcrAdapter.name);
  private client: Anthropic | null = null;

  private getClient(): Anthropic | null {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    if (!this.client) this.client = new Anthropic({ apiKey });
    return this.client;
  }

  async extract(input: LabOcrExtractInput): Promise<LabOcrOutcome> {
    const client = this.getClient();
    if (!client) return { kind: "unavailable", reason: "NOT_CONFIGURED" };

    let documentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam;
    try {
      documentBlock = buildDocumentBlock(input);
    } catch (error) {
      this.logger.error(`Lab OCR: ${(error as Error).message}`);
      return { kind: "unavailable", reason: "PROVIDER_ERROR" };
    }

    const modelId = process.env.ASSISTANT_MODEL_ID ?? DEFAULT_MODEL_ID;
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [documentBlock, { type: "text", text: "Extrae los resultados de esta hoja de laboratorio llamando a la herramienta." }],
      },
    ];

    // Un reintento si la salida no cumple el contrato — mismo patrón
    // que ClaudeModelAdapter.generateReading().
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(
          {
            model: modelId,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: SYSTEM_PROMPT,
            messages,
            tools: [OCR_TOOL],
            tool_choice: { type: "tool", name: OCR_TOOL_NAME, disable_parallel_tool_use: true },
          },
          { signal: input.signal }
        );
      } catch (error) {
        if (error instanceof Anthropic.APIUserAbortError) return { kind: "cancelled" };
        this.logger.error(`Lab OCR call failed: ${(error as Error).message}`);
        return { kind: "unavailable", reason: "PROVIDER_ERROR" };
      }

      const toolUse = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === OCR_TOOL_NAME
      );
      const parsed = toolUse ? ocrOutputSchema.safeParse(toolUse.input) : null;

      if (parsed?.success) {
        return {
          kind: "ok",
          result: {
            labNameDetected: parsed.data.labNameDetected,
            resultDateDetected: parsed.data.resultDateDetected,
            candidates: toRawCandidates(parsed.data),
          },
        };
      }

      // R2: nunca el contenido, solo la forma del fallo.
      const issues = parsed && !parsed.success ? parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`) : ["no toolUse"];
      this.logger.warn(`Lab OCR output failed validation (attempt=${attempt}, stop_reason=${message.stop_reason}): ${issues.join(", ")}`);

      if (attempt === 0 && toolUse) {
        const errorDetail = parsed && !parsed.success ? parsed.error.message : "salida vacía";
        messages.push(
          { role: "assistant", content: message.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                is_error: true,
                content: `Tu respuesta no cumplió el contrato: ${errorDetail}. Vuelve a llamar a ${OCR_TOOL_NAME} corrigiendo exactamente eso.`,
              },
            ],
          }
        );
      }
    }

    return { kind: "unavailable", reason: "INVALID_OUTPUT" };
  }
}
